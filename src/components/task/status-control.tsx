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
    <div className="inline-flex rounded-lg border border-line-strong bg-paper p-0.5">
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
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? o.value === "done"
                  ? "bg-brass text-white"
                  : "bg-blueprint text-white"
                : "text-ink-faint hover:text-ink",
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
