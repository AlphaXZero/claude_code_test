import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Integration tests: the built API (dist/), a real PostgreSQL, the fake AI provider.
 * Run with: TEST_DATABASE_URL=postgresql://…/caseprompt_test npm run test:int
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is not set (a database whose name contains "test"; its tables are emptied)');
if (!/test/i.test(new URL(url).pathname)) throw new Error('TEST_DATABASE_URL must point to a database whose name contains "test"');

process.env.DATABASE_URL = url;
process.env.AI_PROVIDER = 'fake';
process.env.JWT_SECRET = 'integration-test-secret';
const dist = join(__dirname, '..', '..', 'dist');

let base = '';
let close: () => Promise<void>;
let prisma: { aiCall: { count(args: object): Promise<number> }; $disconnect(): Promise<void> };

interface Res { status: number; body: any }
async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
const register = async (email: string) =>
  (await call('POST', '/auth/register', undefined, { email, password: 'motdepasse' })).body.token as string;

let alice = '';
let bob = '';
let admin = '';
let aliceGame = '';

beforeAll(async () => {
  // Brings the test database to the current schema (creates it if needed). Never destructive.
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  // Node's own require for the whole app, so every class exists once (Vitest's loader would make copies).
  const req = createRequire(join(dist, 'main.js'));
  const { NestFactory } = req('@nestjs/core');
  const { AppModule } = req('./app.module');
  const { setupApp } = req('./app.setup');
  const { importAllCases } = req('./cases/case-store');
  const { PrismaService } = req('./prisma/prisma.service');
  const { AuthService } = req('./auth/auth');

  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  setupApp(app);
  prisma = app.get(PrismaService);
  // Start from empty tables. The guard at the top of the file only allows a database named "…test…".
  await (prisma as any).$executeRawUnsafe(
    'TRUNCATE "AiCall", "Turn", "Condition", "Game", "User", "Ending", "Action", "Item", "Case", "Setting" CASCADE',
  );
  await importAllCases(prisma);
  await app.get(AuthService).ensureAdmin('admin@test.local', 'adminadmin');
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');
  close = () => app.close();

  alice = await register('alice@test.local');
  bob = await register('bob@test.local');
  admin = (await call('POST', '/auth/login', undefined, { email: 'admin@test.local', password: 'adminadmin' })).body.token;
  aliceGame = (await call('POST', '/games', alice, { caseSlug: 'mort-bureau-pdg' })).body.id;
});

afterAll(async () => {
  await close?.();
});

describe('each player only sees their own games (F5)', () => {
  it('needs a login', async () => {
    expect((await call('GET', '/cases')).status).toBe(401);
    expect((await call('GET', '/cases', 'not-a-token')).status).toBe(401);
  });

  it('the owner can read and play their game', async () => {
    expect((await call('GET', `/games/${aliceGame}`, alice)).status).toBe(200);
    const turn = await call('POST', `/games/${aliceGame}/turns`, alice, { text: 'fouiller_tiroir' });
    expect(turn.status).toBe(200);
    expect(turn.body.gained).toEqual(['Clé en laiton', 'Couteau de cuisine']);
  });

  it('another player can neither read, play nor end it', async () => {
    for (const [method, path, body] of [
      ['GET', `/games/${aliceGame}`, undefined],
      ['POST', `/games/${aliceGame}/turns`, { text: 'fouiller_tiroir' }],
      ['POST', `/games/${aliceGame}/resolution`, undefined],
    ] as const) {
      const r = await call(method, path, bob, body);
      expect(r.status, `${method} ${path}`).toBe(404);
      expect(r.body.message).toBe('Partie introuvable.');
    }
    const cases = await call('GET', '/cases', bob);
    expect(cases.body[0].lastGame).toBeNull();
  });

  it('never sends the hidden parts of the case', async () => {
    const r = await call('GET', `/games/${aliceGame}`, alice);
    const text = JSON.stringify(r.body);
    for (const hidden of ['truth', 'aiGuidance', 'meaning', 'aiHint', 'conditions', 'Delorme l\'a tué']) {
      expect(text).not.toContain(hidden);
    }
  });
});

