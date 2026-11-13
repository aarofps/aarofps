// Plain YYYY-MM-DD string helpers, UTC only.
const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(d + "T00:00:00Z");
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY);
export const monthKey = (d: string) => d.slice(0, 7);
export const todayUtc = () => fromMs(Date.now());
export const unixToDate = (s: number) => fromMs(s * 1000);
export const dateToUnix = (d: string) => Math.floor(toMs(d) / 1000);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export const monthStart = (month: string) => `${month}-01`;
export const monthEnd = (month: string) => addDays(monthStart(addMonths(month, 1)), -1);
