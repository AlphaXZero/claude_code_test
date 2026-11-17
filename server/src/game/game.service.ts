import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { QuotaService } from '../ai/quota.service';
import { loadCase } from '../cases/case-store';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyInvestigation, applyResolution, availableActions, availableEndings, buildInvestigationPrompt,
  buildResolutionPrompt, checkInvestigationAnswer, checkResolutionAnswer, GameState, PastTurn,
  investigationJsonSchema, RECENT_TURNS, RESOLUTION_TURN_LIMIT, resolutionJsonSchema, startResolution,
} from './engine';

const gameInclude = {
  case: { include: { items: true } },
  done: { select: { id: true, code: true } },
  items: { select: { id: true, code: true, name: true, evidence: true } },
  conditions: true,
  ending: true,
  turns: { orderBy: { number: 'asc' }, include: { action: { select: { code: true, result: true } } } },
} satisfies Prisma.GameInclude;

type FullGame = Prisma.GameGetPayload<{ include: typeof gameInclude }>;

const busy = new Set<string>();

@Injectable()
export class GameService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly quota: QuotaService,
  ) {}

  /** Cases with the player's latest game on each. */
  async listCases(userId: string) {
    const cases = await this.prisma.case.findMany({
      where: { published: true },
      orderBy: { title: 'asc' },
      include: {
        games: { where: { userId }, orderBy: { startedAt: 'desc' }, take: 1, include: { ending: true } },
      },
    });
    return cases.map((k) => ({
      slug: k.slug,
      title: k.title,
      side: k.side,
      intro: k.intro,
      sceneImage: k.sceneImage,
      actionLimit: k.actionLimit,
      lastGame: k.games[0]
        ? { id: k.games[0].id, phase: k.games[0].phase, outcome: k.games[0].ending?.outcome ?? null }
        : null,
    }));
  }

  /** Start or replay: always a new game. */
  async start(userId: string, slug: string) {
    const k = await this.prisma.case.findFirst({ where: { slug, published: true } });
    if (!k) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Enquête introuvable.' });
    const g = await this.prisma.game.create({ data: { userId, caseId: k.id, actionsLeft: k.actionLimit } });
    return this.view(await this.get(userId, g.id));
  }

  async show(userId: string, gameId: string) {
    return this.view(await this.get(userId, gameId));
  }

  /** The player may start the resolution before the action limit. */
  async goToResolution(userId: string, gameId: string) {
    const g = await this.get(userId, gameId);
    const s = startResolution(this.state(g));
    await this.prisma.game.update({ where: { id: g.id }, data: { phase: s.phase } });
    return this.view(await this.get(userId, gameId));
  }

  async playTurn(userId: string, gameId: string, text: string) {
    if (busy.has(gameId)) throw new ConflictException({ code: 'BUSY', message: 'Le tour précédent est encore en cours.' });
    busy.add(gameId);
    try {
      return await this.playTurnUnlocked(userId, gameId, text);
    } finally {
      busy.delete(gameId);
    }
  }

  private async playTurnUnlocked(userId: string, gameId: string, text: string) {
    const g = await this.get(userId, gameId);
    if (g.phase === 'FINISHED') throw new ConflictException({ code: 'FINISHED', message: 'Cette partie est terminée.' });
    await this.quota.assertCanPlay(userId);

    const c = await loadCase(this.prisma, g.caseId);
    const s = this.state(g);
    const past: PastTurn[] = g.turns
      .filter((t) => t.phase === s.phase)
      .slice(-RECENT_TURNS)
      .map((t) => ({ playerText: t.playerText, narration: t.narration, action: t.action?.code }));
    const ctx = { userId, gameId };

    if (s.phase === 'INVESTIGATION') {
      const available = availableActions(c, s);
      const prompt = buildInvestigationPrompt(c, s, past, text);
      const answer = await this.ai.call(
        ctx,
        { kind: 'investigation', ...prompt, jsonSchema: investigationJsonSchema(available), choices: available },
        (content) => checkInvestigationAnswer(content, available, s),
      );
      const fx = applyInvestigation(c, s, answer);
      await this.save(g, s, fx.state, text, answer.narration, {
        actionCode: answer.action,
        removedCondition: answer.removed_condition,
        newCondition: fx.state.conditions.find((x) => !s.conditions.includes(x)) ?? null,
        endingCode: null,
      });
      return {
        narration: answer.narration,
        result: fx.result,
        gained: fx.gained.map((code) => c.items[code].name),
        game: this.view(await this.get(userId, gameId)),
      };
    }

    const available = availableEndings(c, s);
    const prompt = buildResolutionPrompt(c, s, past, text);
    const answer = await this.ai.call(
      ctx,
      { kind: 'resolution', ...prompt, jsonSchema: resolutionJsonSchema(available), choices: available },
      (content) => checkResolutionAnswer(content, available),
    );
    const fx = applyResolution(c, s, answer);
    await this.save(g, s, fx.state, text, answer.narration, {
      actionCode: null, removedCondition: null, newCondition: null, endingCode: fx.ending,
    });
    return { narration: answer.narration, result: null, gained: [], game: this.view(await this.get(userId, gameId)) };
  }

  private async save(
    g: FullGame, before: GameState, after: GameState, playerText: string, narration: string,
    fx: { actionCode: string | null; removedCondition: string | null; newCondition: string | null; endingCode: string | null },
  ) {
    const key = (code: string) => ({ caseId_code: { caseId: g.caseId, code } });
    const newItems = after.items.filter((i) => !before.items.includes(i));
    await this.prisma.$transaction(async (tx) => {
      // Optimistic check: the game must not have changed since it was read.
      const updated = await tx.game.updateMany({
        where: { id: g.id, phase: before.phase, actionsLeft: before.actionsLeft },
        data: {
          phase: after.phase,
          actionsLeft: after.actionsLeft,
          ...(after.phase === 'FINISHED' ? { finishedAt: new Date() } : {}),
        },
      });
      if (updated.count === 0) throw new ConflictException({ code: 'BUSY', message: 'La partie a changé entre-temps. Recharge la page.' });

      const ending = fx.endingCode ? await tx.ending.findUniqueOrThrow({ where: key(fx.endingCode) }) : null;
      const action = fx.actionCode ? await tx.action.findUniqueOrThrow({ where: key(fx.actionCode) }) : null;
      await tx.game.update({
        where: { id: g.id },
        data: {
          ...(ending ? { endingId: ending.id } : {}),
          ...(action ? { done: { connect: { id: action.id } } } : {}),
          ...(newItems.length ? { items: { connect: newItems.map(key) } } : {}),
        },
      });
      if (fx.removedCondition) await tx.condition.deleteMany({ where: { gameId: g.id, description: fx.removedCondition } });
      if (fx.newCondition) await tx.condition.create({ data: { gameId: g.id, description: fx.newCondition } });
      await tx.turn.create({
        data: {
          gameId: g.id,
          number: g.turns.length + 1,
          phase: before.phase,
          playerText,
          narration,
          actionId: action?.id ?? null,
        },
      });
    });
  }

  private async get(userId: string, gameId: string): Promise<FullGame> {
    // Each player only sees their own games (O3): a game of someone else is "not found".
    const g = await this.prisma.game.findFirst({ where: { id: gameId, userId }, include: gameInclude });
    if (!g) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Partie introuvable.' });
    return g;
  }

  private state(g: FullGame): GameState {
    return {
      phase: g.phase,
      done: g.done.map((a) => a.code),
      items: g.items.map((i) => i.code),
      conditions: g.conditions.map((x) => x.description),
      actionsLeft: g.actionsLeft,
      resolutionTurns: g.turns.filter((t) => t.phase === 'RESOLUTION').length,
    };
  }

  /**
   * What the front end receives. Never the truth, the guidance, the meanings, the hints,
   * the hidden conditions or the actions: they stay on the server.
   */
  private view(g: FullGame) {
    const resolutionTurns = g.turns.filter((t) => t.phase === 'RESOLUTION').length;
    return {
      id: g.id,
      phase: g.phase,
      actionsLeft: g.actionsLeft,
      actionLimit: g.case.actionLimit,
      resolutionTurnsLeft: Math.max(0, RESOLUTION_TURN_LIMIT - resolutionTurns),
      startedAt: g.startedAt,
      finishedAt: g.finishedAt,
      case: {
        slug: g.case.slug,
        title: g.case.title,
        side: g.case.side,
        intro: g.case.intro,
        sceneImage: g.case.sceneImage,
        resolutionCharacter: g.case.resolutionCharacter,
        resolutionImage: g.case.resolutionImage,
      },
      evidenceTotal: g.case.items.filter((i) => i.evidence).length,
      items: g.items.map((i) => ({ code: i.code, name: i.name, evidence: i.evidence })),
      doneActions: g.done.map((a) => a.code),
      turns: g.turns.map((t) => ({
        number: t.number,
        phase: t.phase,
        playerText: t.playerText,
        narration: t.narration,
        result: t.action?.result ?? null,
      })),
      ending: g.ending ? { outcome: g.ending.outcome, text: g.ending.text } : null,
    };
  }
}
