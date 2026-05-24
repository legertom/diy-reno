"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Sparkles, RefreshCcw, Info } from "lucide-react";
import { regenerateDream } from "@/app/actions";

/** The headline of the project home post-Phase-5.2. When set, it is
 *  the kitchen-to-be. When unset, it is the gentle invitation to
 *  generate one. */
export function DreamHero({
  projectId,
  imageUrl,
  prompt,
  renderedAt,
  canWrite,
  foremanLine,
}: {
  projectId: string;
  imageUrl: string | null;
  prompt: string | null;
  renderedAt: Date | null;
  canWrite: boolean;
  /** The single Foreman line beneath the image (PHOTO_PLAN.md §5.2:
   *  "one tile-prep day brings you closer to this"). */
  foremanLine: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  function regenerate() {
    setError(null);
    startTransition(async () => {
      try {
        await regenerateDream(projectId);
      } catch (e) {
        setError((e as Error).message || "Render failed");
      }
    });
  }

  return (
    <section className="-mx-5 sm:-mx-8" aria-label="Dream kitchen">
      {imageUrl ? (
        <>
          <div className="relative aspect-[4/3] w-full overflow-hidden bg-paper-2 sm:aspect-[16/9]">
            <Image
              src={imageUrl}
              alt="Your kitchen, as it will be"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            {pending && (
              <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                <span className="text-sm font-medium">Rendering…</span>
              </div>
            )}
          </div>
          <div className="px-5 pt-4 sm:px-8">
            <p className="font-display text-lg text-ink-soft">{foremanLine}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
              <button
                type="button"
                onClick={() => setWhyOpen((o) => !o)}
                className="inline-flex items-center gap-1 hover:text-ink"
                aria-expanded={whyOpen}
              >
                <Info className="size-3" /> Why this image?
              </button>
              {renderedAt && (
                <span className="font-normal tracking-normal normal-case opacity-70">
                  Updated {relativeShort(renderedAt)}
                </span>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={pending}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-line-strong px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] uppercase text-ink hover:border-ink disabled:opacity-50"
                >
                  <RefreshCcw className="size-3" />
                  {pending ? "Rendering…" : "Update my dream"}
                </button>
              )}
            </div>
            {whyOpen && prompt && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-line bg-paper-2 p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink-soft">
                {prompt}
              </pre>
            )}
            {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          </div>
        </>
      ) : (
        <div className="px-5 sm:px-8">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-dashed border-line-strong bg-paper-2 sm:aspect-[16/9]">
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                <Sparkles className="mx-auto size-8 text-brass" />
                <p className="font-display mt-4 text-2xl text-ink">
                  See your kitchen as it will be
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
                  The Foreman can render a magazine-quality picture of your
                  finished room from what you&apos;ve told it so far. It updates
                  when your choices change.
                </p>
                {canWrite && (
                  <button
                    type="button"
                    onClick={regenerate}
                    disabled={pending}
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:bg-ink-soft disabled:opacity-50"
                  >
                    <Sparkles className="size-4" />
                    {pending ? "Rendering…" : "Generate my dream"}
                  </button>
                )}
              </div>
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </section>
  );
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
