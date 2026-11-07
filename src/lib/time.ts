const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "2 days ago", "in 3 hours", "just now". */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = ts - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/** "2026-11-07" -> "Nov 7" */
export function formatDay(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

export function formatRange(start: string, end: string): string {
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

/** Today's date as YYYY-MM-DD in UTC (matches the backend's notion of "today"). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
