import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { parseBody } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../ai/quota.service';
import { AuthService, AuthUser, credentialsSchema, CurrentUser, Public } from './auth';

/** Against password guessing and mass sign-ups: 10 attempts per minute and per IP, on each route. */
export const AUTH_LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('auth/register')
  register(@Body() body: unknown) {
    const { email, password } = parseBody(credentialsSchema, body);
    return this.auth.register(email, password);
  }

  @Public()
  @Throttle(AUTH_LIMIT)
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const { email, password } = parseBody(credentialsSchema.extend({ password: z.string().min(1) }), body);
    return this.auth.login(email, password);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { id: u.id, email: u.email, role: u.role, plan: u.plan, quota: await this.quota.status(u.id) };
  }

  /** Account deletion (O7): deletes the games, their turns and conditions; the call log is kept without the user. */
  @Throttle(AUTH_LIMIT)
  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { password } = parseBody(z.object({ password: z.string().min(1, 'mot de passe requis') }), body);
    await this.auth.checkPassword(user.id, password);
    await this.prisma.user.delete({ where: { id: user.id } });
  }
}
