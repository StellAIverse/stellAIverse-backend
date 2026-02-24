export interface IAIProvider {
  getModelInfo(model: string): Promise<any>;
  chatCompletion(payload: any): Promise<any>;
  embedding(payload: any): Promise<any>;
}

export interface IProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export enum AIProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  CUSTOM = 'custom',
}