"use client";

import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import { Hammer, X, Loader2 } from "lucide-react";
import { TaskChat } from "@/components/task/task-chat";

type Project = { id: string; title: string };
type Loaded = { pid: string; msgs: UIMessage[] };

export function ForemanBubble({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState(projects[0]?.id ?? "");
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!open || !pid) return;
    let alive = true;
    fetch(`/api/chat/history?projectId=${encodeURIComponent(pid)}`)
      .then((r) => r.json())
      .then((d: { messages?: UIMessage[] }) => {
        if (alive) setLoaded({ pid, msgs: d.messages ?? [] });
      })
      .catch(() => {
        if (alive) setLoaded({ pid, msgs: [] });
      });
    return () => {
      alive = false;
    };
  }, [open, pid]);

  if (projects.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the Foreman"
        className="fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full bg-blueprint py-3 pr-5 pl-4 text-white shadow-[var(--shadow-lift)] transition-transform hover:scale-105"
      >
        <Hammer className="size-5" />
        <span className="text-sm font-semibold">Foreman</span>
      </button>
    );
  }

  const ready = loaded !== null && loaded.pid === pid;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center sm:inset-auto sm:right-5 sm:bottom-5">
      <div className="flex h-[82vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-[var(--shadow-lift)] sm:h-[34rem] sm:w-[27rem] sm:rounded-2xl">
        <div className="blueprint-surface flex shrink-0 items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/15 text-white">
              <Hammer className="size-4" />
            </span>
            {projects.length > 1 ? (
              <select
                value={pid}
                onChange={(e) => setPid(e.target.value)}
                className="max-w-[14rem] min-w-0 truncate rounded border border-white/25 bg-white/10 px-2 py-1 text-xs text-white outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="text-ink">
                    {p.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-sm font-semibold text-white">
                Foreman ·{" "}
                <span className="font-normal text-[#bcd0e6]">
                  {projects[0]?.title}
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid size-7 shrink-0 place-items-center rounded text-[#cfe0f2] hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {ready ? (
            <TaskChat
              key={pid}
              projectId={pid}
              taskId={null}
              initialMessages={loaded.msgs}
            />
          ) : (
            <div className="grid h-full place-items-center text-ink-faint">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
