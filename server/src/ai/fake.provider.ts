import { AiFailure, AiProvider, AiRequest, AiResponse, FakeMode } from './ai.types';

/**
 * Fake provider for development, tests and failure demos.
 * It triggers an action (or ending) only when the player types its exact id, e.g. "fouiller_tiroir".
 */
export class FakeProvider implements AiProvider {
  readonly name = 'fake';

  constructor(private readonly mode: Exclude<FakeMode, 'off'> = 'ok') {}

  async complete(req: AiRequest): Promise<AiResponse> {
    switch (this.mode) {
      case 'timeout':
        throw new AiFailure('TIMEOUT', 'simulated timeout');
      case 'unavailable':
        throw new AiFailure('UNAVAILABLE', 'simulated HTTP 503');
      case 'no_credit':
        throw new AiFailure('NO_CREDIT', 'simulated HTTP 402');
      case 'invalid':
        return this.response('Désolé, je ne sais pas répondre en JSON.', req);
    }
    const player = req.user.toLowerCase();
    const chosen = req.choices.find((id) => player.includes(id)) ?? null;
    const body =
      req.kind === 'investigation'
        ? {
            action: chosen,
            new_condition: player.includes('blessure') ? 'cheville foulée' : null,
            removed_condition: null,
            narration: chosen
              ? `[Faux MJ] Tu tentes « ${chosen} ». Ça marche.`
              : '[Faux MJ] Tu observes la pièce. Rien ne change.',
          }
        : {
            ending: chosen,
            narration: chosen ? '[Faux MJ] Le tribunal a entendu assez.' : '[Faux MJ] Continuez, Maître.',
          };
    return this.response(JSON.stringify(body), req);
  }

  private response(content: string, req: AiRequest): AiResponse {
    return {
      content,
      model: 'fake',
      inputTokens: Math.ceil((req.system.length + req.user.length) / 4),
      outputTokens: Math.ceil(content.length / 4),
      costUsd: 0,
    };
  }
}
