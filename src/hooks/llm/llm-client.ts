// Abstract LLM client interface
import type { LLMRequest, LLMResponse } from '../../types/index.js';

export interface LLMClient {
  generateResponse(request: LLMRequest): Promise<LLMResponse>;
  isConfigured(): boolean;
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
}

