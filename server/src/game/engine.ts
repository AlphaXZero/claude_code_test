import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CaseFile } from '../cases/case-file';

/**
 * The game engine (section 3 of the analysis). Pure functions only:
 * the AI decides whether an attempt is deserved, this code decides what is possible.
 */

export type Phase = 'INVESTIGATION' | 'RESOLUTION' | 'FINISHED';

export interface GameState {
  phase: Phase;
  done: string[];
  items: string[];
  conditions: string[];
  actionsLeft: number;
  /** Number of resolution turns already played. */
  resolutionTurns: number;
}

export interface PastTurn {
  playerText: string;
  narration: string;
  action?: string | null;
}

export interface InvestigationAnswer {
  action: string | null;
  new_condition: string | null;
  removed_condition: string | null;
  narration: string;
}

export interface ResolutionAnswer {
  ending: string | null;
  narration: string;
}

export interface Prompt {
  system: string;
  /** The player's text, between <player> tags. */
  user: string;
}

export const RESOLUTION_TURN_LIMIT = 8;
export const RECENT_TURNS = 5;
export const MAX_CONDITIONS = 5;
export const MAX_PLAYER_TEXT = 500;
export const MAX_NARRATION = 1500;
const MAX_CONDITION = 100;

export class InvalidAnswerError extends Error {}

export function initialState(c: CaseFile): GameState {
  return { phase: 'INVESTIGATION', done: [], items: [], conditions: [], actionsLeft: c.action_limit, resolutionTurns: 0 };
}

// ---------- Hard rules ----------

/** Actions not done yet whose hard requirements are met. Only these are shown to the AI. */
export function availableActions(c: CaseFile, s: GameState): string[] {
  return Object.entries(c.actions)
    .filter(([code, a]) =>
      !s.done.includes(code) &&
      a.requires.every((r) => s.done.includes(r)) &&
      a.requires_items.every((i) => s.items.includes(i)))
    .map(([code]) => code);
}

/** Endings whose required items the player owns. Endings without requirements are always available. */
export function availableEndings(c: CaseFile, s: GameState): string[] {
  return Object.entries(c.endings)
    .filter(([, e]) => e.requires_items.every((i) => s.items.includes(i)))
    .map(([code]) => code);
}

/** Ending chosen by the code when the resolution turn limit is reached and the AI chose none. */
export function fallbackEnding(c: CaseFile, s: GameState): string {
  const available = availableEndings(c, s);
  const free = available.filter((code) => c.endings[code].requires_items.length === 0);
  return free.find((code) => c.endings[code].outcome === 'loss') ?? free[0] ?? available[0];
}

// ---------- Prompts ----------

const templates = new Map<string, string>();
function template(name: 'investigation' | 'resolution'): string {
  if (!templates.has(name)) {
    templates.set(name, readFileSync(join(__dirname, '..', '..', 'prompts', `${name}.txt`), 'utf8'));
  }
  return templates.get(name)!;
}

