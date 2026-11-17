/** Every "day" of the game (quota, dashboard) is a day in this time zone, whatever the server's own. */
export const APP_TIMEZONE = 'Europe/Paris';

const MIN_SECRET_LENGTH = 32;

/** Returns why the JWT secret is unsafe in production, or null if it is fine. */
export function jwtSecretProblem(secret: string | undefined, production: boolean): string | null {
  if (!production) return null;
  if (!secret) return 'JWT_SECRET is not set';
  if (secret.toLowerCase().startsWith('change-me')) return 'JWT_SECRET is still the example value';
  if (secret.length < MIN_SECRET_LENGTH) return `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`;
  return null;
}

/** "YYYY-MM-DD" of an instant, in the app time zone. */
export function dayKey(date: Date, tz = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Offset of the time zone at this instant, in ms (Paris: +1 h or +2 h). */
function offsetMs(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    })
      .formatToParts(date)
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Midnight, in the app time zone, of the day `daysAgo` days before the day of `now`. */
export function startOfDay(now = new Date(), daysAgo = 0, tz = APP_TIMEZONE): Date {
  // Noon of the target day avoids any daylight saving edge.
  const noon = new Date(`${dayKey(now, tz)}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() - daysAgo);
  const midnightGuess = new Date(`${noon.toISOString().slice(0, 10)}T00:00:00Z`);
  return new Date(midnightGuess.getTime() - offsetMs(midnightGuess, tz));
}
