// Timezone helpers built on Intl (no dependencies). All functions take and
// return absolute instants (Date); "local" means wall-clock in `tz`.

/**
 * The canonical IANA name for a zone, or null if Intl doesn't know it.
 * Intl matches names case-insensitively, so every caller-supplied zone goes
 * through this before it is stored, echoed or used as a cache key.
 */
export function canonicalTimezone(tz: string | null | undefined): string | null {
  if (!tz || tz.length > 64) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isValidTimezone(tz: string): boolean {
  return canonicalTimezone(tz) !== null;
}

// ICU formatters are expensive (tens of KB each); keep one per canonical
// zone, bounded so no input can grow them without limit.
const MAX_CACHED_ZONES = 200;

function cached(cache: Map<string, Intl.DateTimeFormat>, tz: string, make: () => Intl.DateTimeFormat) {
  let f = cache.get(tz);
  if (!f) {
    if (cache.size >= MAX_CACHED_ZONES) cache.clear();
    f = make();
    cache.set(tz, f);
  }
  return f;
}

const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>();
const partsFormatters = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD of the instant in `tz`. */
export function localDateKey(d: Date, tz: string): string {
  return cached(dateKeyFormatters, tz, () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
  ).format(d);
}

/** Offset of `tz` from UTC at instant `d`, in ms (e.g. -3h for America/Sao_Paulo). */
function tzOffsetMs(tz: string, d: Date): number {
  const f = cached(partsFormatters, tz, () =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );
  const parts = f.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const truncated = Math.floor(d.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

const HOUR = 3600 * 1000;

/** First instant in [lo, hi] whose local date is `key` (lo is before it, hi on it). */
function firstInstantOf(key: string, tz: string, lo: number, hi: number): number {
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDateKey(new Date(mid), tz) >= key) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The instant the local date `key` (YYYY-MM-DD) began in `tz`. On days whose
 * midnight doesn't exist (a DST jump at 00:00, e.g. America/Havana) that is
 * the first instant after the jump; on days where midnight repeats, the
 * first occurrence.
 */
export function startOfLocalDate(key: string, tz: string): Date {
  const [y, m, day] = key.split("-").map(Number);
  const wallMidnight = Date.UTC(y, m - 1, day);
  let t = wallMidnight - tzOffsetMs(tz, new Date(wallMidnight));
  // Re-evaluate the offset at the candidate instant (DST transitions).
  t = wallMidnight - tzOffsetMs(tz, new Date(t));
  if (localDateKey(new Date(t), tz) < key) {
    // Landed before the day (its midnight was skipped): search forward.
    t = firstInstantOf(key, tz, t, t + 3 * HOUR);
  } else if (localDateKey(new Date(t - 1), tz) === key) {
    // An earlier instant is already on this day: search backward.
    t = firstInstantOf(key, tz, t - 3 * HOUR, t);
  }
  return new Date(t);
}

/** The instant local midnight began on the local day containing `d`. */
export function startOfLocalDay(d: Date, tz: string): Date {
  return startOfLocalDate(localDateKey(d, tz), tz);
}

/** Every local midnight strictly between `a` and `b`. */
export function midnightsBetween(a: Date, b: Date, tz: string): Date[] {
  const out: Date[] = [];
  let cursor = startOfLocalDay(a, tz);
  // 26h hop always lands inside the next local day, even across DST.
  for (let i = 0; i < 1000; i++) {
    cursor = startOfLocalDay(new Date(cursor.getTime() + 26 * HOUR), tz);
    if (cursor.getTime() >= b.getTime()) break;
    if (cursor.getTime() > a.getTime()) out.push(cursor);
  }
  return out;
}
