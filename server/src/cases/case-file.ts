import { z } from 'zod';

/**
 * Format of a case file (section 2 of the analysis).
 * Pure code: no database, so it can be tested and used by the loader and the engine.
 */

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are lower case letters, digits and _');
const idList = z.array(id).default([]);
const text = z.string().trim().min(1);

export const actionSchema = z.object({
  description: text,
  ai_hint: text,
  requires: idList,
  requires_items: idList,
  helped_by: idList,
  gives: idList,
  result: text,
});

export const itemSchema = z
  .object({
    name: text,
    evidence: z.boolean().default(false),
    meaning: text.optional(),
  })
  .refine((i) => !i.evidence || i.meaning, { message: 'evidence needs a meaning' });

export const endingSchema = z.object({
  outcome: z.enum(['win', 'mixed', 'loss']),
  requires_items: idList,
  ai_hint: text,
  text: text,
});

export const caseFileSchema = z.object({
  title: text,
  side: z.enum(['defence', 'prosecution']),
  action_limit: z.number().int().min(1).max(200),
  story: z.object({ intro: text, truth: text, ai_guidance: text }),
  scene: z.object({
    image: text,
    description: text,
    details: z.array(text).default([]),
  }),
  resolution: z.object({ character: text, image: text, tone: text }),
  actions: z.record(id, actionSchema),
  items: z.record(id, itemSchema),
  endings: z.record(id, endingSchema),
});

export type CaseFile = z.infer<typeof caseFileSchema>;

/** Parses a case file and checks that every referenced id exists. Throws with every problem found. */
export function parseCaseFile(raw: unknown): CaseFile {
  const parsed = caseFileSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid case file:\n- ${lines.join('\n- ')}`);
  }
  const c = parsed.data;
  const errors: string[] = [];
  const actionIds = new Set(Object.keys(c.actions));
  const itemIds = new Set(Object.keys(c.items));

  if (actionIds.size === 0) errors.push('actions: at least one action is needed');
  if (Object.keys(c.endings).length < 2) errors.push('endings: at least two endings are needed');

  const check = (where: string, ids: string[], known: Set<string>, kind: string) => {
    for (const ref of ids) if (!known.has(ref)) errors.push(`${where}: unknown ${kind} "${ref}"`);
  };

  for (const [code, a] of Object.entries(c.actions)) {
    check(`actions.${code}.requires`, a.requires, actionIds, 'action');
    check(`actions.${code}.requires_items`, a.requires_items, itemIds, 'item');
    check(`actions.${code}.helped_by`, a.helped_by, itemIds, 'item');
    check(`actions.${code}.gives`, a.gives, itemIds, 'item');
    if (a.requires.includes(code)) errors.push(`actions.${code}.requires: an action cannot require itself`);
  }
  for (const [code, e] of Object.entries(c.endings)) {
    check(`endings.${code}.requires_items`, e.requires_items, itemIds, 'item');
  }
  if (!Object.values(c.endings).some((e) => e.requires_items.length === 0)) {
    errors.push('endings: at least one ending must have no requirement, so the game can always end');
  }

  // Every item must be obtainable, otherwise endings or actions that need it are dead.
  const given = new Set(Object.values(c.actions).flatMap((a) => a.gives));
  for (const code of itemIds) if (!given.has(code)) errors.push(`items.${code}: no action gives it`);

  // Requirement cycles make actions impossible.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (code: string, path: string[]) => {
    if (visited.has(code)) return;
    if (visiting.has(code)) {
      errors.push(`actions: requirement cycle ${[...path, code].join(' -> ')}`);
      return;
    }
    visiting.add(code);
    for (const r of c.actions[code]?.requires ?? []) visit(r, [...path, code]);
    visiting.delete(code);
    visited.add(code);
  };
  for (const code of actionIds) visit(code, []);

  if (errors.length) throw new Error(`Invalid case file:\n- ${errors.join('\n- ')}`);
  return c;
}
