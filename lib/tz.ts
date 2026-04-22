const SLUG_TO_IANA: Record<string, string> = {
  "asia-karachi": "Asia/Karachi",
  utc: "UTC",
};

export function resolveTimezone(slug: string): string {
  return SLUG_TO_IANA[slug] ?? slug;
}

let _cachedTz: string | null = null;
let _tzCacheTime = 0;
const TZ_CACHE_TTL = 60_000;

export async function getTz(): Promise<string> {
  if (_cachedTz && Date.now() - _tzCacheTime < TZ_CACHE_TTL) return _cachedTz;
  const { default: SystemSettings } = await import("@/lib/models/SystemSettings");
  const s = await SystemSettings.findOne({ key: "global" }).select("company.timezone").lean();
  _cachedTz = resolveTimezone((s?.company as { timezone?: string })?.timezone ?? "asia-karachi");
  _tzCacheTime = Date.now();
  return _cachedTz;
}

export function dateParts(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return {
    year: parseInt(map.year),
    month: parseInt(map.month) - 1,
    day: parseInt(map.day),
    hour: parseInt(map.hour === "24" ? "0" : map.hour),
    minute: parseInt(map.minute),
    second: parseInt(map.second),
  };
}

/**
 * Build a Date for a specific wall-clock time in the given IANA timezone.
 * Works by computing the UTC offset for that timezone and adjusting.
 */
export function dateInTz(
  y: number, mo: number, d: number,
  h: number, mi: number, s: number,
  tz: string,
): Date {
  const ref = Date.UTC(y, mo, d, h, mi, s);
  const local = dateParts(new Date(ref), tz);
  const localAsUtc = Date.UTC(
    local.year, local.month, local.day,
    local.hour, local.minute, local.second,
  );
  return new Date(ref - (localAsUtc - ref));
}

