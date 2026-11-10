// Timezone helpers built on Intl (no dependencies). All functions take and
// return absolute instants (Date); "local" means wall-clock in `tz`.

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD of the instant in `tz`. */
export function localDateKey(d: Date, tz: string): string {
  let f = dateKeyFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateKeyFormatters.set(tz, f);
  }
  return f.format(d);
}

/** Offset of `tz` from UTC at instant `d`, in ms (e.g. -3h for America/Sao_Paulo). */
function tzOffsetMs(tz: string, d: Date): number {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, f);
  }
  const parts = f.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const truncated = Math.floor(d.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/** The instant local midnight began on the local day containing `d`. */
export function startOfLocalDay(d: Date, tz: string): Date {
  const [y, m, day] = localDateKey(d, tz).split("-").map(Number);
  const wallMidnight = Date.UTC(y, m - 1, day);
  let t = wallMidnight - tzOffsetMs(tz, new Date(wallMidnight));
  // Re-evaluate the offset at the candidate instant (DST transitions).
  t = wallMidnight - tzOffsetMs(tz, new Date(t));
  return new Date(t);
}

/** Every local midnight strictly between `a` and `b`. */
export function midnightsBetween(a: Date, b: Date, tz: string): Date[] {
  const out: Date[] = [];
  let cursor = startOfLocalDay(a, tz);
  // 26h hop always lands inside the next local day, even across DST.
  for (let i = 0; i < 1000; i++) {
    cursor = startOfLocalDay(new Date(cursor.getTime() + 26 * 3600 * 1000), tz);
    if (cursor.getTime() >= b.getTime()) break;
    if (cursor.getTime() > a.getTime()) out.push(cursor);
  }
  return out;
}
