import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FAKE_MODES, FakeMode } from './ai.types';

const FAKE_MODE_KEY = 'fake_mode';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 'off' uses the provider of AI_PROVIDER; any other value forces the fake provider in that mode. */
  async fakeMode(): Promise<FakeMode> {
    const s = await this.prisma.setting.findUnique({ where: { key: FAKE_MODE_KEY } });
    return (FAKE_MODES as readonly string[]).includes(s?.value ?? '') ? (s!.value as FakeMode) : 'off';
  }

  async setFakeMode(mode: FakeMode) {
    await this.prisma.setting.upsert({ where: { key: FAKE_MODE_KEY }, create: { key: FAKE_MODE_KEY, value: mode }, update: { value: mode } });
  }
}
