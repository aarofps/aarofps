export { formatCents } from "./money/cents";

export function formatPct(p: number | null): string {
  if (p === null) return "";
  return `${p >= 0 ? "+" : ""}${(p * 100).toFixed(1)}%`;
}

export function formatDate(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
