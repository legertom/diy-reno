import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getProjectOr404,
  getProjectTimeline,
  canWrite as canWriteRole,
} from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Eyebrow, EmptyState } from "@/components/ui";
import { PhotoTimeline } from "@/components/photo-timeline";

export default async function PhotosPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user, role, project } = await getProjectOr404(projectId);
  const writable = canWriteRole(role);
  const { photos, rooms, tasks } = await getProjectTimeline(projectId);

  return (
    <>
      <AppHeader
        user={user}
        crumb={{ href: `/p/${projectId}`, label: project.title }}
      />
      <main className="pb-32">
        <header className="mx-auto max-w-5xl px-5 pt-12 sm:px-8 sm:pt-16">
          <Link
            href={`/p/${projectId}`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-3" /> Back to project
          </Link>
          <Eyebrow className="mt-6">Photos</Eyebrow>
          <h1 className="font-display mt-3 text-[clamp(2rem,6vw,3.5rem)] text-ink">
            Timeline
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">
            {photos.length === 0
              ? "No photos yet. Shoot or upload on the project home or any task."
              : photos.length === 1
                ? "1 photo, captured on the way to a finished room."
                : `${photos.length} photos, captured on the way to a finished room.`}
          </p>
        </header>

        {photos.length === 0 ? (
          <div className="mx-auto mt-10 max-w-5xl px-5 sm:px-8">
            <EmptyState title="Nothing here yet" />
          </div>
        ) : (
          <PhotoTimeline
            projectId={projectId}
            photos={photos}
            rooms={rooms}
            tasks={tasks}
            canWrite={writable}
            heroShotPhotoId={project.heroShotPhotoId}
          />
        )}
      </main>
    </>
  );
}
