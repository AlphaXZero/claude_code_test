import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { FAKE_MODES } from '../ai/ai.types';
import { PLAN_LIMITS } from '../ai/quota.service';
import { APP_TIMEZONE, dayKey, startOfDay } from '../common/config';
import { SettingsService } from '../ai/settings.service';
import { AdminOnly } from '../auth/auth';
import { parseBody } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';

@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  /** Costs per day and per player (O4). */
  @Get('stats')
  async stats(@Query('days') daysParam?: string) {
    const days = Math.min(365, Math.max(1, Number(daysParam) || 30));
    const since = startOfDay(new Date(), days - 1);

    const perDay = await this.prisma.$queryRaw<
      { day: string; calls: bigint; failures: bigint; cost: number; input_tokens: bigint; output_tokens: bigint; avg_ms: number }[]
    >`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TIMEZONE}, 'YYYY-MM-DD') AS day,
             count(*) AS calls,
             count(*) FILTER (WHERE NOT success) AS failures,
             coalesce(sum("costUsd"), 0)::float AS cost,
             coalesce(sum("inputTokens"), 0) AS input_tokens,
             coalesce(sum("outputTokens"), 0) AS output_tokens,
             coalesce(avg("durationMs"), 0)::float AS avg_ms
      FROM "AiCall" WHERE "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`;

    const perPlayer = await this.prisma.$queryRaw<
      { user_id: string | null; email: string | null; plan: string | null; calls: bigint; cost: number }[]
    >`
      SELECT c."userId" AS user_id, u.email, u.plan::text AS plan, count(*) AS calls, coalesce(sum(c."costUsd"), 0)::float AS cost
      FROM "AiCall" c LEFT JOIN "User" u ON u.id = c."userId"
      WHERE c."createdAt" >= ${since}
      GROUP BY 1, 2, 3 ORDER BY cost DESC, calls DESC LIMIT 100`;

    const failures = await this.prisma.aiCall.groupBy({
      by: ['failure'],
      where: { createdAt: { gte: since }, success: false },
      _count: { _all: true },
    });

    const totals = perDay.reduce(
      (t, d) => ({ calls: t.calls + Number(d.calls), cost: t.cost + d.cost, failures: t.failures + Number(d.failures) }),
      { calls: 0, cost: 0, failures: 0 },
    );
    const succeeded = totals.calls - totals.failures;

    return {
      days,
      timezone: APP_TIMEZONE,
      today: dayKey(new Date()),
      totals: { ...totals, costPerTurn: succeeded ? totals.cost / succeeded : 0 },
      perDay: perDay.map((d) => ({
        day: d.day,
        calls: Number(d.calls),
        failures: Number(d.failures),
        cost: d.cost,
        inputTokens: Number(d.input_tokens),
        outputTokens: Number(d.output_tokens),
        avgMs: Math.round(d.avg_ms),
      })),
      perPlayer: perPlayer.map((p) => ({
        userId: p.user_id,
        email: p.email ?? '(compte supprimé)',
        plan: p.plan,
        calls: Number(p.calls),
        cost: p.cost,
      })),
      failures: failures.map((f) => ({ failure: f.failure, count: f._count._all })),
    };
  }

  @Get('calls')
  calls() {
    return this.prisma.aiCall.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { email: true } } },
    });
  }

  @Get('users')
  async users() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, plan: true, createdAt: true, _count: { select: { games: true } } },
    });
    return { users, planLimits: PLAN_LIMITS };
  }

  @Patch('users/:id/plan')
  changePlan(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { plan } = parseBody(z.object({ plan: z.enum(['FREE', 'PREMIUM']) }), body);
    return this.prisma.user.update({ where: { id }, data: { plan }, select: { id: true, email: true, plan: true } });
  }

  /** Switch of the fake provider, to demonstrate the four failures (O5). */
  @Get('fake-mode')
  async fakeMode() {
    return { mode: await this.settings.fakeMode(), modes: FAKE_MODES, provider: process.env.AI_PROVIDER || 'fake' };
  }

  @Put('fake-mode')
  async setFakeMode(@Body() body: unknown) {
    const { mode } = parseBody(z.object({ mode: z.enum(FAKE_MODES) }), body);
    await this.settings.setFakeMode(mode);
    return this.fakeMode();
  }
}
