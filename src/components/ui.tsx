import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

export function Eyebrow({
  children,
  brass,
  className,
}: {
  children: ReactNode;
  brass?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("eyebrow", brass && "eyebrow-brass", className)}>
      {children}
    </div>
  );
}

export function Card({
  children,
  className,
  ticked,
  frame,
}: {
  children: ReactNode;
  className?: string;
  ticked?: boolean;
  /** Drawing-sheet treatment: inset double hairline + brass corner ticks. */
  frame?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-card text-ink",
        "shadow-[var(--shadow-card)]",
        ticked && "ticked",
        frame && "sheet-frame tick-corners",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Architectural section header — a numbered drawing label:
 *   ▭01  WALL PREP ─────────────────── A-2
 * Replaces the plain eyebrow+rule pattern across the app.
 */
export function SectionHeader({
  index,
  label,
  sheet,
  className,
}: {
  index?: string | number;
  label: ReactNode;
  sheet?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {index != null && (
        <span className="grid h-6 min-w-6 shrink-0 place-items-center border border-brass/45 bg-brass-tint px-1 font-mono text-[11px] font-semibold tracking-wide text-brass">
          {index}
        </span>
      )}
      <span className="shrink-0 text-[12px] font-semibold tracking-[0.13em] text-ink uppercase">
        {label}
      </span>
      <span className="dim-rule min-w-6 flex-1" />
      {sheet && (
        <span className="sheet-no shrink-0 text-ink-faint">{sheet}</span>
      )}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  neutral: "bg-paper-2 text-ink-faint border-line-strong",
  blueprint: "bg-blueprint-tint text-blueprint border-[#bcd0e6]",
  brass: "bg-brass-tint text-brass border-[#e2cfa6]",
  positive: "bg-positive-tint text-positive border-[#c5d8c3]",
  warn: "bg-warn-tint text-warn border-[#e6cdb2]",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5",
        "font-mono text-[9.5px] font-semibold tracking-[0.12em] uppercase whitespace-nowrap",
        badgeTones[tone] ?? badgeTones.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "blueprint";
  size?: "sm" | "md";
}) {
  const variants = {
    primary:
      "bg-brass text-white hover:bg-[#946f3c] border border-transparent shadow-[0_1px_2px_rgba(10,24,34,0.2)]",
    blueprint:
      "bg-blueprint text-white hover:bg-[#0c2f50] border border-transparent shadow-[0_1px_2px_rgba(10,24,34,0.2)]",
    secondary:
      "bg-card text-ink border border-line-strong hover:border-brass hover:text-brass",
    ghost:
      "bg-transparent text-ink-soft hover:bg-paper-2 border border-transparent",
    danger:
      "bg-transparent text-danger border border-[#dcbcb4] hover:bg-[#f6e8e5]",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Measured dimension line — track with end ticks + brass fill. */
export function ProgressBar({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const pct = total ? Math.round((100 * done) / total) : 0;
  return (
    <div className={cn("relative", className)}>
      <div className="h-px w-full bg-current opacity-25" />
      <div className="absolute top-1/2 left-0 h-2 w-px -translate-y-1/2 bg-current opacity-40" />
      <div className="absolute top-1/2 right-0 h-2 w-px -translate-y-1/2 bg-current opacity-40" />
      <div
        className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 bg-brass-2 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-brass-2 transition-[left] duration-500"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <Card frame className="px-8 py-14 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      {hint && <p className="mt-2 text-sm text-ink-faint">{hint}</p>}
      {children && <div className="mt-6">{children}</div>}
    </Card>
  );
}
