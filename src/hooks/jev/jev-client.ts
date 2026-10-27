// Abstract Jev client interface
//
// Jev is a System One model: it answers typed questions about state with a distribution
// rather than generating prose. It speaks a different protocol from a chat model — no
// messages, no completion — so it gets its own port rather than a mode of `LLMClient`.

/** One question put to Jev. Only `choice` is used here; Jev also answers noul, score and box. */
export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  /** Option label -> what that option means. The model never sees the label alone. */
  criteria: { [label: string]: string };
}

/**
 * Jev's answer to one `choice` question.
 *
 * `confidence` and `probabilities` are optional in the wire schema, so a caller that wants a
 * distribution must be able to do without one.
 */
export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence?: number;
  probabilities?: { [label: string]: number };
}

export interface JevRequest {
  /** The content every question refers to, as a list of context items. */
  state: string[];
  questions: { [name: string]: JevChoiceQuestion };
}

export interface JevClient {
  /** Answers every question in the request, keyed by the names the request used. */
  decide(request: JevRequest): Promise<{ [name: string]: JevChoiceAnswer }>;
  isConfigured(): boolean;
}

export interface JevConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}
