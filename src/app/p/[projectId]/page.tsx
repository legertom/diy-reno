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
  EmptyState,
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
      <AppHeader user={user} crumb={{ href: "/", label: "Projects" }} />
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-32 sm:px-8 sm:pt-16">
        {/* Editorial title block */}
        <header className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Eyebrow>
              {role === "owner" ? "Lead builder" : `Shared · ${role}`}
            </Eyebrow>
            <h1 className="font-display mt-4 text-[clamp(2.25rem,7vw,4rem)] text-ink">
              {project.title}
            </h1>
            {project.summary && (
              <p className="mt-3 max-w-xl text-base text-ink-soft">
                {project.summary}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/p/${projectId}/foreman`}
              className="grid size-10 place-items-center rounded-full border border-line-strong text-ink-soft transition-colors hover:border-ink hover:text-ink"
              aria-label="Ask the project Foreman"
            >
              <Hammer className="size-4" />
            </Link>
            <Link
              href={`/p/${projectId}/settings`}
              className="grid size-10 place-items-center rounded-full border border-line-strong text-ink-soft transition-colors hover:border-ink hover:text-ink"
              aria-label="Collaborators"
            >
              <Users className="size-4" />
            </Link>
          </div>
        </header>

        <div className="mt-10">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
              Progress
            </span>
            <span className="font-display text-sm text-ink tabular-nums">
              {done}
              <span className="text-ink-faint"> / {total}</span>
            </span>
          </div>
          <ProgressBar
            done={done}
            total={total}
            className="mt-3 h-3 text-ink"
          />
        </div>

        {/* Project brief */}
        <section className="mt-16">
          <SectionHeader index="01" label="Brief" />
          <Card className="mt-6 p-6">
            <ProjectEditor
              projectId={projectId}
              title={project.title}
              summary={project.summary}
              brief={project.brief}
              briefStructured={project.briefStructured}
              canWrite={writable}
            />
          </Card>
        </section>

        {/* Project Foreman entry */}
        <Link
          href={`/p/${projectId}/foreman`}
          className="group mt-6 flex items-center gap-4 border-y border-line py-5 transition-colors"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blueprint text-white">
            <Hammer className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">
              Ask the project Foreman
            </span>
            <span className="block text-xs text-ink-faint">
              Plan the job, or have it add &amp; reorder tasks
            </span>
          </span>
          <span className="text-[11px] font-semibold tracking-[0.16em] text-ink-faint uppercase transition-colors group-hover:text-ink">
            Open
          </span>
        </Link>

        {/* Next up — first unfinished task in order */}
        {nextUp && (
          <Link
            href={`/p/${projectId}/t/${nextUp.task.id}`}
            className="group mt-10 block"
          >
            <div className="flex items-center gap-2">
              <Compass className="size-3.5 text-ink-soft" />
              <Eyebrow>Next up</Eyebrow>
            </div>
            <p className="font-display mt-2 text-2xl text-ink transition-colors group-hover:text-ink-soft">
              <span className="text-ink-faint tabular-nums">
                #{nextUp.task.num}
              </span>{" "}
              {nextUp.task.title}
            </p>
            <p className="mt-1 text-sm text-ink-faint">
              {stripNo(nextUp.phaseName)}
              {nextUp.task.detail ? ` · ${nextUp.task.detail}` : ""}
            </p>
          </Link>
        )}

        <div className="mt-16 space-y-12">
          {board.phases.map((phase, pi) => (
            <div key={phase.id}>
              <SectionHeader
                index={pi + 1}
                label={stripNo(phase.name)}
                className="mb-4"
              />
              <Card className="overflow-hidden">
                {phase.tasks.map((t) => (
                  <TaskRow key={t.id} task={toRow(t)} canWrite={writable} />
                ))}
                {phase.tasks.length === 0 && (
                  <p className="px-5 py-4 text-sm text-ink-faint">
                    No tasks in this phase.
                  </p>
                )}
              </Card>
            </div>
          ))}

          {board.orphans.length > 0 && (
            <div>
              <SectionHeader
                index="—"
                label="Unphased"
                className="mb-4"
              />
              <Card className="overflow-hidden">
                {board.orphans.map((t) => (
                  <TaskRow key={t.id} task={toRow(t)} canWrite={writable} />
                ))}
              </Card>
            </div>
          )}

          {board.allTasks.length === 0 && (
            <EmptyState title="No tasks yet" />
          )}
        </div>
      </main>
    </>
  );
}
