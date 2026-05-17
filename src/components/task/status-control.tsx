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
    <div className="inline-flex rounded-lg border border-line-strong bg-paper-2 p-1">
      {OPTIONS.map((o) => {
        const active = o.value === status;
        return (
          <button
            key={o.value}
            type="button"
            disabled={!canWrite || pending}
            onClick={() =>
              startTransition(() => setTaskStatus(taskId, o.value))
            }
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] tracking-wide transition-colors",
              active
                ? o.value === "done"
                  ? "bg-brass font-semibold text-white shadow-[0_1px_3px_rgba(12,27,42,0.25)]"
                  : "bg-blueprint font-semibold text-white shadow-[0_1px_3px_rgba(12,27,42,0.25)]"
                : "font-medium text-ink-soft hover:text-ink",
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
