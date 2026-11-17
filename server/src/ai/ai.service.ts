import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvalidAnswerError } from '../game/engine';
import { AiFailure, AiFailureCode, AiProvider, AiRequest, FAILURE_MESSAGES } from './ai.types';
import { FakeProvider } from './fake.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { SettingsService } from './settings.service';

const FAILURE_STATUS: Record<AiFailureCode, HttpStatus> = {
  TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  NO_CREDIT: HttpStatus.SERVICE_UNAVAILABLE,
  INVALID: HttpStatus.BAD_GATEWAY,
};

export interface CallContext {
  userId: string;
  gameId: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService) {}

  private async provider(): Promise<AiProvider> {
    const mode = await this.settings.fakeMode();
    if (mode !== 'off') return new FakeProvider(mode);
    if (process.env.AI_PROVIDER === 'openrouter') {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new AiFailure('UNAVAILABLE', 'OPENROUTER_API_KEY is not set');
      return new OpenRouterProvider(key, process.env.AI_MODEL || 'mistralai/mistral-small-3.2-24b-instruct');
    }
    return new FakeProvider('ok');
  }

  /**
   * Calls the model, checks its answer with `check`, and logs the call (O4).
   * Any failure becomes an HTTP error with a French message; the caller saves nothing, so the turn is not counted.
   */
  async call<T>(ctx: CallContext, req: AiRequest, check: (content: string) => T): Promise<T> {
    const started = Date.now();
    let providerName = 'unknown';
    let model = process.env.AI_MODEL || 'unknown';
    let usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    try {
      const provider = await this.provider();
      providerName = provider.name;
      const res = await provider.complete(req);
      model = res.model;
      usage = { inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsd: res.costUsd };
      const value = check(res.content);
      await this.log(ctx, req, providerName, model, usage, started, null);
      return value;
    } catch (e) {
      const code: AiFailureCode | null =
        e instanceof AiFailure ? e.code : e instanceof InvalidAnswerError ? 'INVALID' : null;
      if (!code) throw e;
      this.logger.warn(`AI ${code}: ${(e as Error).message}`);
      await this.log(ctx, req, providerName, model, usage, started, code);
      throw new HttpException({ code: `AI_${code}`, message: FAILURE_MESSAGES[code] }, FAILURE_STATUS[code]);
    }
  }

  private async log(
    ctx: CallContext, req: AiRequest, provider: string, model: string,
    usage: { inputTokens: number; outputTokens: number; costUsd: number }, started: number, failure: AiFailureCode | null,
  ) {
    await this.prisma.aiCall.create({
      data: {
        userId: ctx.userId,
        gameId: ctx.gameId,
        provider,
        model,
        kind: req.kind,
        ...usage,
        durationMs: Date.now() - started,
        success: failure === null,
        failure,
      },
    });
  }
}
