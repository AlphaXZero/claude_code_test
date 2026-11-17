import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth';
import { importAllCases } from './cases/case-store';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me')) {
    throw new Error('JWT_SECRET must be set in production');
  }
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Cases are files in the repository: they are (re)loaded at each start.
  if (process.env.LOAD_CASES_ON_START !== 'false') {
    const slugs = await importAllCases(app.get(PrismaService));
    logger.log(`Cases loaded: ${slugs.join(', ')}`);
  }
  await app.get(AuthService).ensureAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  logger.log(`API on http://localhost:${port}/api (AI provider: ${process.env.AI_PROVIDER || 'fake'})`);
}

bootstrap();
