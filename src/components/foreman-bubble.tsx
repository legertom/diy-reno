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

  // Persistent, prominent, bottom-anchored surface — the coach is the
  // product thesis, not a corner afterthought (PLAN §3.4). Full-width dock
  // on mobile (thumb zone, safe-area aware); a clear bar on desktop too.
  if (!open) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-card/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ask the Foreman"
            className="group flex w-full items-center gap-3 py-3"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blueprint text-white">
              <Hammer className="size-4" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold text-ink">
                The Foreman
              </span>
              <span className="block truncate text-xs text-ink-faint">
                Ask how to do this step, what to buy, or “does this look
                right?”
              </span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold tracking-[0.16em] text-ink-faint uppercase transition-colors group-hover:text-ink">
              Open
            </span>
          </button>
        </div>
      </div>
    );
  }

  const ready = loaded !== null && loaded.pid === pid;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center sm:inset-auto sm:right-6 sm:bottom-6">
      <div className="flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-[var(--shadow-lift)] sm:h-[36rem] sm:w-[28rem] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blueprint text-white">
              <Hammer className="size-4" />
            </span>
            {projects.length > 1 ? (
              <select
                value={pid}
                onChange={(e) => setPid(e.target.value)}
                className="max-w-[15rem] min-w-0 truncate rounded-md border border-line-strong bg-card px-2 py-1 text-xs text-ink outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-sm font-semibold text-ink">
                The Foreman ·{" "}
                <span className="font-normal text-ink-faint">
                  {projects[0]?.title}
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint transition-colors hover:bg-paper-2 hover:text-ink"
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
