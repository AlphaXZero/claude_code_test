import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin/admin.controller';
import { AiService } from './ai/ai.service';
import { QuotaService } from './ai/quota.service';
import { SettingsService } from './ai/settings.service';
import { AuthGuard, AuthService, Public } from './auth/auth';
import { AuthController } from './auth/auth.controller';
import { GameController } from './game/game.controller';
import { GameService } from './game/game.service';
import { PrismaModule } from './prisma/prisma.service';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [HealthController, AuthController, GameController, AdminController],
  providers: [
    AuthService,
    AiService,
    QuotaService,
    SettingsService,
    GameService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
