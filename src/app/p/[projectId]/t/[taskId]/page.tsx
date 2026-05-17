import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import {
  getProjectOr404,
  getTaskDetail,
  getTaskChat,
  getUserTools,
  canWrite as canWriteRole,
} from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow, Badge } from "@/components/ui";
import { GuideBlock } from "@/components/task-row";
import { StatusControl } from "@/components/task/status-control";
import { NotesPanel } from "@/components/task/notes-panel";
import { ShoppingList } from "@/components/task/shopping-list";
import { TimeTracker } from "@/components/task/time-tracker";
import { PhotoUploader } from "@/components/task/photo-uploader";
import { TaskChat } from "@/components/task/task-chat";
import { TaskToolCheck } from "@/components/task/task-tool-check";

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <Eyebrow brass>{label}</Eyebrow>
      <div className="rule mt-2 mb-3" />
      <Card className="p-4 sm:p-5">{children}</Card>
    </section>
  );
}

export default async function TaskPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const { user, role, project } = await getProjectOr404(projectId);
  const writable = canWriteRole(role);

  const [detail, chat, ownedTools] = await Promise.all([
    getTaskDetail(projectId, taskId),
    getTaskChat(taskId),
    getUserTools(user.id),
  ]);
  if (!detail) notFound();

  const { task, guide, notes, shopping, timeLogs, photos, totalSeconds } =
    detail;
  const running =
    timeLogs.find((l) => l.userId === user.id && !l.endedAt) ?? null;

  const guideData = guide
    ? {
        tools: guide.tools,
        materials: guide.materials,
        safety: guide.safety,
        steps: guide.steps,
        tips: guide.tips,
      }
    : null;
  const hasGuide =
    guideData &&
    (guideData.tools.length ||
      guideData.materials.length ||
      guideData.safety.length ||
      guideData.steps.length ||
      guideData.tips.length);

  return (
    <>
      <AppHeader
        user={user}
        crumb={{ href: `/p/${projectId}`, label: project.title }}
      />
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28">
        <Card className="px-6 py-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs text-ink-faint">
              #{task.num}
            </span>
            {task.status === "in_progress" && (
              <Badge tone="warn">in progress</Badge>
            )}
            {task.status === "done" && <Badge tone="positive">done</Badge>}
            {task.highlighted && <Badge tone="brass">new</Badge>}
            {task.assigneeLabel && (
              <Badge tone="blueprint">{task.assigneeLabel}</Badge>
            )}
            {task.hoursEstimate && task.hoursEstimate !== "—" && (
              <Badge>{task.hoursEstimate}</Badge>
            )}
          </div>
          <h1 className="font-display mt-2 text-2xl text-ink sm:text-3xl">
            {task.title}
          </h1>
          {task.detail && (
            <p className="mt-2 text-sm text-ink-soft">{task.detail}</p>
          )}
          <div className="mt-4">
            <StatusControl
              taskId={task.id}
              status={task.status}
              canWrite={writable}
            />
          </div>
        </Card>

        {hasGuide && (
          <Section label="The plan">
            <GuideBlock guide={guideData!} />
          </Section>
        )}

        {guideData && guideData.tools.length > 0 && (
          <Section label="Tools for this step">
            <TaskToolCheck
              plannedTools={guideData.tools}
              ownedTools={ownedTools.map((t) => t.name)}
            />
          </Section>
        )}

        <Section label="Ask the expert">
          <TaskChat
            projectId={projectId}
            taskId={taskId}
            initialMessages={chat as UIMessage[]}
          />
        </Section>

        <Section label="Photos">
          <PhotoUploader
            projectId={projectId}
            taskId={taskId}
            photos={photos.map((p) => ({
              id: p.id,
              url: p.url,
              caption: p.caption,
            }))}
            canWrite={writable}
          />
        </Section>

        <Section label="Time">
          <TimeTracker
            taskId={taskId}
            totalSeconds={totalSeconds}
            running={running ? { startedAt: running.startedAt } : null}
            canWrite={writable}
            logs={timeLogs.map((l) => ({
              id: l.id,
              userName: l.userName,
              startedAt: l.startedAt,
              endedAt: l.endedAt,
              seconds: l.seconds,
              note: l.note,
            }))}
          />
        </Section>

        <Section label="Notes">
          <NotesPanel
            taskId={taskId}
            canWrite={writable}
            notes={notes.map((n) => ({
              id: n.id,
              body: n.body,
              authorName: n.authorName,
              createdAt: n.createdAt,
            }))}
          />
        </Section>

        <Section label="Items to buy">
          <ShoppingList
            projectId={projectId}
            taskId={taskId}
            canWrite={writable}
            items={shopping.map((s) => ({
              id: s.id,
              label: s.label,
              quantity: s.quantity,
              purchased: s.purchased,
            }))}
          />
        </Section>
      </main>
    </>
  );
}
