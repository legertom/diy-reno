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
}: {
  children: ReactNode;
  className?: string;
  ticked?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-card",
        "shadow-[var(--shadow-card)]",
        ticked && "ticked",
        className,
      )}
    >
      {children}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  neutral: "bg-paper-2 text-ink-faint border-line",
  blueprint: "bg-blueprint-tint text-blueprint border-[#c9d8e8]",
  brass: "bg-brass-tint text-brass border-[#e6d6b8]",
  positive: "bg-positive-tint text-positive border-[#cfe0cb]",
  warn: "bg-warn-tint text-warn border-[#e9d2bd]",
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
        "font-mono text-[10px] font-medium tracking-wide uppercase whitespace-nowrap",
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
      "bg-brass text-white hover:bg-[#977244] border border-transparent",
    blueprint:
      "bg-blueprint text-white hover:bg-[#0f2c54] border border-transparent",
    secondary:
      "bg-card text-ink border border-line-strong hover:border-brass hover:text-brass",
    ghost: "bg-transparent text-ink-soft hover:bg-paper-2 border border-transparent",
    danger:
      "bg-transparent text-danger border border-[#e3c4bd] hover:bg-[#f7e9e6]",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

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
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-paper-2", className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-brass to-blueprint-2 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
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
    <Card ticked className="px-8 py-14 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      {hint && <p className="mt-2 text-sm text-ink-faint">{hint}</p>}
      {children && <div className="mt-6">{children}</div>}
    </Card>
  );
}
