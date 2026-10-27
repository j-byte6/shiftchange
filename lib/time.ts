// Shifts are stored as a local date plus clock times ("2026-11-02", "17:00", "23:00").
// A shift whose end is at or before its start runs past midnight.

export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function minutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function shiftHours(start: string, end: string) {
  let mins = minutes(end) - minutes(start);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

// Minutes since 1970-01-01 local time, for comparing shifts on different days.
function span(date: string, start: string, end: string): [number, number] {
  const day = Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 60000);
  const s = day + minutes(start);
  return [s, s + shiftHours(start, end) * 60];
}

export function overlaps(
  a: { date: string; start: string; end: string },
  b: { date: string; start: string; end: string },
) {
  const [as, ae] = span(a.date, a.start, a.end);
  const [bs, be] = span(b.date, b.start, b.end);
  return as < be && bs < ae;
}

export function formatDay(date: string) {
  const d = new Date(date + "T12:00:00Z");
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${suffix}`;
}

export function formatShift(s: { date: string; start: string; end: string }) {
  return `${formatDay(s.date)}, ${formatTime(s.start)} to ${formatTime(s.end)}`;
}

export function timeAgo(when: Date, now = new Date()) {
  const m = Math.round((now.getTime() - when.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
export const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
