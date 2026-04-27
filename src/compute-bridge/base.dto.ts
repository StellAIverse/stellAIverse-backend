import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AIProviderType } from "./provider.interface";

/**
 * Base Request DTO
 *
 * Common fields for all AI provider requests
 */
export class BaseRequestDto {
  @ApiProperty({
    description: "AI provider to use for this request",
    enum: AIProviderType,
    example: AIProviderType.OPENAI,
  })
  @IsEnum(AIProviderType)
  provider: AIProviderType;

  @ApiProperty({
    description: "Model identifier",
    example: "gpt-4",
  })
  @IsString()
  model: string;

  @ApiPropertyOptional({
    description: "Request timeout in milliseconds",
    example: 30000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  timeout?: number;
}

/**
 * Message Role Enum
 */
export enum MessageRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
  FUNCTION = "function",
}

/**
 * Message DTO
 */
export class MessageDto {
  @ApiProperty({
    description: "Role of the message sender",
    enum: MessageRole,
    example: MessageRole.USER,
  })
  @IsEnum(MessageRole)
  role: MessageRole;

  @ApiProperty({
    description: "Content of the message",
    example: "Hello, how are you?",
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: "Name of the function (for function role)",
  })
  @IsOptional()
  @IsString()
  name?: string;
}

/**
 * Completion Request DTO
 *
 * Request structure for text completion/generation
 */
export class CompletionRequestDto extends BaseRequestDto {
  @ApiProperty({
    description: "Array of messages for the conversation",
    type: [MessageDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  messages: MessageDto[];

  @ApiPropertyOptional({
    description: "Temperature for randomness (0-2)",
    example: 0.7,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({
    description: "Maximum tokens to generate",
    example: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTokens?: number;

  @ApiPropertyOptional({
    description: "Top-p sampling parameter (0-1)",
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({
    description: "Enable streaming response",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @ApiPropertyOptional({
    description: "Stop sequences",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stop?: string[];
}

/**
 * Usage Statistics DTO
 */
export class UsageDto {
  @ApiProperty({
    description: "Number of tokens in the prompt",
    example: 50,
  })
  promptTokens: number;

  @ApiProperty({
    description: "Number of tokens in the completion",
    example: 100,
  })
  completionTokens: number;

  @ApiProperty({
    description: "Total number of tokens used",
    example: 150,
  })
  totalTokens: number;
}

/**
 * Completion Choice DTO
 */
export class CompletionChoiceDto {
  @ApiProperty({
    description: "Index of this choice",
    example: 0,
  })
  index: number;

  @ApiProperty({
    description: "Generated message",
    type: MessageDto,
  })
  message: MessageDto;

  @ApiProperty({
    description: "Reason for completion finish",
    example: "stop",
  })
  finishReason: string;
}

/**
 * Completion Response DTO
 *
 * Response structure for text completion/generation
 */
export class CompletionResponseDto {
  @ApiProperty({
    description: "Unique identifier for this completion",
    example: "chatcmpl-123",
  })
  id: string;

  @ApiProperty({
    description: "Object type",
    example: "chat.completion",
  })
  object: string;

  @ApiProperty({
    description: "Unix timestamp of creation",
    example: 1677652288,
  })
  created: number;

  @ApiProperty({
    description: "Model used for this completion",
    example: "gpt-4",
  })
  model: string;

  @ApiProperty({
    description: "Provider used for this completion",
    enum: AIProviderType,
  })
  provider: AIProviderType;

  @ApiProperty({
    description: "Array of completion choices",
    type: [CompletionChoiceDto],
  })
  choices: CompletionChoiceDto[];

  @ApiProperty({
    description: "Token usage statistics",
    type: UsageDto,
  })
  usage: UsageDto;
}

/**
 * Embedding Request DTO
 *
 * Request structure for embeddings generation
 */
export class EmbeddingRequestDto extends BaseRequestDto {
  @ApiProperty({
    description: "Input text or array of texts to embed",
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    example: "Hello, world!",
  })
  @IsString({ each: true })
  input: string | string[];

  @ApiPropertyOptional({
    description: "User identifier for tracking",
  })
  @IsOptional()
  @IsString()
  user?: string;
}

/**
 * Embedding Data DTO
 */
export class EmbeddingDataDto {
  @ApiProperty({
    description: "Index of this embedding",
    example: 0,
  })
  index: number;

  @ApiProperty({
    description: "Embedding vector",
    type: [Number],
    example: [0.1, 0.2, 0.3],
  })
  embedding: number[];

  @ApiProperty({
    description: "Object type",
    example: "embedding",
  })
  object: string;
}

/**
 * Embedding Response DTO
 *
 * Response structure for embeddings generation
 */
export class EmbeddingResponseDto {
  @ApiProperty({
    description: "Object type",
    example: "list",
  })
  object: string;

  @ApiProperty({
    description: "Array of embedding data",
    type: [EmbeddingDataDto],
  })
  data: EmbeddingDataDto[];

  @ApiProperty({
    description: "Model used for embeddings",
    example: "text-embedding-ada-002",
  })
  model: string;

  @ApiProperty({
    description: "Provider used for embeddings",
    enum: AIProviderType,
  })
  provider: AIProviderType;

  @ApiProperty({
    description: "Token usage statistics",
    type: UsageDto,
  })
  usage: UsageDto;
}

/**
 * Error Response DTO
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: "Error message",
    example: "Invalid API key",
  })
  message: string;

  @ApiProperty({
    description: "Error type",
    example: "authentication_error",
  })
  type: string;

  @ApiProperty({
    description: "HTTP status code",
    example: 401,
  })
  statusCode: number;

  @ApiPropertyOptional({
    description: "Provider that generated the error",
    enum: AIProviderType,
  })
  @IsOptional()
  provider?: AIProviderType;
}
