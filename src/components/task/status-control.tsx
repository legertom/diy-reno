"use client";

import { useTransition } from "react";
import { setTaskStatus } from "@/app/actions";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;

export function StatusControl({
  taskId,
  status,
  canWrite,
}: {
  taskId: string;
  status: "todo" | "in_progress" | "done";
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="inline-flex rounded-lg border border-line-strong bg-card p-1">
      {OPTIONS.map((o, i) => {
        const active = o.value === status;
        return (
          <button
            key={o.value}
            type="button"
            /* Only block viewers. Don't disable on `pending` — the native
               disabled style ghosts the labels, which is what made the
               inactive options unreadable. setTaskStatus is last-write-wins. */
            disabled={!canWrite}
            aria-pressed={active}
            onClick={() => {
              if (!active)
                startTransition(() => setTaskStatus(taskId, o.value));
            }}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] transition-colors",
              i > 0 && "ml-0.5",
              active
                ? o.value === "done"
                  ? "bg-brass font-semibold text-white shadow-[0_1px_3px_rgba(10,24,34,0.3)]"
                  : "bg-blueprint font-semibold text-white shadow-[0_1px_3px_rgba(10,24,34,0.3)]"
                : "font-medium text-ink hover:bg-paper-2",
              pending && "opacity-90",
              !canWrite && "cursor-not-allowed",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
