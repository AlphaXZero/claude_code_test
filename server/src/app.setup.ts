import type { INestApplication } from '@nestjs/common';

/** Settings shared by the real server and the integration tests. */
export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  // Behind Caddy: the client IP (used by the rate limits) comes from X-Forwarded-For.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
}
