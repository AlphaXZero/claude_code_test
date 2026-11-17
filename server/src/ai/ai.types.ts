export type AiKind = 'investigation' | 'resolution';

export interface AiRequest {
  kind: AiKind;
  system: string;
  user: string;
  /** JSON schema the answer must follow (OpenRouter structured outputs). */
  jsonSchema: object;
  /** Ids the model may choose (actions or endings). Used by the fake provider. */
  choices: string[];
}

export interface AiResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** The four failures of section 3 (O5). */
export type AiFailureCode = 'TIMEOUT' | 'UNAVAILABLE' | 'NO_CREDIT' | 'INVALID';

export const FAILURE_MESSAGES: Record<AiFailureCode, string> = {
  TIMEOUT: 'Le maître du jeu met trop de temps à répondre. Réessaie.',
  UNAVAILABLE: 'Le maître du jeu est indisponible. Ta partie est sauvegardée.',
  NO_CREDIT: 'Les enquêtes sont suspendues pour le moment.',
  INVALID: 'Le maître du jeu s’est embrouillé. Réessaie.',
};

export class AiFailure extends Error {
  constructor(public readonly code: AiFailureCode, detail?: string) {
    super(detail ?? code);
  }
}

export interface AiProvider {
  readonly name: string;
  complete(req: AiRequest): Promise<AiResponse>;
}

/** Fake provider modes, switched from the admin dashboard. */
export const FAKE_MODES = ['off', 'ok', 'timeout', 'unavailable', 'no_credit', 'invalid'] as const;
export type FakeMode = (typeof FAKE_MODES)[number];
