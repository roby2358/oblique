// OpenRouter LLM implementation
import type { LLMClient, LLMConfig } from './llm-client.js';
import type { LLMRequest, LLMResponse } from '../../types/index.js';

export const createOpenRouterClient = (config: LLMConfig): LLMClient => {
  const referrer = 'https://github.com/oblique-bot';

  return {
    async generateResponse(request: LLMRequest): Promise<LLMResponse> {
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': referrer,
          'X-Title': 'Oblique Bot',
        },
        body: JSON.stringify({
          model: request.model || config.model,
          messages: [
            { role: 'user', content: request.prompt }
          ],
          temperature: request.temperature ?? config.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? config.maxTokens ?? 500,
        }),
      };
      const response = await fetch(config.baseUrl, fetchOptions);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        model: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      
      return {
        content: data.choices[0]?.message?.content || '',
        model: data.model,
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
      };
    },

    isConfigured(): boolean {
      return !!config.apiKey;
    },
  };
};

