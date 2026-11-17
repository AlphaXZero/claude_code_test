import { reactive } from 'vue';

export interface User {
  id: string;
  email: string;
  role: 'PLAYER' | 'ADMINISTRATOR';
}

export interface Turn {
  number: number;
  phase: 'INVESTIGATION' | 'RESOLUTION';
  playerText: string;
  narration: string;
  result: string | null;
}

export interface Game {
  id: string;
  phase: 'INVESTIGATION' | 'RESOLUTION' | 'FINISHED';
  actionsLeft: number;
  actionLimit: number;
  resolutionTurnsLeft: number;
  case: {
    slug: string;
    title: string;
    side: 'DEFENCE' | 'PROSECUTION';
    intro: string;
    sceneImage: string;
    resolutionCharacter: string;
    resolutionImage: string;
  };
  evidenceTotal: number;
  items: { code: string; name: string; evidence: boolean }[];
  doneActions: string[];
  turns: Turn[];
  ending: { outcome: 'WIN' | 'MIXED' | 'LOSS'; text: string } | null;
}

export interface TurnResult {
  narration: string;
  result: string | null;
  gained: string[];
  game: Game;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const TOKEN_KEY = 'case-prompt-token';
const USER_KEY = 'case-prompt-user';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const session = reactive<{ token: string | null; user: User | null }>({
  token: read(TOKEN_KEY),
  user: JSON.parse(read(USER_KEY) ?? 'null'),
});

export function setSession(token: string | null, user: User | null) {
  session.token = token;
  session.user = user;
  try {
    if (token && user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  } catch {
    /* private mode: the session lives in memory only */
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Impossible de joindre le serveur. Vérifie ta connexion.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session.token) setSession(null, null);
    const message = typeof data.message === 'string' ? data.message : 'Une erreur est survenue.';
    throw new ApiError(res.status, data.code ?? 'ERROR', message);
  }
  return data as T;
}

export const imageUrl = (name: string) => `/images/${name}`;

export const outcomeLabel = { WIN: 'Victoire', MIXED: 'Demi-victoire', LOSS: 'Défaite' } as const;
