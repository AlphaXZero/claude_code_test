import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CurrentUser } from '../auth/auth';
import { parseBody } from '../common/validation';
import { MAX_PLAYER_TEXT } from './engine';
import { GameService } from './game.service';

@Controller()
export class GameController {
  constructor(private readonly games: GameService) {}

  @Get('cases')
  cases(@CurrentUser() user: AuthUser) {
    return this.games.listCases(user.id);
  }

  @Post('games')
  start(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const { caseSlug } = parseBody(z.object({ caseSlug: z.string().min(1).max(100) }), body);
    return this.games.start(user.id, caseSlug);
  }

  @Get('games/:id')
  show(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.games.show(user.id, id);
  }

  @Post('games/:id/turns')
  @HttpCode(200)
  turn(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { text } = parseBody(
      z.object({ text: z.string().trim().min(1, 'écris quelque chose').max(MAX_PLAYER_TEXT, `${MAX_PLAYER_TEXT} caractères maximum`) }),
      body,
    );
    return this.games.playTurn(user.id, id, text);
  }

  @Post('games/:id/resolution')
  @HttpCode(200)
  resolution(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.games.goToResolution(user.id, id);
  }
}
