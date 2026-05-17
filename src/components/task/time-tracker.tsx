"use client";

import { useEffect, useState, useTransition } from "react";
import { Play, Square, Trash2, Plus } from "lucide-react";
import {
  startTimer,
  stopTimer,
  addManualTime,
  deleteTimeLog,
} from "@/app/actions";
import { Button } from "@/components/ui";
import { cn, formatDuration } from "@/lib/utils";

type Log = {
  id: string;
  userName: string;
  startedAt: string | Date;
  endedAt: string | Date | null;
  seconds: number | null;
  note: string | null;
};

export function TimeTracker({
  taskId,
  logs,
  totalSeconds,
  running,
  canWrite,
}: {
  taskId: string;
  logs: Log[];
  totalSeconds: number;
  running: { startedAt: string | Date } | null;
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const [minutes, setMinutes] = useState("");
  const [manualNote, setManualNote] = useState("");

  useEffect(() => {
    if (!running) return;
    const start = new Date(running.startedAt).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [running]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
            Total logged
          </p>
          <p className="font-display text-2xl text-ink">
            {formatDuration(totalSeconds + (running ? elapsed : 0))}
          </p>
        </div>
        {canWrite &&
          (running ? (
            <Button
              variant="danger"
              onClick={() => startTransition(() => stopTimer(taskId))}
              disabled={pending}
            >
              <Square className="size-4" />
              Stop · {formatDuration(elapsed)}
            </Button>
          ) : (
            <Button
              variant="blueprint"
              onClick={() => startTransition(() => startTimer(taskId))}
              disabled={pending}
            >
              <Play className="size-4" />
              Start timer
            </Button>
          ))}
      </div>

      {canWrite && (
        <form
          action={() => {
            const m = parseFloat(minutes);
            if (!m || m <= 0) return;
            const note = manualNote.trim();
            setMinutes("");
            setManualNote("");
            startTransition(() =>
              addManualTime(taskId, m, note || undefined),
            );
          }}
          className="mt-4 flex flex-wrap gap-2"
        >
          <input
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            inputMode="decimal"
            placeholder="Log minutes"
            className="w-28 rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          />
          <input
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            placeholder="What you did (optional)"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={pending || !minutes}
          >
            <Plus className="size-4" /> Add
          </Button>
        </form>
      )}

      <ul className="mt-4 space-y-1.5">
        {logs.map((l) => (
          <li
            key={l.id}
            className={cn(
              "group flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2 text-sm",
              !l.endedAt && "border-blueprint/40 bg-blueprint-tint/40",
            )}
          >
            <span className="font-mono text-xs text-ink">
              {l.endedAt
                ? formatDuration(l.seconds ?? 0)
                : "running…"}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-faint">
              {l.userName}
              {l.note ? ` · ${l.note}` : ""}
            </span>
            <span className="font-mono text-[10px] text-ink-faint">
              {new Date(l.startedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={() => startTransition(() => deleteTimeLog(l.id))}
                className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                aria-label="Delete log"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
        {logs.length === 0 && (
          <li className="text-sm text-ink-faint">No time logged yet.</li>
        )}
      </ul>
    </div>
  );
}
