import { notFound } from "next/navigation";
import { getProjectOr404, getMembers } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow } from "@/components/ui";
import { MembersManager } from "@/components/members-manager";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user, role, project } = await getProjectOr404(projectId);
  const data = await getMembers(projectId);
  if (!data) notFound();
  const isOwner = role === "owner";

  return (
    <>
      <AppHeader
        user={user}
        crumb={{ href: `/p/${projectId}`, label: project.title }}
      />
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28">
        <div className="blueprint-surface ticked rounded-[var(--radius-card)] px-6 py-7 shadow-[var(--shadow-card)]">
          <Eyebrow className="!text-[#9fc0e0]">Crew</Eyebrow>
          <h1 className="font-display mt-1.5 text-3xl text-white">
            Collaborators
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#bcd0e6]">
            Add a partner, friend, helper, or contractor. Editors can check
            off tasks, log time, add notes and photos. Viewers follow along.
          </p>
        </div>

        <Card className="mt-5 p-5">
          <MembersManager
            projectId={projectId}
            owner={data.owner}
            members={data.members}
            isOwner={isOwner}
          />
          {!isOwner && (
            <p className="mt-4 font-mono text-[11px] tracking-wide text-ink-faint uppercase">
              Only the project owner can change the crew.
            </p>
          )}
        </Card>
      </main>
    </>
  );
}
