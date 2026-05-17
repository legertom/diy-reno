import Link from "next/link";
import { Users, ListChecks, CalendarRange, Compass } from "lucide-react";
import {
  getProjectOr404,
  getBoard,
  getSchedule,
  computeNextUp,
  canWrite as canWriteRole,
  type TaskWithGuide,
} from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import {
  Card,
  Eyebrow,
  ProgressBar,
  Badge,
  SectionHeader,
} from "@/components/ui";

const stripNo = (s: string) =>
  s.replace(/^\s*(week\s*)?\d+(\.\d+)?\s*[—.)\-:]?\s*/i, "").trim() || s;
import { TaskRow, type RowTask } from "@/components/task-row";
import { cn } from "@/lib/utils";

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
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { projectId } = await params;
  const { view = "schedule" } = await searchParams;
  const { user, role, project } = await getProjectOr404(projectId);
  const writable = canWriteRole(role);

  const [board, schedule] = await Promise.all([
    getBoard(projectId),
    getSchedule(projectId),
  ]);
  const nextUp = computeNextUp(schedule);
  const { done, total } = board.progress;
  const tab = view === "tasks" ? "tasks" : "schedule";

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
            <Link
              href={`/p/${projectId}/settings`}
              className="grid size-9 shrink-0 place-items-center border border-white/25 text-[#cfe0f2] transition-colors hover:border-brass-2 hover:text-white"
              aria-label="Collaborators"
            >
              <Users className="size-4" />
            </Link>
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

        {/* Next up */}
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
                {nextUp.dayLabel}
                {nextUp.task.detail ? ` · ${nextUp.task.detail}` : ""}
              </p>
            </Card>
          </Link>
        )}

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-line">
          <TabLink
            href={`/p/${projectId}?view=schedule`}
            active={tab === "schedule"}
            icon={<CalendarRange className="size-3.5" />}
          >
            Schedule
          </TabLink>
          <TabLink
            href={`/p/${projectId}?view=tasks`}
            active={tab === "tasks"}
            icon={<ListChecks className="size-3.5" />}
          >
            All tasks
          </TabLink>
        </div>

        {tab === "schedule" ? (
          <div className="mt-5 space-y-6">
            {[
              ...schedule.sections,
              ...(schedule.looseDays.length
                ? [{ id: "_loose", title: "", days: schedule.looseDays }]
                : []),
            ].map((section, si) => (
              <div key={section.id}>
                {section.title && (
                  <SectionHeader
                    index={String(si + 1).padStart(2, "0")}
                    label={stripNo(section.title)}
                    sheet={`WK ${si + 1}`}
                    className="mb-3"
                  />
                )}
                <div className="space-y-3">
                  {section.days.map((day) => (
                    <Card
                      key={day.id}
                      className={cn(
                        "overflow-hidden",
                        day.isWeekend && "border-brass/30 bg-brass-tint/30",
                        day.isRest && "border-positive/30 bg-positive-tint/40",
                      )}
                    >
                      <div className="flex items-baseline justify-between border-b border-line/70 px-4 py-2.5">
                        <div>
                          <p className="font-display text-base text-ink">
                            {day.label}
                          </p>
                          {day.sublabel && (
                            <p className="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
                              {day.sublabel}
                            </p>
                          )}
                        </div>
                        {day.tasks.length > 0 && (
                          <Badge>{day.tasks.length} tasks</Badge>
                        )}
                      </div>
                      {day.isRest && !day.tasks.length ? (
                        <p className="px-4 py-3 text-sm text-positive italic">
                          {day.restNote || "Rest / cure day"}
                        </p>
                      ) : (
                        <>
                          <div>
                            {day.tasks.map((t) => (
                              <TaskRow
                                key={t.id}
                                task={toRow(t)}
                                canWrite={writable}
                              />
                            ))}
                          </div>
                          {day.why && (
                            <p className="border-t border-line/70 px-4 py-2.5 text-xs text-ink-faint italic">
                              {day.why}
                            </p>
                          )}
                        </>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            ))}
            {schedule.sections.length === 0 &&
              schedule.looseDays.length === 0 && (
                <Card frame className="px-7 py-10 text-center">
                  <p className="font-display text-lg">No schedule yet</p>
                  <p className="mt-1 text-sm text-ink-faint">
                    Tasks without a scheduled day still show under “All
                    tasks.”
                  </p>
                </Card>
              )}
          </div>
        ) : (
          <div className="mt-5 space-y-6">
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
        )}
      </main>
    </>
  );
}

function TabLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 font-mono text-[11px] tracking-[0.16em] uppercase transition-colors",
        active
          ? "border-brass text-ink"
          : "border-transparent text-ink-faint hover:text-ink-soft",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
