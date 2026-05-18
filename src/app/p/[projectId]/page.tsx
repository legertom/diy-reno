import Link from "next/link";
import { Users, Compass, Hammer } from "lucide-react";
import {
  getProjectOr404,
  getBoard,
  computeNextUp,
  canWrite as canWriteRole,
  type TaskWithGuide,
} from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  Eyebrow,
  ProgressBar,
  SectionHeader,
} from "@/components/ui";
import { TaskRow, type RowTask } from "@/components/task-row";
import { ProjectEditor } from "@/components/project-editor";

const stripNo = (s: string) =>
  s.replace(/^\s*\d+(\.\d+)?\s*[—.)\-:]?\s*/i, "").trim() || s;

function toRow(t: TaskWithGuide): RowTask {
  return {
    id: t.id,
    projectId: t.projectId,
    num: t.num,
    title: t.title,
    detail: t.detail,
    hoursEstimate: t.hoursEstimate,
    status: t.status,
    assigneeLabel: t.assigneeLabel,
    highlighted: t.highlighted,
    noteCount: t.noteCount,
    photoCount: t.photoCount,
    loggedSeconds: t.loggedSeconds,
    guide: t.guide,
  };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user, role, project } = await getProjectOr404(projectId);
  const writable = canWriteRole(role);

  const board = await getBoard(projectId);
  const nextUp = computeNextUp(board);
  const { done, total } = board.progress;

  return (
    <>
      <AppHeader
        user={user}
        crumb={{ href: "/", label: "Projects" }}
        sheet="A-2"
      />
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28">
        {/* Header / blueprint title block */}
        <div className="blueprint-surface sheet-frame tick-corners rounded-[var(--radius-card)] px-7 py-7 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow className="!text-[#7fa6cb]">
                {role === "owner"
                  ? "Drawing set · Lead builder"
                  : `Drawing set · Shared (${role})`}
              </Eyebrow>
              <h1 className="font-display mt-2 text-3xl leading-[1.05] text-white sm:text-[2.6rem]">
                {project.title}
              </h1>
              {project.summary && (
                <p className="mt-2 max-w-md text-sm text-[#aec6de]">
                  {project.summary}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/p/${projectId}/foreman`}
                className="grid size-9 place-items-center border border-white/25 text-[#cfe0f2] transition-colors hover:border-brass-2 hover:text-white"
                aria-label="Ask the project Foreman"
              >
                <Hammer className="size-4" />
              </Link>
              <Link
                href={`/p/${projectId}/settings`}
                className="grid size-9 place-items-center border border-white/25 text-[#cfe0f2] transition-colors hover:border-brass-2 hover:text-white"
                aria-label="Collaborators"
              >
                <Users className="size-4" />
              </Link>
            </div>
          </div>

          <div className="mt-7">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] tracking-[0.22em] text-[#7fa6cb] uppercase">
                Overall progress
              </span>
              <span className="font-mono text-sm text-white">
                {done}
                <span className="text-[#7fa6cb]"> / {total}</span>
              </span>
            </div>
            <ProgressBar
              done={done}
              total={total}
              className="mt-3 h-3 text-white"
            />
          </div>
        </div>

        {/* Project brief / details editor */}
        <div className="mt-4 flex justify-end">
          <ProjectEditor
            projectId={projectId}
            title={project.title}
            summary={project.summary}
            brief={project.brief}
            canWrite={writable}
          />
        </div>

        {/* Project Foreman entry */}
        <Link
          href={`/p/${projectId}/foreman`}
          className="group mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-blueprint/25 bg-blueprint-tint px-5 py-3.5 transition-colors hover:border-blueprint"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-blueprint text-white">
            <Hammer className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              Ask the project Foreman
            </span>
            <span className="block text-xs text-ink-soft">
              Plan the job, or have it add &amp; reorder tasks
            </span>
          </span>
          <span className="font-mono text-[10px] tracking-[0.16em] text-blueprint uppercase">
            Open →
          </span>
        </Link>

        {/* Next up — first unfinished task in order */}
        {nextUp && (
          <Link
            href={`/p/${projectId}/t/${nextUp.task.id}`}
            className="group mt-4 block"
          >
            <Card className="border-brass/40 bg-brass-tint/50 px-5 py-4 transition-colors group-hover:border-brass">
              <div className="flex items-center gap-2">
                <Compass className="size-3.5 text-brass" />
                <Eyebrow brass>Next up</Eyebrow>
              </div>
              <p className="font-display mt-1.5 text-lg text-ink">
                #{nextUp.task.num} — {nextUp.task.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">
                {stripNo(nextUp.phaseName)}
                {nextUp.task.detail ? ` · ${nextUp.task.detail}` : ""}
              </p>
            </Card>
          </Link>
        )}

        <div className="mt-7 space-y-7">
          {board.phases.map((phase, pi) => (
            <div key={phase.id}>
              <SectionHeader
                index={String(pi + 1).padStart(2, "0")}
                label={stripNo(phase.name)}
                sheet="PHASE"
                className="mb-3"
              />
              <Card className="overflow-hidden px-1">
                {phase.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={toRow(t)}
                    canWrite={writable}
                  />
                ))}
                {phase.tasks.length === 0 && (
                  <p className="px-4 py-3 text-sm text-ink-faint">
                    No tasks in this phase.
                  </p>
                )}
              </Card>
            </div>
          ))}

          {board.orphans.length > 0 && (
            <div>
              <SectionHeader
                index="·"
                label="Unphased"
                sheet="MISC"
                className="mb-3"
              />
              <Card className="overflow-hidden px-1">
                {board.orphans.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={toRow(t)}
                    canWrite={writable}
                  />
                ))}
              </Card>
            </div>
          )}

          {board.allTasks.length === 0 && (
            <Card frame className="px-7 py-10 text-center">
              <p className="font-display text-lg">No tasks yet</p>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
