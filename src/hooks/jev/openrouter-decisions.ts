// Jev through OpenRouter's Decisions API
//
// A different endpoint and a different shape from chat completions: `{ model, state, questions }`
// in, `{ answers }` out, with no messages and no choices array. Hence a separate client rather
// than another method on the OpenRouter LLM client — the two share only a host and a key.

import type { JevClient, JevConfig, JevRequest, JevChoiceAnswer } from './jev-client.js';

export const createOpenRouterJevClient = (config: JevConfig): JevClient => {
  const referrer = 'https://github.com/oblique-bot';

  return {
    async decide(request: JevRequest): Promise<{ [name: string]: JevChoiceAnswer }> {
      const body = {
        model: config.model,
        state: request.state,
        questions: request.questions,
      };

      // Log the body, never the headers: they carry the API key (R-35).
      console.log('Jev request:', body);

      const response = await fetch(config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': referrer,
          'X-Title': 'Oblique Bot',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Jev API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        answers?: { [name: string]: JevChoiceAnswer };
      };

      if (!data.answers) {
        throw new Error('Jev returned no answers');
      }

      console.log('Jev answers:', data.answers);

      return data.answers;
    },

    isConfigured(): boolean {
      return !!config.apiKey;
    },
  };
};
