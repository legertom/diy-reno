"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, Sparkles, Loader2 } from "lucide-react";
import { updateProject } from "@/app/actions";
import { Button } from "@/components/ui";

export function ProjectEditor({
  projectId,
  title,
  summary,
  brief,
  canWrite,
}: {
  projectId: string;
  title: string;
  summary: string | null;
  brief: string | null;
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

  if (!canWrite) return null;

  async function polish() {
    if (polishing) return;
    setError(null);
    setPolishing(true);
    try {
      const res = await fetch("/api/polish-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, raw: b }),
      });
      const data = (await res.json()) as {
        brief?: string;
        error?: string;
      };
      if (!res.ok || !data.brief)
        throw new Error(data.error || "Couldn't polish that");
      setB(data.brief);
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
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Pencil className="size-4" /> Edit project &amp; brief
      </Button>
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
          onClick={polish}
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
