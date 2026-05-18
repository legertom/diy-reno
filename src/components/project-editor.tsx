"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
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

  if (!canWrite) return null;

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
        rows={7}
        placeholder="Ground truth the Foreman should always know — e.g. walls are plaster not drywall; 1924 house (assume lead/asbestos until tested); galley kitchen 8x12; no garage, street parking only; tight budget; doing this solo on weekends."
        className="mt-1.5 w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-brass"
      />

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