describe('administration', () => {
  it('is refused to players', async () => {
    expect((await call('GET', '/admin/stats', alice)).status).toBe(403);
    expect((await call('GET', '/admin/users', alice)).status).toBe(403);
    expect((await call('PUT', '/admin/fake-mode', alice, { mode: 'timeout' })).status).toBe(403);
  });

  it('answers 404 in French for an unknown user, not 500', async () => {
    const r = await call('PATCH', '/admin/users/00000000-0000-4000-8000-000000000000/plan', admin, { plan: 'PREMIUM' });
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Élément introuvable.');
  });

  it('answers in French for an unknown route and a malformed id', async () => {
    const r = await call('GET', '/nope', alice);
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Page introuvable.');
    const bad = await call('GET', '/games/pas-un-uuid', alice);
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Requête invalide.');
  });

  it('shows costs per day keyed by the Paris day', async () => {
    const r = await call('GET', '/admin/stats?days=7', admin);
    expect(r.status).toBe(200);
    expect(r.body.timezone).toBe('Europe/Paris');
    expect(r.body.perDay.at(-1).day).toBe(r.body.today);
  });
});

describe('quota (F11) and failures (F12)', () => {
  const used = async () => (await call('GET', '/me', alice)).body.quota.used as number;

  it('an unusable answer is billed, so it counts; an outage does not', async () => {
    const before = await used();

    await call('PUT', '/admin/fake-mode', admin, { mode: 'invalid' });
    const invalid = await call('POST', `/games/${aliceGame}/turns`, alice, { text: 'je regarde' });
    expect(invalid.status).toBe(502);
    expect(invalid.body.code).toBe('AI_INVALID');
    expect(await used()).toBe(before + 1);

    await call('PUT', '/admin/fake-mode', admin, { mode: 'timeout' });
    const timeout = await call('POST', `/games/${aliceGame}/turns`, alice, { text: 'je regarde' });
    expect(timeout.status).toBe(504);
    expect(await used()).toBe(before + 1);

    await call('PUT', '/admin/fake-mode', admin, { mode: 'off' });
    // Neither failure was saved as a turn.
    const game = await call('GET', `/games/${aliceGame}`, alice);
    expect(game.body.turns).toHaveLength(1);
  });
});

describe('account deletion (O7)', () => {
  it('deletes the account and its games, keeps the call log without the user', async () => {
    const carol = await register('carol@test.local');
    const game = (await call('POST', '/games', carol, { caseSlug: 'mort-bureau-pdg' })).body.id;
    await call('POST', `/games/${game}/turns`, carol, { text: 'je regarde' });
    const logBefore = await prisma.aiCall.count({ where: { gameId: game } });

    expect((await call('DELETE', '/me', carol, { password: 'mauvais' })).status).toBe(401);
    expect((await call('DELETE', '/me', carol, { password: 'motdepasse' })).status).toBe(204);
    expect((await call('GET', '/me', carol)).status).toBe(401);
    expect(await prisma.aiCall.count({ where: { gameId: game, userId: null } })).toBe(logBefore);
  });
});

// Last: it exhausts the login limit for this IP.
describe('rate limit on login (audit #3)', () => {
  it('blocks password guessing after 10 attempts per minute', async () => {
    const statuses: number[] = [];
    let last: Res | null = null;
    for (let i = 0; i < 12; i++) {
      last = await call('POST', '/auth/login', undefined, { email: 'alice@test.local', password: `essai-${i}` });
      statuses.push(last.status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect(statuses.indexOf(429)).toBeLessThanOrEqual(10);
    expect(last!.body.message).toBe('Trop de tentatives. Attends une minute avant de réessayer.');
  });
});
