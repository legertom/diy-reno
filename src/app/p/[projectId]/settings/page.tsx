import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { properties } from "@/db/schema";
import { getProjectOr404, getMembers } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow, SectionHeader } from "@/components/ui";
import { MembersManager } from "@/components/members-manager";
import { FloorPlanSection } from "@/components/floor-plan-section";

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

  // Phase 5.14: load the property for the floor-plan section. Only
  // surfaced when the owner is also viewing — Property writes are
  // owner-only (assertOwnsProperty), and there's no value rendering
  // a non-actionable section to a viewer/editor.
  const property =
    isOwner && project.propertyId
      ? (
          await getDb()
            .select({
              id: properties.id,
              name: properties.name,
              floorPlanUrl: properties.floorPlanUrl,
              rooms: properties.rooms,
            })
            .from(properties)
            .where(eq(properties.id, project.propertyId))
        )[0]
      : null;

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

        {property && (
          <section className="mt-12">
            <SectionHeader index="02" label="Floor plan & rooms" />
            <Card frame className="mt-6 p-5 sm:p-6">
              <FloorPlanSection
                propertyId={property.id}
                propertyName={property.name}
                floorPlanUrl={property.floorPlanUrl}
                rooms={property.rooms ?? []}
              />
            </Card>
          </section>
        )}
      </main>
    </>
  );
}
