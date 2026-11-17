import { AiFailure, AiProvider, AiRequest, AiResponse } from './ai.types';

const URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 30_000;

/** OpenRouter, called only by the server. The key stays in an environment variable. */
export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter';

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async complete(req: AiRequest): Promise<AiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Case Prompt',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          response_format: { type: 'json_schema', json_schema: req.jsonSchema },
          temperature: 0.7,
          max_tokens: 500,
          // Exclude providers that keep prompts; only use providers that support the schema.
          provider: { data_collection: 'deny', require_parameters: true },
          usage: { include: true },
        }),
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new AiFailure('TIMEOUT', 'no answer after 30 s');
      throw new AiFailure('UNAVAILABLE', (e as Error).message);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 408) throw new AiFailure('TIMEOUT', 'HTTP 408');
    if (res.status === 402) throw new AiFailure('NO_CREDIT', 'HTTP 402');
    if (!res.ok) throw new AiFailure('UNAVAILABLE', `HTTP ${res.status}`);

    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      error?: { code?: number; message?: string };
    };
    if (data.error) {
      const code = data.error.code;
      if (code === 402) throw new AiFailure('NO_CREDIT', data.error.message);
      if (code === 408) throw new AiFailure('TIMEOUT', data.error.message);
      throw new AiFailure('UNAVAILABLE', data.error.message);
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new AiFailure('INVALID', 'empty answer');
    return {
      content,
      model: data.model ?? this.model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      costUsd: data.usage?.cost ?? 0,
    };
  }
}
