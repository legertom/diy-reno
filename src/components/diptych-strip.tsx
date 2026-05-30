import Image from "next/image";
import type { AngleCluster } from "@/lib/photo-embeddings";

/** Phase 5.7: surface same-angle clusters at the top of the photos
 *  page so progress reveals itself without the user filing anything.
 *  Each cluster of 2+ photos becomes a diptych (earliest + latest);
 *  3+ photos collapse extras into "+N" without losing them — the user
 *  swipes through them in the timeline lightbox just below.
 *
 *  Editorial treatment per PLAN §3.4: photo-led, hairline rules,
 *  generous space, eyebrow + display type. Never a leaderboard. */
export function DiptychStrip({ clusters }: { clusters: AngleCluster[] }) {
  if (clusters.length === 0) return null;
  return (
    <section
      aria-label="Same-angle progress diptychs"
      className="mx-auto mt-12 max-w-5xl px-5 sm:px-8"
    >
      <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
        Foreman&nbsp;noticed&nbsp;·&nbsp;{clusters.length}{" "}
        {clusters.length === 1 ? "same view" : "same views"}
      </p>
      <h2 className="font-display mt-2 text-2xl text-ink sm:text-3xl">
        Then &amp; now
      </h2>
      <p className="mt-2 max-w-xl text-sm text-ink-soft">
        Same angle, different days. Open any photo below to swipe through the
        full sequence.
      </p>
      <ul className="mt-6 space-y-8">
        {clusters.map((c) => (
          <DiptychCard key={c.id} cluster={c} />
        ))}
      </ul>
    </section>
  );
}

function DiptychCard({ cluster }: { cluster: AngleCluster }) {
  const first = cluster.members[0];
  const last = cluster.members[cluster.members.length - 1];
  const extras = cluster.members.length - 2;
  const span = daySpan(first.takenAt ?? first.createdAt, last.takenAt ?? last.createdAt);
  return (
    <li className="space-y-2">
      <div className="grid grid-cols-2 gap-px bg-line-strong">
        <DiptychSide photo={first} label="First" />
        <DiptychSide photo={last} label="Latest" />
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[11px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
        <span className="dim-rule flex-1" aria-hidden="true" />
        <span className="tabular-nums">
          {span}
          {extras > 0 && (
            <span className="ml-2 font-normal normal-case opacity-70">
              +{extras} between
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

function DiptychSide({
  photo,
  label,
}: {
  photo: AngleCluster["members"][number];
  label: "First" | "Latest";
}) {
  return (
    <figure className="relative aspect-square overflow-hidden bg-paper-2">
      <Image
        src={photo.url}
        alt={photo.caption ?? photo.captionAi ?? `${label} view`}
        fill
        sizes="(max-width: 640px) 50vw, 400px"
        className="object-cover"
      />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 to-transparent p-2 text-[10px] font-semibold tracking-[0.16em] text-white uppercase">
        <span>{label}</span>
        <span className="font-normal tracking-normal normal-case opacity-90">
          {relativeShort(photo.takenAt ?? photo.createdAt)}
        </span>
      </figcaption>
    </figure>
  );
}

/** "12 days" — the span between earliest and latest photo in a cluster.
 *  Same-day clusters collapse to "today"; no countdowns per the
 *  no-pressure-UI rule. */
function daySpan(a: Date, b: Date): string {
  const ms = Math.abs(b.getTime() - a.getTime());
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days === 0) return "same day";
  if (days === 1) return "1 day apart";
  if (days < 14) return `${days} days apart`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks} weeks apart`;
  const months = Math.round(days / 30);
  return `${months} months apart`;
}

function relativeShort(d: Date): string {
  const ms = Date.now() - d.getTime();
  const day = 1000 * 60 * 60 * 24;
  const days = Math.round(ms / day);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}
