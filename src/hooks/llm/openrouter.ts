// OpenRouter LLM implementation
import type { LLMClient, LLMConfig } from './llm-client.js';
import type { LLMRequest, LLMResponse } from '../../types/index.js';

export const createOpenRouterClient = (config: LLMConfig): LLMClient => {
  const referrer = 'https://github.com/oblique-bot';

  return {
    async generateResponse(request: LLMRequest): Promise<LLMResponse> {
      const body = {
        model: request.model,
        messages: request.conversation,
        temperature: request.temperature ?? config.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? config.maxTokens ?? 500,
        // Oblique's prompt asks for its own "# Thinking" section and only the "# Response"
        // section is ever posted, so a model's private reasoning is budget spent on text
        // nobody reads. On a reasoning model it spends all of it: deepseek-flash burned the
        // whole LLM_MAX_TOKENS allowance thinking and returned content: null (R-35).
        reasoning: { enabled: false },
      };

      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': referrer,
          'X-Title': 'Oblique Bot',
        },
        body: JSON.stringify(body),
      };

      // Log the body, never fetchOptions: the headers carry the API key (R-35).
      console.log('OpenRouter request:', body);

      const response = await fetch(config.baseUrl, fetchOptions);

      console.log(response);
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        model: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      
      const choice = data.choices[0];
      const content = choice?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error(
          `OpenRouter returned no content for model ${data.model} ` +
          `(finish_reason: ${choice?.finish_reason})`
        );
      }

      return {
        content,
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

