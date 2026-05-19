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
  /** Retained for API compatibility; the skeuomorphic treatments are gone. */
  ticked?: boolean;
  /** A slightly more defined editorial card (stronger hairline). */
  frame?: boolean;
}) {
  void ticked;
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border bg-card text-ink",
        "shadow-[var(--shadow-card)]",
        frame ? "border-line-strong" : "border-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Editorial section header — a rigorous numeral, a tracked kicker, and the
 * dimension-line divider (the one surviving architectural signature):
 *   01  WALL PREP ───────────────────────────
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
    <div className={cn("flex items-baseline gap-4", className)}>
      {index != null && (
        <span className="font-display shrink-0 text-2xl leading-none tracking-tight text-ink tabular-nums">
          {typeof index === "number"
            ? String(index).padStart(2, "0")
            : index}
        </span>
      )}
      <span className="shrink-0 text-[12px] font-semibold tracking-[0.18em] text-ink-soft uppercase">
        {label}
      </span>
      <span className="dim-rule min-w-8 flex-1 translate-y-[-0.3em]" />
      {sheet && (
        <span className="sheet-no shrink-0 text-ink-faint">{sheet}</span>
      )}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  neutral: "bg-paper-2 text-ink-soft border-line-strong",
  blueprint: "bg-blueprint-tint text-blueprint border-line-strong",
  brass: "bg-brass-tint text-brass border-line-strong",
  positive: "bg-positive-tint text-positive border-line-strong",
  warn: "bg-warn-tint text-warn border-line-strong",
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[10px] font-semibold tracking-[0.1em] uppercase whitespace-nowrap",
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
      "bg-blueprint text-white hover:bg-blueprint-deep border border-transparent",
    blueprint:
      "bg-blueprint text-white hover:bg-blueprint-deep border border-transparent",
    secondary:
      "bg-card text-ink border border-line-strong hover:border-ink",
    ghost:
      "bg-transparent text-ink-soft hover:bg-paper-2 border border-transparent",
    danger:
      "bg-transparent text-danger border border-[color:var(--color-danger)]/35 hover:bg-[color:var(--color-danger)]/8",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-4 py-1.5 text-sm" : "px-5 py-2.5 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Measured dimension line — track with end ticks + a filled run. */
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
      <div className="h-px w-full bg-current opacity-20" />
      <div className="absolute top-1/2 left-0 h-2 w-px -translate-y-1/2 bg-current opacity-35" />
      <div className="absolute top-1/2 right-0 h-2 w-px -translate-y-1/2 bg-current opacity-35" />
      <div
        className="absolute top-1/2 left-0 h-[2px] -translate-y-1/2 bg-current transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current transition-[left] duration-500"
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
    <Card frame className="px-8 py-16 text-center">
      <p className="font-display text-2xl text-ink">{title}</p>
      {hint && <p className="mt-2 text-sm text-ink-faint">{hint}</p>}
      {children && <div className="mt-6">{children}</div>}
    </Card>
  );
}
