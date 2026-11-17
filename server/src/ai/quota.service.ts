import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Plan } from '@prisma/client';
import { startOfDay } from '../common/config';
import { PrismaService } from '../prisma/prisma.service';

/** Turns per day (Paris time) for each plan. The quota unit is the turn; a replay counts. */
export const PLAN_LIMITS: Record<Plan, number> = { FREE: 60, PREMIUM: 600 };

/**
 * Calls that count against the quota: the successful ones, and the unusable answers,
 * because the provider bills those too. Timeouts and outages are not billed and do not count.
 */
export const BILLED_CALLS = { OR: [{ success: true }, { failure: 'INVALID' }] };

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true } });
    const used = await this.prisma.aiCall.count({ where: { userId, createdAt: { gte: startOfDay() }, ...BILLED_CALLS } });
    const limit = PLAN_LIMITS[user.plan];
    return { plan: user.plan, used, limit, left: Math.max(0, limit - used) };
  }

  /** Enforced on the server before every call to the model. */
  async assertCanPlay(userId: string) {
    const s = await this.status(userId);
    if (s.left <= 0) {
      throw new HttpException(
        { code: 'QUOTA_EXCEEDED', message: `Tu as joué tes ${s.limit} tours du jour. Reviens demain ou passe à l’offre Premium.` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