function fill(tpl: string, values: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Missing prompt value: ${key}`);
    return values[key];
  });
}

const bullets = (lines: string[], empty: string) => (lines.length ? lines.map((l) => `- ${l}`).join('\n') : empty);

function itemsWithMeaning(c: CaseFile, s: GameState): string {
  return bullets(
    s.items.map((code) => {
      const i = c.items[code];
      return i.meaning ? `${i.name}${i.evidence ? ' (evidence)' : ''}: ${i.meaning}` : i.name;
    }),
    'none',
  );
}

function recentTurns(turns: PastTurn[]): string {
  const last = turns.slice(-RECENT_TURNS);
  if (!last.length) return 'none, this is the first turn';
  return last
    .map((t) => `Player: ${t.playerText}\nYou: ${t.narration}${t.action ? ` [action triggered: ${t.action}]` : ''}`)
    .join('\n\n');
}

export function wrapPlayerText(text: string): string {
  // The player cannot close the tag themselves.
  return `<player>${text.replace(/<\/?player>/gi, '')}</player>`;
}

export function buildInvestigationPrompt(c: CaseFile, s: GameState, turns: PastTurn[], playerText: string): Prompt {
  const actions = availableActions(c, s).map((code) => {
    const a = c.actions[code];
    const helped = a.helped_by.length
      ? ` Helped by: ${a.helped_by.map((i) => `${c.items[i].name} (${s.items.includes(i) ? 'owned' : 'not owned'})`).join(', ')}.`
      : '';
    return `${code}: ${a.description} Hint: ${a.ai_hint}${helped}`;
  });
  const system = fill(template('investigation'), {
    intro: c.story.intro,
    truth: c.story.truth,
    ai_guidance: c.story.ai_guidance,
    scene_description: c.scene.description,
    scene_details: bullets(c.scene.details, 'none'),
    conditions: s.conditions.length ? s.conditions.join(', ') : 'none',
    items_with_meaning: itemsWithMeaning(c, s),
    available_actions: bullets(actions, 'none: no action can change the game any more, just narrate'),
    recent_turns: recentTurns(turns),
  });
  return { system, user: wrapPlayerText(playerText) };
}

export function buildResolutionPrompt(c: CaseFile, s: GameState, turns: PastTurn[], playerText: string): Prompt {
  const evidence = Object.entries(c.items).filter(([, i]) => i.evidence);
  const endings = availableEndings(c, s).map((code) => {
    const e = c.endings[code];
    return `${code} (${e.outcome}): ${e.ai_hint}`;
  });
  const isLast = s.resolutionTurns + 1 >= RESOLUTION_TURN_LIMIT;
  const system = fill(template('resolution'), {
    character: c.resolution.character,
    tone: c.resolution.tone,
    player_role: c.side === 'defence' ? 'defence lawyer' : 'prosecutor',
    intro: c.story.intro,
    truth: c.story.truth,
    ai_guidance: c.story.ai_guidance,
    evidence_found: String(evidence.filter(([code]) => s.items.includes(code)).length),
    evidence_total: String(evidence.length),
    items_with_meaning: itemsWithMeaning(c, s),
    available_endings: bullets(endings, 'none'),
    recent_turns: recentTurns(turns),
    last_turn_rule: isLast ? '5. This is the LAST exchange: you MUST choose one of the available endings now.' : '',
  });
  return { system, user: wrapPlayerText(playerText) };
}

// ---------- Answer formats (JSON schemas sent to the model) ----------

export function investigationJsonSchema(actionIds: string[]) {
  return {
    name: 'investigation_turn',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'new_condition', 'removed_condition', 'narration'],
      properties: {
        action: { type: ['string', 'null'], enum: [...actionIds, null] },
        new_condition: { type: ['string', 'null'] },
        removed_condition: { type: ['string', 'null'] },
        narration: { type: 'string' },
      },
    },
  };
}

export function resolutionJsonSchema(endingIds: string[]) {
  return {
    name: 'resolution_turn',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ending', 'narration'],
      properties: {
        ending: { type: ['string', 'null'], enum: [...endingIds, null] },
        narration: { type: 'string' },
      },
    },
  };
}

// ---------- Checks of the model's answer (step 5) ----------

function parseJson(raw: string): Record<string, unknown> {
  // Some models wrap JSON in a code fence despite the schema.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new InvalidAnswerError('answer is not JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidAnswerError('answer is not an object');
  return value as Record<string, unknown>;
}

function optionalString(v: unknown, field: string, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new InvalidAnswerError(`${field} is not a string`);
  const t = v.trim();
  if (!t) return null;
  if (t.length > max) throw new InvalidAnswerError(`${field} is too long`);
  return t;
}

/** Shortens a text to `max` characters, at the end of a sentence when possible. */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('.'));
  return end > max / 2 ? cut.slice(0, end + 1) : `${cut.slice(0, max - 1).trimEnd()}…`;
}

/** A narration that is too long is shortened rather than rejected: the call is billed either way. */
function narration(v: unknown): string {
  const n = optionalString(v, 'narration', Number.MAX_SAFE_INTEGER);
  if (!n) throw new InvalidAnswerError('narration is empty');
  return shorten(n, MAX_NARRATION);
}

export function checkInvestigationAnswer(raw: string, available: string[], s: GameState): InvestigationAnswer {
  const v = parseJson(raw);
  const action = optionalString(v.action, 'action', 100);
  if (action !== null && !available.includes(action)) throw new InvalidAnswerError(`action "${action}" was not offered`);
  const removed = optionalString(v.removed_condition, 'removed_condition', MAX_CONDITION);
  return {
    action,
    new_condition: optionalString(v.new_condition, 'new_condition', MAX_CONDITION),
    // A removed condition the player does not have is ignored rather than failing the whole turn.
    removed_condition: removed && s.conditions.includes(removed) ? removed : null,
    narration: narration(v.narration),
  };
}

export function checkResolutionAnswer(raw: string, available: string[]): ResolutionAnswer {
  const v = parseJson(raw);
  const ending = optionalString(v.ending, 'ending', 100);
  if (ending !== null && !available.includes(ending)) throw new InvalidAnswerError(`ending "${ending}" was not offered`);
  return { ending, narration: narration(v.narration) };
}

// ---------- Effects ----------

export interface InvestigationEffects {
  state: GameState;
  /** Result text of the action, shown as is. */
  result: string | null;
  gained: string[];
}

export function applyInvestigation(c: CaseFile, s: GameState, a: InvestigationAnswer): InvestigationEffects {
  if (s.phase !== 'INVESTIGATION') throw new Error('not in investigation');
  const next: GameState = { ...s, done: [...s.done], items: [...s.items], conditions: [...s.conditions] };
  let result: string | null = null;
  const gained: string[] = [];

  if (a.action) {
    const action = c.actions[a.action];
    next.done.push(a.action);
    for (const item of action.gives) {
      if (!next.items.includes(item)) {
        next.items.push(item);
        gained.push(item);
      }
    }
    result = action.result;
  }
  if (a.removed_condition) next.conditions = next.conditions.filter((x) => x !== a.removed_condition);
  if (a.new_condition && !next.conditions.includes(a.new_condition) && next.conditions.length < MAX_CONDITIONS) {
    next.conditions.push(a.new_condition);
  }
  next.actionsLeft = Math.max(0, s.actionsLeft - 1);
  if (next.actionsLeft === 0) next.phase = 'RESOLUTION';
  return { state: next, result, gained };
}

export interface ResolutionEffects {
  state: GameState;
  ending: string | null;
}

export function applyResolution(c: CaseFile, s: GameState, a: ResolutionAnswer): ResolutionEffects {
  if (s.phase !== 'RESOLUTION') throw new Error('not in resolution');
  const next: GameState = { ...s, resolutionTurns: s.resolutionTurns + 1 };
  let ending = a.ending;
  if (!ending && next.resolutionTurns >= RESOLUTION_TURN_LIMIT) ending = fallbackEnding(c, s);
  if (ending) next.phase = 'FINISHED';
  return { state: next, ending };
}

/** The player may go to the resolution before the limit (open question 2: answered yes). */
export function startResolution(s: GameState): GameState {
  if (s.phase !== 'INVESTIGATION') throw new Error('not in investigation');
  return { ...s, phase: 'RESOLUTION' };
}
