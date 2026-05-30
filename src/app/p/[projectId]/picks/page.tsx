import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Sparkles } from "lucide-react";
import {
  getProjectOr404,
  getForemanPicks,
} from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Eyebrow, SectionHeader, EmptyState } from "@/components/ui";

export default async function ForemanPicksPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { user, project } = await getProjectOr404(projectId);
  const picks = await getForemanPicks(projectId);

  const hasAnything =
    picks.dreamImageUrl ||
    picks.heroShot ||
    picks.moments.length > 0 ||
    picks.heroOfTheWeek ||
    picks.onThisDay.length > 0;

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
          <Eyebrow className="mt-6">Foreman&apos;s picks</Eyebrow>
          <h1 className="font-display mt-3 text-[clamp(2rem,6vw,3.5rem)] text-ink">
            The best of {project.title.toLowerCase()}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">
            What the Foreman thinks is worth looking at — the dream, today,
            and the moments he flagged along the way.
          </p>
        </header>

        {!hasAnything ? (
          <div className="mx-auto mt-10 max-w-5xl px-5 sm:px-8">
            <EmptyState title="Not enough to curate yet" />
            <p className="mt-3 max-w-md text-sm text-ink-faint">
              Generate a dream on the project home, then upload a few photos
              of the room. The Foreman will start finding moments worth
              showing.
            </p>
          </div>
        ) : (
          <div className="space-y-20">
            {/* Dream + today as a paired spread */}
            {(picks.dreamImageUrl || picks.heroShot) && (
              <section className="-mx-0 mt-16 sm:mx-0">
                <div className="mx-auto max-w-5xl px-5 sm:px-8">
                  <SectionHeader index="01" label="Dream / today" />
                </div>
                <div className="mt-6 grid grid-cols-1 gap-px bg-line-strong sm:grid-cols-2">
                  {picks.dreamImageUrl ? (
                    <PickFrame
                      url={picks.dreamImageUrl}
                      label="Dream"
                      caption={
                        picks.dreamRenderedAt
                          ? `Rendered ${relativeShort(picks.dreamRenderedAt)}`
                          : null
                      }
                    />
                  ) : (
                    <DreamPlaceholder projectId={projectId} />
                  )}
                  {picks.heroShot ? (
                    <PickFrame
                      url={picks.heroShot.url}
                      label="Today"
                      caption={
                        picks.heroShot.caption ??
                        (picks.heroShot.takenAt
                          ? relativeShort(picks.heroShot.takenAt)
                          : null)
                      }
                    />
                  ) : (
                    <HeroShotPlaceholder projectId={projectId} />
                  )}
                </div>
              </section>
            )}

            {/* Hero of the week — only renders when there's a fresh moment.
                Quiet by design (PHOTO_PLAN.md §5.9: never push, opt-in
                feel). */}
            {picks.heroOfTheWeek && (
              <section>
                <div className="mx-auto max-w-5xl px-5 sm:px-8">
                  <SectionHeader index="02" label="This week" />
                </div>
                <div className="mt-6 px-0 sm:px-8">
                  <Link
                    href={`/p/${projectId}/photos`}
                    className="block max-w-5xl mx-auto"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden border-y border-line sm:rounded-2xl sm:border">
                      <Image
                        src={picks.heroOfTheWeek.photoUrl}
                        alt={picks.heroOfTheWeek.photoCaption ?? "This week"}
                        fill
                        sizes="(max-width: 1024px) 100vw, 1024px"
                        className="object-cover"
                      />
                    </div>
                    {picks.heroOfTheWeek.photoCaption && (
                      <p className="mx-auto mt-3 max-w-xl px-5 text-sm text-ink-soft sm:px-0">
                        {picks.heroOfTheWeek.photoCaption}
                      </p>
                    )}
                  </Link>
                </div>
              </section>
            )}

            {/* "On this day" — quiet callback to a photo from 1 or 3
                months back. Renders only when something matched, so
                early projects don't see filler. */}
            {picks.onThisDay.length > 0 && (
              <section>
                <div className="mx-auto max-w-5xl px-5 sm:px-8">
                  <SectionHeader index="03" label="On this day" />
                </div>
                <div className="mx-auto mt-6 grid max-w-5xl gap-px bg-line-strong px-0 sm:grid-cols-2 sm:px-8 sm:gap-4 sm:bg-transparent">
                  {picks.onThisDay.map((p) => (
                    <Link
                      key={p.photoId}
                      href={`/p/${projectId}/photos`}
                      className="group block"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden sm:rounded-xl sm:border sm:border-line">
                        <Image
                          src={p.photoUrl}
                          alt={p.caption ?? "On this day"}
                          fill
                          sizes="(max-width: 640px) 100vw, 50vw"
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent p-3 text-white">
                          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase">
                            {p.label}
                          </span>
                          {p.caption && (
                            <span className="truncate text-[11px] opacity-80">
                              {p.caption}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Phase 5.13 cover + postcard — only when there's a dream
                to dress up. Both use cached assets (the dream blob);
                no per-view AI spend. Mobile-savable via long-press. */}
            {picks.dreamImageUrl && (
              <section>
                <div className="mx-auto max-w-5xl px-5 sm:px-8">
                  <SectionHeader index="05" label="Cover &amp; postcard" />
                  <p className="mt-3 max-w-xl text-sm text-ink-soft">
                    Frame-able stills for a partner, a family text, or a
                    Slack channel. Long-press on a phone to save the image.
                  </p>
                </div>
                <div className="mx-auto mt-6 grid max-w-5xl gap-6 px-5 sm:grid-cols-[3fr_4fr] sm:gap-8 sm:px-8">
                  <a
                    href={`/api/cover/${projectId}/og`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                    aria-label="Open this month's cover"
                  >
                    <div className="relative overflow-hidden border border-line bg-paper-2 shadow-[var(--shadow-lift)] transition-transform group-hover:scale-[1.01]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/cover/${projectId}/og`}
                        alt="This month's cover"
                        width={1200}
                        height={1600}
                        className="block h-auto w-full"
                      />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
                      The cover · {coverMonth(new Date())}
                    </p>
                  </a>
                  <a
                    href={`/api/postcard/${projectId}/og`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                    aria-label="Open shareable postcard"
                  >
                    <div className="relative overflow-hidden border border-line bg-paper-2 shadow-[var(--shadow-lift)] transition-transform group-hover:scale-[1.01]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/postcard/${projectId}/og`}
                        alt="Shareable postcard"
                        width={1600}
                        height={1000}
                        className="block h-auto w-full"
                      />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
                      Postcard · today
                    </p>
                  </a>
                </div>
              </section>
            )}

            {/* "Foreman noticed" — moment + progress ROIs across the
                whole project. Each crop is a CSS background-position
                overlay (no extra Blob writes per §5.4). */}
            {picks.moments.length > 0 && (
              <section>
                <div className="mx-auto max-w-5xl px-5 sm:px-8">
                  <SectionHeader index="04" label="Foreman noticed" />
                  <p className="mt-3 max-w-xl text-sm text-ink-soft">
                    Small moments worth keeping. Tap one to jump to the full
                    photo on the timeline.
                  </p>
                </div>
                <div className="mx-auto mt-6 grid max-w-5xl grid-cols-2 gap-2 px-5 sm:grid-cols-3 sm:gap-4 sm:px-8 md:grid-cols-4">
                  {picks.moments.map((m) => (
                    <Link
                      key={`${m.photoId}-${m.kind === "moment" ? m.roiId : "h"}`}
                      href={`/p/${projectId}/photos`}
                      className="group block space-y-2"
                    >
                      <div
                        className="relative aspect-square overflow-hidden rounded-lg border border-line bg-paper-2 transition-shadow group-hover:shadow-[var(--shadow-lift)]"
                        style={
                          m.kind === "moment"
                            ? {
                                backgroundImage: `url(${m.photoUrl})`,
                                backgroundSize: `${(1 / Math.max(m.bbox.w, 0.05)) * 100}% ${(1 / Math.max(m.bbox.h, 0.05)) * 100}%`,
                                backgroundPosition: `${(m.bbox.x / Math.max(1 - m.bbox.w, 0.05)) * 100}% ${(m.bbox.y / Math.max(1 - m.bbox.h, 0.05)) * 100}%`,
                                backgroundRepeat: "no-repeat",
                              }
                            : undefined
                        }
                      />
                      {m.kind === "moment" && (
                        <p className="px-1 text-[12px] leading-snug text-ink-soft">
                          <span className="mr-1 text-[10px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
                            {m.category}
                          </span>
                          {m.caption}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function PickFrame({
  url,
  label,
  caption,
}: {
  url: string;
  label: string;
  caption: string | null;
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden bg-paper-2 sm:aspect-square">
      <Image
        src={url}
        alt={label}
        fill
        sizes="(max-width: 640px) 100vw, 50vw"
        className="object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent p-3 text-white">
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase">
          {label}
        </span>
        {caption && <span className="text-[11px] opacity-80">{caption}</span>}
      </div>
    </div>
  );
}

function DreamPlaceholder({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/p/${projectId}`}
      className="grid aspect-[4/3] place-items-center bg-paper-2 text-center text-sm text-ink-soft sm:aspect-square"
    >
      <div className="px-6">
        <Sparkles className="mx-auto size-6 text-brass" />
        <p className="mt-3">Generate a dream on the project home →</p>
      </div>
    </Link>
  );
}

function HeroShotPlaceholder({ projectId }: { projectId: string }) {
  return (
    <Link
      href={`/p/${projectId}/photos`}
      className="grid aspect-[4/3] place-items-center bg-paper-2 text-center text-sm text-ink-soft sm:aspect-square"
    >
      <div className="px-6">
        <p>
          Open a photo in the timeline and tap{" "}
          <span className="font-semibold text-ink">Set as today&apos;s view</span>{" "}
          to pair it with your dream.
        </p>
      </div>
    </Link>
  );
}

function coverMonth(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function relativeShort(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (ms < min) return "just now";
  if (ms < hr) return `${Math.round(ms / min)}m ago`;
  if (ms < day) return `${Math.round(ms / hr)}h ago`;
  return `${Math.round(ms / day)}d ago`;
}
