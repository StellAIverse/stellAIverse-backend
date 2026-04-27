import { SetMetadata } from "@nestjs/common";
import { AIProviderType } from "./provider.interface";

export const PROVIDER_METADATA_KEY = "ai:provider";

/**
 * Provider decorator for auto-registration
 *
 * @example
 * @Provider(AIProviderType.OPENAI)
 * export class OpenAIProvider extends BaseAIProvider {
 *   // implementation
 * }
 */
export const Provider = (type: AIProviderType) =>
  SetMetadata(PROVIDER_METADATA_KEY, type);
