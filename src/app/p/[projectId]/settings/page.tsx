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
      />
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-32 sm:px-8 sm:pt-16">
        <header className="max-w-xl">
          <Eyebrow>Crew</Eyebrow>
          <h1 className="font-display mt-4 text-[clamp(2rem,6vw,3.5rem)] text-ink">
            Collaborators
          </h1>
          <p className="mt-3 max-w-md text-base text-ink-soft">
            Add a partner, friend, helper, or contractor. Editors can check
            off tasks, log time, add notes and photos. Viewers follow along.
          </p>
        </header>

        <section className="mt-12">
          <SectionHeader index="01" label="The crew" />
          <Card frame className="mt-6 p-5 sm:p-6">
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
