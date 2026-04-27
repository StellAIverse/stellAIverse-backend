import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { OpenAIProviderAdapter } from "./openai-provider.adapter";
import {
  NormalizedPrompt,
  Tool,
  FunctionDefinition,
  FunctionCall,
} from "./dto/provider.dto";
import axios from "axios";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

(mockedAxios.isAxiosError as unknown as jest.Mock) = jest.fn();

describe("OpenAIProviderAdapter", () => {
  let adapter: OpenAIProviderAdapter;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        OPENAI_API_KEY: "test-api-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_MAX_RETRIES: 3,
        OPENAI_RETRY_DELAY: 1000,
      };
      return config[key] || defaultValue;
    }),
  };

  // Helper to create mock OpenAI responses
  const createMockOpenAIResponse = (
    content: string = "Test response",
    functionCall?: any,
    toolCalls?: any,
  ) => ({
    id: "chatcmpl-123",
    object: "chat.completion" as const,
    created: 1677652288,
    model: "gpt-4",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content,
          ...(functionCall && { function_call: functionCall }),
          ...(toolCalls && { tool_calls: toolCalls }),
        },
        finish_reason: functionCall
          ? "function_call"
          : toolCalls
            ? "tool_calls"
            : ("stop" as const),
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  });

  // Helper to create mock function definition
  const createMockFunctionDefinition = (
    name: string = "test_function",
  ): FunctionDefinition => ({
    name,
    description: "A test function",
    parameters: {
      type: "object",
      properties: {
        param1: { type: "string" },
        param2: { type: "number" },
      },
      required: ["param1"],
    },
  });

  // Helper to create mock tool
  const createMockTool = (name: string = "test_function"): Tool => ({
    type: "function",
    function: createMockFunctionDefinition(name),
  });

  // Helper to create mock function call
  const createMockFunctionCall = (
    name: string = "test_function",
    args: string = '{"param1": "value"}',
  ): FunctionCall => ({
    name,
    arguments: args,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup isAxiosError mock to recognize test error objects
    (mockedAxios.isAxiosError as unknown as jest.Mock).mockImplementation(
      (error) => {
        return error && error.isAxiosError === true;
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIProviderAdapter,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    adapter = module.get<OpenAIProviderAdapter>(OpenAIProviderAdapter);

    // Setup axios mock
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn(), eject: jest.fn() },
        response: { use: jest.fn(), eject: jest.fn() },
      },
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("normalizePrompt", () => {
    it("should normalize a basic prompt correctly", () => {
      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "Hello, world!" }],
      };

      const normalized = adapter.normalizePrompt(prompt);

      expect(normalized).toHaveProperty("model");
      expect(normalized.messages).toHaveLength(1);
      expect(normalized.messages[0]).toEqual({
        role: "user",
        content: "Hello, world!",
      });
    });

    it("should include optional parameters when provided", () => {
      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "Test" }],
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        stop: ["END"],
      };

      const normalized = adapter.normalizePrompt(prompt);

      expect(normalized.temperature).toBe(0.7);
      expect(normalized.max_tokens).toBe(100);
      expect(normalized.top_p).toBe(0.9);
      expect(normalized.stop).toEqual(["END"]);
    });

    it("should clamp temperature to valid range", () => {
      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "Test" }],
        temperature: 3.0,
      };

      const normalized = adapter.normalizePrompt(prompt);
      expect(normalized.temperature).toBe(2.0);
    });

    it("should throw error for empty messages", () => {
      const prompt: NormalizedPrompt = {
        messages: [],
      };

      expect(() => adapter.normalizePrompt(prompt)).toThrow(
        "Messages array is required and cannot be empty",
      );
    });

    it('should normalize unknown roles to "user"', () => {
      const prompt: NormalizedPrompt = {
        messages: [{ role: "unknown", content: "Test" }],
      };

      const normalized = adapter.normalizePrompt(prompt);
      expect(normalized.messages[0].role).toBe("user");
    });
  });

  describe("validateResponse", () => {
    it("should validate a correct OpenAI response", () => {
      const validResponse = {
        id: "chatcmpl-123",
        object: "chat.completion" as const,
        created: 1677652288,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant" as const,
              content: "Hello! How can I help you?",
            },
            finish_reason: "stop" as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      expect(() => adapter.validateResponse(validResponse)).not.toThrow();
    });

    it("should throw error for missing id", () => {
      const invalidResponse = {
        object: "chat.completion",
        created: 1677652288,
        model: "gpt-4",
        choices: [],
      };

      expect(() => adapter.validateResponse(invalidResponse)).toThrow(
        'Response missing valid "id" field',
      );
    });

    it("should throw error for wrong object type", () => {
      const invalidResponse = {
        id: "test",
        object: "wrong_type",
        created: 1677652288,
        model: "gpt-4",
        choices: [],
      };

      expect(() => adapter.validateResponse(invalidResponse)).toThrow(
        "Invalid response object type",
      );
    });

    it("should throw error for empty choices array", () => {
      const invalidResponse = {
        id: "test",
        object: "chat.completion",
        created: 1677652288,
        model: "gpt-4",
        choices: [],
      };

      expect(() => adapter.validateResponse(invalidResponse)).toThrow(
        'Response missing valid "choices" array',
      );
    });

    it("should throw error for choice missing message", () => {
      const invalidResponse = {
        id: "test",
        object: "chat.completion",
        created: 1677652288,
        model: "gpt-4",
        choices: [{ index: 0 }],
      };

      expect(() => adapter.validateResponse(invalidResponse)).toThrow(
        'Choice 0 missing "message" field',
      );
    });
  });

  describe("normalizeResponse", () => {
    it("should convert OpenAI response to normalized format", () => {
      const openAIResponse = createMockOpenAIResponse("Test response");

      const normalized = adapter.normalizeResponse(openAIResponse);

      expect(normalized.id).toBe("chatcmpl-123");
      expect(normalized.provider).toBe("openai");
      expect(normalized.model).toBe("gpt-4");
      expect(normalized.content).toBe("Test response");
      expect(normalized.role).toBe("assistant");
      expect(normalized.finishReason).toBe("stop");
      expect(normalized.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(normalized.created).toBeInstanceOf(Date);
    });
  });

  describe("handleError", () => {
    it("should handle 401 authentication error", () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            error: {
              code: "invalid_api_key",
              message: "Invalid API key",
              type: "invalid_request_error",
            },
          },
        },
        message: "Request failed with status code 401",
      };

      const error = adapter.handleError(axiosError);

      expect(error.provider).toBe("openai");
      expect(error.status).toBe(401);
      expect(error.code).toBe("invalid_api_key");
      expect(error.retryable).toBe(false);
    });

    it("should handle 429 rate limit error as retryable", () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 429,
          data: {
            error: {
              message: "Rate limit exceeded",
              type: "rate_limit_error",
            },
          },
        },
        message: "Request failed with status code 429",
      };

      const error = adapter.handleError(axiosError);

      expect(error.status).toBe(429);
      expect(error.code).toBe("HTTP_429");
      expect(error.retryable).toBe(true);
    });

    it("should handle network errors", () => {
      const networkError = {
        isAxiosError: true,
        message: "Network Error",
        code: "ECONNABORTED",
      };

      const error = adapter.handleError(networkError);

      expect(error.code).toBe("NETWORK_ERROR");
      expect(error.retryable).toBe(true);
    });

    it("should handle unknown errors", () => {
      const unknownError = new Error("Something went wrong");

      // Mock isAxiosError to return false for non-axios errors
      (mockedAxios.isAxiosError as unknown as jest.Mock).mockReturnValueOnce(
        false,
      );

      const error = adapter.handleError(unknownError);

      expect(error.code).toBe("UNKNOWN_ERROR");
      expect(error.retryable).toBe(false);
    });
  });

  describe("execute", () => {
    it("should successfully execute a request", async () => {
      const mockResponse = {
        data: createMockOpenAIResponse("Hello!"),
      };

      const mockClient = {
        post: jest.fn().mockResolvedValue(mockResponse),
      };

      (adapter as any).client = mockClient;

      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "Hi" }],
      };

      const result = await adapter.execute(prompt);

      expect(result.content).toBe("Hello!");
      expect(result.provider).toBe("openai");
      expect(mockClient.post).toHaveBeenCalledWith(
        "/chat/completions",
        expect.any(Object),
      );
    });

    it("should retry on retryable errors", async () => {
      // First attempt fails with retryable error (429)
      const retryableError = {
        isAxiosError: true,
        response: {
          status: 429,
          data: {
            error: {
              message: "Rate limit exceeded",
              type: "rate_limit_error",
            },
          },
        },
        message: "Rate limit exceeded",
      };

      // Second attempt succeeds
      const successResponse = {
        data: createMockOpenAIResponse("Success"),
      };

      const mockClient = {
        post: jest
          .fn()
          .mockRejectedValueOnce(retryableError)
          .mockResolvedValueOnce(successResponse),
      };

      (adapter as any).client = mockClient;

      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await adapter.execute(prompt);

      expect(result.content).toBe("Success");
      expect(mockClient.post).toHaveBeenCalledTimes(2);
    });
  });

  describe("function calling", () => {
    it("should normalize prompt with functions", () => {
      const functions = [createMockFunctionDefinition("get_weather")];
      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "What's the weather?" }],
        functions,
        functionCall: { name: "get_weather" },
      };

      const normalized = adapter.normalizePrompt(prompt);

      expect(normalized.functions).toEqual(functions);
      expect(normalized.function_call).toEqual({ name: "get_weather" });
    });

    it("should normalize prompt with tools", () => {
      const tools = [createMockTool("get_weather")];
      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "What's the weather?" }],
        tools,
        toolChoice: { type: "function", function: { name: "get_weather" } },
      };

      const normalized = adapter.normalizePrompt(prompt);

      expect(normalized.tools).toEqual(tools);
      expect(normalized.tool_choice).toEqual({
        type: "function",
        function: { name: "get_weather" },
      });
    });

    it("should normalize response with function call", () => {
      const functionCall = createMockFunctionCall(
        "get_weather",
        '{"city": "NYC"}',
      );
      const openAIResponse = createMockOpenAIResponse("", functionCall);

      const normalized = adapter.normalizeResponse(openAIResponse);

      expect(normalized.functionCall).toEqual(functionCall);
      expect(normalized.finishReason).toBe("function_call");
    });

    it("should normalize response with tool calls", () => {
      const toolCalls = [
        {
          id: "call_123",
          type: "function" as const,
          function: createMockFunctionCall("get_weather", '{"city": "NYC"}'),
        },
      ];
      const openAIResponse = createMockOpenAIResponse("", undefined, toolCalls);

      const normalized = adapter.normalizeResponse(openAIResponse);

      expect(normalized.toolCalls).toEqual(toolCalls);
    });

    it("should handle tool role in messages", () => {
      const prompt: NormalizedPrompt = {
        messages: [
          { role: "user", content: "What's the weather?" },
          {
            role: "tool",
            content: '{"temperature": "72°F"}',
            toolCallId: "call_123",
          },
        ],
      };

      const normalized = adapter.normalizePrompt(prompt);

      expect(normalized.messages[1].role).toBe("tool");
      expect(normalized.messages[1].tool_call_id).toBe("call_123");
    });

    it("should execute function call request successfully", async () => {
      const functionCall = createMockFunctionCall(
        "get_weather",
        '{"city": "NYC"}',
      );
      const mockResponse = {
        data: createMockOpenAIResponse("", functionCall),
      };

      const mockClient = {
        post: jest.fn().mockResolvedValue(mockResponse),
      };

      (adapter as any).client = mockClient;

      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "What's the weather in NYC?" }],
        functions: [createMockFunctionDefinition("get_weather")],
      };

      const result = await adapter.execute(prompt);

      expect(result.functionCall).toEqual(functionCall);
      expect(result.finishReason).toBe("function_call");
    });
  });

  describe("backwards compatibility", () => {
    it("should handle prompts without function calling", () => {
      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
      };

      const normalized = adapter.normalizePrompt(prompt);

      expect(normalized.functions).toBeUndefined();
      expect(normalized.function_call).toBeUndefined();
      expect(normalized.tools).toBeUndefined();
      expect(normalized.tool_choice).toBeUndefined();
    });

    it("should handle responses without function calling", () => {
      const openAIResponse = createMockOpenAIResponse("Hello!");

      const normalized = adapter.normalizeResponse(openAIResponse);

      expect(normalized.functionCall).toBeUndefined();
      expect(normalized.toolCalls).toBeUndefined();
      expect(normalized.content).toBe("Hello!");
    });

    it("should maintain existing API behavior", async () => {
      const mockResponse = {
        data: createMockOpenAIResponse("Test response"),
      };

      const mockClient = {
        post: jest.fn().mockResolvedValue(mockResponse),
      };

      (adapter as any).client = mockClient;

      const prompt: NormalizedPrompt = {
        messages: [{ role: "user", content: "Hi" }],
      };

      const result = await adapter.execute(prompt);

      expect(result.content).toBe("Test response");
      expect(result.provider).toBe("openai");
      expect(result.functionCall).toBeUndefined();
      expect(result.toolCalls).toBeUndefined();
    });
  });

  describe("healthCheck", () => {
    it("should return true when API is healthy", async () => {
      const mockClient = {
        get: jest.fn().mockResolvedValue({ status: 200 }),
      };

      (adapter as any).client = mockClient;

      const result = await adapter.healthCheck();

      expect(result).toBe(true);
      expect(mockClient.get).toHaveBeenCalledWith("/models");
    });

    it("should return false when API is unhealthy", async () => {
      const mockClient = {
        get: jest.fn().mockRejectedValue(new Error("API Error")),
      };

      (adapter as any).client = mockClient;

      const result = await adapter.healthCheck();

      expect(result).toBe(false);
    });
  });
});
