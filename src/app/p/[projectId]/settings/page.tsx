import { notFound } from "next/navigation";
import { getProjectOr404, getMembers } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow, SectionHeader } from "@/components/ui";
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
        sheet="A-0"
      />
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28">
        <div className="blueprint-surface sheet-frame tick-corners rounded-[var(--radius-card)] px-7 py-7 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <Eyebrow className="!text-[#7fa6cb]">Crew</Eyebrow>
            <span className="sheet-no text-[#7fa6cb]">TITLE BLOCK A-0</span>
          </div>
          <h1 className="font-display mt-3 text-3xl leading-[1.05] text-white sm:text-[2.4rem]">
            Collaborators
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#aec6de]">
            Add a partner, friend, helper, or contractor. Editors can check
            off tasks, log time, add notes and photos. Viewers follow along.
          </p>
        </div>

        <section className="mt-8">
          <SectionHeader index="01" label="The crew" sheet="ROLES" />
          <Card frame className="mt-3 p-5 sm:p-6">
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
        </section>
      </main>
    </>
  );
}
