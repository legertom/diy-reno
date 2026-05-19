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
      />
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-32 sm:px-8 sm:pt-16">
        <header className="max-w-xl">
          <Eyebrow>Project Foreman</Eyebrow>
          <h1 className="font-display mt-4 text-[clamp(2rem,6vw,3.5rem)] text-ink">
            Plan the whole job
          </h1>
          <p className="mt-3 max-w-md text-base text-ink-soft">
            Ask about sequencing and approach, or tell the Foreman to{" "}
            <span className="text-ink">add</span> and{" "}
            <span className="text-ink">reorder</span> tasks. For status,
            notes, time or rewriting one task&apos;s plan, open that task.
          </p>
        </header>

        <Card className="mt-10 p-5 sm:p-7">
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
