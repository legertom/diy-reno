import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** "2h 35m" from seconds. */
export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Pull a leading number from estimate strings like "2–4h" / "30m" → hours. */
export function estimateToHours(estimate?: string | null): number {
  if (!estimate) return 0;
  const m = estimate.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return /m\b/.test(estimate) && !/h/.test(estimate) ? n / 60 : n;
}

export function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
