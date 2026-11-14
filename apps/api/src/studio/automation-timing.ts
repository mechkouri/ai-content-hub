/** Whether this is a time zone name the platform knows (for example "Africa/Casablanca"). */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock fields of an instant in a time zone. */
function parts(date: Date, tz: string) {
  const out: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** How far the zone's clock is ahead of UTC at this instant, in milliseconds. */
function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the wall clock of the zone reads this date and time. Handles daylight saving changes. */
function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(new Date(guess), tz);
  return new Date(guess - offsetMs(new Date(first), tz));
}

/**
 * The next time the clock in `timezone` reads `slot` ("HH:MM") that is at least `leadMinutes` away from `now`.
 * That is today's slot if it is far enough ahead, otherwise tomorrow's.
 */
export function nextSlot(now: Date, slot: string, timezone: string, leadMinutes = 15): Date {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(slot);
  if (!m) throw new Error('Invalid time');
  const earliest = now.getTime() + leadMinutes * 60_000;
  const today = parts(now, timezone);
  for (let add = 0; add < 3; add++) {
    // Date.UTC normalises overflowing days into the right month.
    const day = new Date(Date.UTC(today.year, today.month - 1, today.day + add));
    const at = zonedToUtc(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      Number(m[1]),
      Number(m[2]),
      timezone,
    );
    if (at.getTime() >= earliest) return at;
  }
  throw new Error('No time found');
}
