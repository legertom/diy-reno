import type { UIMessage } from "ai";
import { getProjectOr404, getProjectChat } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow } from "@/components/ui";
import { TaskChat } from "@/components/task/task-chat";

export default async function ProjectForemanPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user, project } = await getProjectOr404(projectId);
  const chat = await getProjectChat(projectId);

  return (
    <>
      <AppHeader
        user={user}
        crumb={{ href: `/p/${projectId}`, label: project.title }}
        sheet="FOREMAN"
      />
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28">
        <div className="blueprint-surface sheet-frame tick-corners rounded-[var(--radius-card)] px-7 py-7 shadow-[var(--shadow-card)]">
          <Eyebrow className="!text-[#7fa6cb]">Project Foreman</Eyebrow>
          <h1 className="font-display mt-2 text-3xl leading-[1.05] text-white sm:text-[2.4rem]">
            Plan the whole job
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#aec6de]">
            Ask about sequencing and approach, or tell the Foreman to{" "}
            <span className="text-white">add</span> and{" "}
            <span className="text-white">reorder</span> tasks. For
            status, notes, time or rewriting one task&apos;s plan, open
            that task.
          </p>
        </div>

        <Card className="mt-6 p-4 sm:p-6">
          <TaskChat
            projectId={projectId}
            taskId={null}
            initialMessages={chat as UIMessage[]}
          />
        </Card>
      </main>
    </>
  );
}
