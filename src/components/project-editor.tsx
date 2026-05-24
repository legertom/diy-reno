"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Sparkles, Loader2, Download } from "lucide-react";
import { updateProject } from "@/app/actions";
import { Button } from "@/components/ui";
import { BriefSheet } from "@/components/brief-sheet";
import type { StructuredBrief } from "@/lib/brief";

export function ProjectEditor({
  projectId,
  title,
  summary,
  brief,
  briefStructured,
  canWrite,
}: {
  projectId: string;
  title: string;
  summary: string | null;
  brief: string | null;
  briefStructured: StructuredBrief | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(title);
  const [s, setS] = useState(summary ?? "");
  const [b, setB] = useState(brief ?? "");
  const [polishing, setPolishing] = useState(false);

  async function polish(raw: string) {
    if (polishing) return;
    setError(null);
    setPolishing(true);
    try {
      const res = await fetch("/api/polish-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, raw }),
      });
      const data = (await res.json()) as {
        brief?: string;
        structured?: StructuredBrief;
        error?: string;
      };
      if (!res.ok || !data.brief)
        throw new Error(data.error || "Couldn't polish that");
      setB(data.brief);
      // The route persisted both brief + briefStructured in one call —
      // refresh so the closed view picks up the new spec-sheet render.
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPolishing(false);
    }
  }

  function reset() {
    setT(title);
    setS(summary ?? "");
    setB(brief ?? "");
    setError(null);
  }

  function save() {
    if (!t.trim()) {
      setError("Project name can't be empty");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateProject({
          projectId,
          title: t,
          summary: s,
          brief: b,
        });
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError((e as Error).message || "Couldn't save");
      }
    });
  }

  if (!open) {
    const hasBriefText = !!(brief && brief.trim());
    const formatLabel = briefStructured ? "Re-format" : "Format";
    return (
      <div className="w-full">
        <div className="flex items-start justify-between gap-4">
          <span className="font-mono text-[10px] tracking-[0.18em] text-ink-faint uppercase">
            The Foreman reads this on every task
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {briefStructured && (
              <a
                href={`/api/brief-pdf/${projectId}`}
                title="Download a printable PDF of this brief"
                className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-brass hover:text-brass"
              >
                <Download className="size-3.5" /> PDF
              </a>
            )}
            {canWrite && hasBriefText && (
              <button
                type="button"
                onClick={() => polish(brief!)}
                disabled={polishing}
                title="Re-run the polish on this brief"
                className="inline-flex items-center gap-1.5 rounded-md border border-blueprint/40 bg-blueprint-tint px-2.5 py-1.5 text-xs font-medium text-blueprint transition-colors hover:border-blueprint disabled:opacity-50"
              >
                {polishing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Formatting…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" /> {formatLabel}
                  </>
                )}
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-brass hover:text-brass"
              >
                <Pencil className="size-3.5" /> Edit
              </button>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        {briefStructured ? (
          <div className="mt-5">
            <BriefSheet brief={briefStructured} />
          </div>
        ) : brief && brief.trim() ? (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-soft">
            {brief}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-faint">
            No brief yet. Add the ground truth about your home and job —
            wall type, house age, dimensions, constraints — so the Foreman
            stops guessing. Tap{" "}
            <span className="font-medium text-ink">Edit</span>, then{" "}
            <span className="font-medium text-ink">
              Clean up &amp; summarize
            </span>{" "}
            to structure it.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="animate-rise w-full">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.18em] text-brass uppercase">
          Editing project
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint hover:text-ink"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      <label className="eyebrow eyebrow-brass" htmlFor="pe-title">
        Project name
      </label>
      <input
        id="pe-title"
        value={t}
        onChange={(e) => setT(e.target.value)}
        className="mt-1.5 mb-4 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none focus:border-brass"
      />

      <label className="eyebrow eyebrow-brass" htmlFor="pe-summary">
        Tagline <span className="lowercase opacity-60">(short, shown on cards)</span>
      </label>
      <input
        id="pe-summary"
        value={s}
        onChange={(e) => setS(e.target.value)}
        className="mt-1.5 mb-4 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none focus:border-brass"
      />

      <label className="eyebrow eyebrow-brass" htmlFor="pe-brief">
        Project brief{" "}
        <span className="lowercase opacity-60">
          (the Foreman reads this in every chat)
        </span>
      </label>
      <textarea
        id="pe-brief"
        value={b}
        onChange={(e) => setB(e.target.value)}
        rows={8}
        placeholder="Just describe your situation in your own words — e.g. 'old house, walls are plaster, kitchen is small and galley shaped, doing it myself on weekends, not much money, no garage'. Then tap Clean up & summarize and the Foreman will structure it."
        className="mt-1.5 w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brass"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => polish(b)}
          disabled={polishing || b.trim().length < 8}
          className="inline-flex items-center gap-1.5 rounded-md border border-blueprint/40 bg-blueprint-tint px-2.5 py-1.5 text-xs font-medium text-blueprint transition-colors hover:border-blueprint disabled:opacity-50"
        >
          {polishing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Structuring…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" /> Clean up &amp; summarize
            </>
          )}
        </button>
        <span className="text-[11px] text-ink-faint">
          Rewrites the box above — review it, then Save.
        </span>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-5 flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save project"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
