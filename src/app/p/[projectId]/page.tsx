import Link from "next/link";
import Image from "next/image";
import { Users, Compass, Hammer, Sparkles } from "lucide-react";
import {
  getProjectOr404,
  getBoard,
  getProjectPhotos,
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
import { PhotoCameraButton } from "@/components/photo-timeline";
import { DreamHero } from "@/components/dream-hero";

const stripNo = (s: string) =>
  s.replace(/^\s*\d+(\.\d+)?\s*[—.)\-:]?\s*/i, "").trim() || s;

/** The single Foreman line beneath the dream image. Warm and forward-
 *  looking; never a countdown, never a guilt trip. Anxiety-aware per
 *  feedback_dates_anxiety.md — dates are out of scope here on purpose. */
function composeForemanLine(input: {
  nextUpTitle: string | null;
  nextUpPhase: string | null;
  hasDream: boolean;
  total: number;
}): string {
  if (!input.hasDream) {
    if (input.total === 0) return "The Foreman is ready when you are.";
    return "Every photo, every task — built toward this.";
  }
  if (input.nextUpTitle && input.nextUpPhase) {
    const phase = stripNo(input.nextUpPhase).toLowerCase();
    return `One ${phase} day brings you closer to this.`;
  }
  if (input.total === 0) {
    return "This is where you're going.";
  }
  return "Every photo, every task — built toward this.";
}

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

  const [board, photos] = await Promise.all([
    getBoard(projectId),
    getProjectPhotos(projectId),
  ]);
  const nextUp = computeNextUp(board);
  const { done, total } = board.progress;

  const foremanLine = composeForemanLine({
    nextUpTitle: nextUp?.task.title ?? null,
    nextUpPhase: nextUp?.phaseName ?? null,
    hasDream: Boolean(project.dreamImageUrl),
    total,
  });

  const heroShot = project.heroShotPhotoId
    ? photos.find((p) => p.id === project.heroShotPhotoId) ?? null
    : null;

  return (
    <>
      <AppHeader user={user} crumb={{ href: "/", label: "Projects" }} />
      <main className="mx-auto max-w-5xl px-5 pt-6 pb-32 sm:px-8 sm:pt-8">
        {/* The dream — the post-Phase-5.2 headline. */}
        <DreamHero
          projectId={projectId}
          imageUrl={project.dreamImageUrl}
          prompt={project.dreamPrompt}
          renderedAt={project.dreamRenderedAt}
          heroShotUrl={heroShot?.url ?? null}
          heroShotTakenAt={heroShot?.takenAt ?? heroShot?.createdAt ?? null}
          canWrite={writable}
          foremanLine={foremanLine}
        />

        {/* Editorial title block — demoted below the dream. */}
        <header className="mt-12 flex items-start justify-between gap-6">
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

        <section className="mt-16">
          <SectionHeader index="02" label="Photos" />
          <div className="mt-6 flex items-center justify-between gap-3">
            {writable && (
              <PhotoCameraButton
                projectId={projectId}
                pathPrefix="project"
              />
            )}
            {photos.length > 0 && (
              <div className="ml-auto flex items-center gap-3">
                <Link
                  href={`/p/${projectId}/picks`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-[0.18em] text-brass uppercase transition-colors hover:text-ink"
                >
                  <Sparkles className="size-3" /> Foreman&apos;s picks
                </Link>
                <Link
                  href={`/p/${projectId}/photos`}
                  className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase transition-colors hover:text-ink"
                >
                  {photos.length === 1
                    ? "View timeline"
                    : `View all ${photos.length}`}
                </Link>
              </div>
            )}
          </div>
          {photos.length > 0 ? (
            <Link
              href={`/p/${projectId}/photos`}
              className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3"
            >
              {photos.slice(0, 8).map((p) => (
                <div
                  key={p.id}
                  className="relative aspect-square overflow-hidden rounded-lg border border-line bg-paper-2"
                >
                  <Image
                    src={p.url}
                    alt={p.caption ?? "Project photo"}
                    fill
                    sizes="(max-width: 640px) 33vw, 25vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </Link>
          ) : (
            <p className="mt-4 text-sm text-ink-faint">
              No photos yet — shoot or upload to start a timeline.
            </p>
          )}
        </section>

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
