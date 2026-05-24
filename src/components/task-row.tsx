"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Check,
  Clock,
  StickyNote,
  Image as ImageIcon,
} from "lucide-react";
import { setTaskStatus } from "@/app/actions";
import { Badge } from "@/components/ui";
import { PhotoCameraButton } from "@/components/photo-timeline";
import { cn, formatDuration } from "@/lib/utils";

export type RowTask = {
  id: string;
  projectId: string;
  num: string;
  title: string;
  detail: string | null;
  hoursEstimate: string | null;
  status: "todo" | "in_progress" | "done";
  assigneeLabel: string | null;
  highlighted: boolean;
  noteCount: number;
  photoCount: number;
  loggedSeconds: number;
  guide: {
    tools: string[];
    materials: string[];
    safety: string[];
    steps: string[];
    tips: string[];
  } | null;
};

const assigneeTone: Record<string, string> = {
  tom: "blueprint",
  friends: "brass",
  all: "positive",
};

export function TaskRow({
  task,
  canWrite,
}: {
  task: RowTask;
  canWrite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const done = task.status === "done";

  function toggle() {
    if (!canWrite) return;
    startTransition(() =>
      setTaskStatus(task.id, done ? "todo" : "done"),
    );
  }

  return (
    <div className="border-b border-line/70 last:border-b-0">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!canWrite || pending}
          aria-label={done ? "Mark not done" : "Mark done"}
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border transition-colors",
            done
              ? "border-brass bg-brass text-white"
              : "border-line-strong bg-card hover:border-brass",
            !canWrite && "cursor-not-allowed opacity-60",
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <Link
            href={`/p/${task.projectId}/t/${task.id}`}
            className="block group"
          >
            <p
              className={cn(
                "text-sm font-medium leading-snug",
                done
                  ? "text-ink-faint line-through"
                  : "text-ink group-hover:text-brass",
              )}
            >
              <span className="font-mono text-[11px] text-ink-faint">
                #{task.num}
              </span>{" "}
              {task.title}
            </p>
            {task.detail && (
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-faint">
                {task.detail}
              </p>
            )}
          </Link>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {task.status === "in_progress" && (
              <Badge tone="warn">in progress</Badge>
            )}
            {task.highlighted && <Badge tone="brass">new</Badge>}
            {task.assigneeLabel && (
              <Badge tone={assigneeTone[task.assigneeLabel] ?? "neutral"}>
                {task.assigneeLabel}
              </Badge>
            )}
            {task.hoursEstimate && task.hoursEstimate !== "—" && (
              <Badge>{task.hoursEstimate}</Badge>
            )}
            {task.loggedSeconds > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-positive">
                <Clock className="size-3" /> {formatDuration(task.loggedSeconds)}
              </span>
            )}
            {task.noteCount > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-faint">
                <StickyNote className="size-3" /> {task.noteCount}
              </span>
            )}
            {task.photoCount > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-faint">
                <ImageIcon className="size-3" /> {task.photoCount}
              </span>
            )}
          </div>
        </div>

        <div className="mt-0.5 flex shrink-0 items-center gap-1">
          {canWrite && (
            <PhotoCameraButton
              projectId={task.projectId}
              taskId={task.id}
              pathPrefix={task.id}
              variant="icon"
              ariaLabel={`Add a photo to #${task.num}`}
            />
          )}
          {task.guide && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label="Toggle how-to"
              aria-expanded={open}
              className="grid size-7 place-items-center rounded-md border border-line text-ink-faint transition-colors hover:border-brass hover:text-brass"
            >
              <ChevronRight
                className={cn(
                  "size-3.5 transition-transform",
                  open && "rotate-90",
                )}
              />
            </button>
          )}
        </div>
      </div>

      {open && task.guide && (
        <div className="animate-rise mb-2 ml-8 rounded-r-lg border-l-2 border-brass bg-paper-2/60 px-4 py-3">
          <GuideBlock guide={task.guide} />
        </div>
      )}
    </div>
  );
}

function GuideSection({
  label,
  items,
  danger,
  ordered,
}: {
  label: string;
  items: string[];
  danger?: boolean;
  ordered?: boolean;
}) {
  if (!items?.length) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div className="mb-3 last:mb-0">
      <div
        className={cn(
          "eyebrow mb-1.5",
          danger ? "!text-warn" : "eyebrow-brass",
        )}
      >
        {label}
      </div>
      <List
        className={cn(
          "space-y-1 text-[13px] leading-relaxed text-ink-soft",
          ordered ? "list-decimal pl-5" : "list-none",
        )}
      >
        {items.filter(Boolean).map((it, i) => (
          <li key={i} className={cn(danger && "text-warn")}>
            {!ordered && !danger && (
              <span className="mr-1.5 text-brass">•</span>
            )}
            {danger && <span className="mr-1">⚠</span>}
            {it}
          </li>
        ))}
      </List>
    </div>
  );
}

export function GuideBlock({
  guide,
}: {
  guide: NonNullable<RowTask["guide"]>;
}) {
  return (
    <div>
      <GuideSection label="Tools" items={guide.tools} />
      <GuideSection label="Materials" items={guide.materials} />
      <GuideSection label="Safety" items={guide.safety} danger />
      <GuideSection label="Steps" items={guide.steps} ordered />
      <GuideSection label="Tips" items={guide.tips} />
    </div>
  );
}
