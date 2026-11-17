import { Prisma, PrismaClient } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CaseFile, parseCaseFile } from './case-file';

type Db = PrismaClient | Prisma.TransactionClient;

export const CASES_DIR = join(__dirname, '..', '..', 'cases');

const toSide = (s: CaseFile['side']): 'DEFENCE' | 'PROSECUTION' => (s === 'defence' ? 'DEFENCE' : 'PROSECUTION');
const toOutcome = (o: 'win' | 'mixed' | 'loss') => o.toUpperCase() as 'WIN' | 'MIXED' | 'LOSS';

/**
 * Imports a case into the database, updating it in place: ids are matched by code,
 * so games in progress keep their actions and items. Codes removed from the file are deleted.
 */
export async function importCase(prisma: PrismaClient, slug: string, c: CaseFile): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const data = {
        title: c.title,
        side: toSide(c.side),
        intro: c.story.intro,
        truth: c.story.truth,
        aiGuidance: c.story.ai_guidance,
        actionLimit: c.action_limit,
        sceneImage: c.scene.image,
        sceneDescription: c.scene.description,
        sceneDetails: c.scene.details,
        resolutionCharacter: c.resolution.character,
        resolutionTone: c.resolution.tone,
        resolutionImage: c.resolution.image,
      };
      const kase = await tx.case.upsert({ where: { slug }, create: { slug, ...data }, update: data });
      const caseId = kase.id;
      const key = (code: string) => ({ caseId_code: { caseId, code } });
      const refs = (codes: string[]) => ({ set: codes.map(key) });

      await tx.item.deleteMany({ where: { caseId, code: { notIn: Object.keys(c.items) } } });
      await tx.action.deleteMany({ where: { caseId, code: { notIn: Object.keys(c.actions) } } });
      await tx.ending.deleteMany({ where: { caseId, code: { notIn: Object.keys(c.endings) } } });

      for (const [code, i] of Object.entries(c.items)) {
        const d = { name: i.name, evidence: i.evidence, meaning: i.meaning ?? null };
        await tx.item.upsert({ where: key(code), create: { caseId, code, ...d }, update: d });
      }
      for (const [code, a] of Object.entries(c.actions)) {
        const d = { description: a.description, aiHint: a.ai_hint, result: a.result };
        await tx.action.upsert({ where: key(code), create: { caseId, code, ...d }, update: d });
      }
      // Second pass: relations, once every code exists.
      for (const [code, a] of Object.entries(c.actions)) {
        await tx.action.update({
          where: key(code),
          data: {
            requires: refs(a.requires),
            requiresItems: refs(a.requires_items),
            helpedBy: refs(a.helped_by),
            gives: refs(a.gives),
          },
        });
      }
      for (const [code, e] of Object.entries(c.endings)) {
        const d = { outcome: toOutcome(e.outcome), aiHint: e.ai_hint, text: e.text };
        await tx.ending.upsert({
          where: key(code),
          create: { caseId, code, ...d, requiresItems: { connect: e.requires_items.map(key) } },
          update: { ...d, requiresItems: refs(e.requires_items) },
        });
      }
    },
    { timeout: 60_000 },
  );
}

/** Loads every JSON file of the cases folder. Stops at the first invalid file. */
export async function importAllCases(prisma: PrismaClient, dir = CASES_DIR): Promise<string[]> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const parsed = files.map((f) => {
    try {
      return { slug: basename(f, '.json'), c: parseCaseFile(JSON.parse(readFileSync(join(dir, f), 'utf8'))) };
    } catch (e) {
      throw new Error(`${f}: ${(e as Error).message}`);
    }
  });
  for (const { slug, c } of parsed) await importCase(prisma, slug, c);
  return parsed.map((p) => p.slug);
}

const caseInclude = {
  actions: { include: { requires: true, requiresItems: true, helpedBy: true, gives: true } },
  items: true,
  endings: { include: { requiresItems: true } },
} satisfies Prisma.CaseInclude;

/** Rebuilds the case file from the database, so the engine works on one format. */
export async function loadCase(db: Db, caseId: string): Promise<CaseFile> {
  const k = await db.case.findUniqueOrThrow({ where: { id: caseId }, include: caseInclude });
  const codes = (xs: { code: string }[]) => xs.map((x) => x.code);
  return {
    title: k.title,
    side: k.side === 'DEFENCE' ? 'defence' : 'prosecution',
    action_limit: k.actionLimit,
    story: { intro: k.intro, truth: k.truth, ai_guidance: k.aiGuidance },
    scene: { image: k.sceneImage, description: k.sceneDescription, details: k.sceneDetails },
    resolution: { character: k.resolutionCharacter, image: k.resolutionImage, tone: k.resolutionTone },
    actions: Object.fromEntries(
      k.actions.map((a) => [
        a.code,
        {
          description: a.description,
          ai_hint: a.aiHint,
          result: a.result,
          requires: codes(a.requires),
          requires_items: codes(a.requiresItems),
          helped_by: codes(a.helpedBy),
          gives: codes(a.gives),
        },
      ]),
    ),
    items: Object.fromEntries(
      k.items.map((i) => [i.code, { name: i.name, evidence: i.evidence, meaning: i.meaning ?? undefined }]),
    ),
    endings: Object.fromEntries(
      k.endings.map((e) => [
        e.code,
        {
          outcome: e.outcome.toLowerCase() as 'win' | 'mixed' | 'loss',
          ai_hint: e.aiHint,
          text: e.text,
          requires_items: codes(e.requiresItems),
        },
      ]),
    ),
  };
}
