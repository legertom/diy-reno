"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { updateTaskPlan } from "@/app/actions";
import { Button } from "@/components/ui";

type Guide = {
  tools: string[];
  materials: string[];
  safety: string[];
  steps: string[];
  tips: string[];
};

const SECTIONS: { key: keyof Guide; label: string; hint: string }[] = [
  { key: "tools", label: "Tools", hint: "One tool per line" },
  { key: "materials", label: "Materials", hint: "One material per line" },
  { key: "safety", label: "Safety", hint: "One warning per line" },
  { key: "steps", label: "Steps", hint: "One step per line, in order" },
  { key: "tips", label: "Tips", hint: "One tip per line" },
];

export function TaskEditor({
  taskId,
  title,
  detail,
  guide,
  canWrite,
}: {
  taskId: string;
  title: string;
  detail: string | null;
  guide: Guide | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [t, setT] = useState(title);
  const [d, setD] = useState(detail ?? "");
  const [text, setText] = useState<Record<keyof Guide, string>>({
    tools: (guide?.tools ?? []).join("\n"),
    materials: (guide?.materials ?? []).join("\n"),
    safety: (guide?.safety ?? []).join("\n"),
    steps: (guide?.steps ?? []).join("\n"),
    tips: (guide?.tips ?? []).join("\n"),
  });

  if (!canWrite) return null;

  function reset() {
    setT(title);
    setD(detail ?? "");
    setText({
      tools: (guide?.tools ?? []).join("\n"),
      materials: (guide?.materials ?? []).join("\n"),
      safety: (guide?.safety ?? []).join("\n"),
      steps: (guide?.steps ?? []).join("\n"),
      tips: (guide?.tips ?? []).join("\n"),
    });
    setError(null);
  }

  function toLines(s: string) {
    return s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  function save() {
    if (!t.trim()) {
      setError("Title can't be empty");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateTaskPlan({
          taskId,
          title: t,
          detail: d,
          tools: toLines(text.tools),
          materials: toLines(text.materials),
          safety: toLines(text.safety),
          steps: toLines(text.steps),
          tips: toLines(text.tips),
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
        <Pencil className="size-4" /> Edit task &amp; plan
      </Button>
    );
  }

  return (
    <div className="animate-rise w-full">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.18em] text-brass uppercase">
          Editing task
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-faint hover:text-ink"
          aria-label="Close editor"
        >
          <X className="size-4" />
        </button>
      </div>

      <label className="eyebrow eyebrow-brass" htmlFor="te-title">
        Title
      </label>
      <input
        id="te-title"
        value={t}
        onChange={(e) => setT(e.target.value)}
        className="mt-1.5 mb-4 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none focus:border-brass"
      />

      <label className="eyebrow eyebrow-brass" htmlFor="te-detail">
        One-line description
      </label>
      <textarea
        id="te-detail"
        value={d}
        onChange={(e) => setD(e.target.value)}
        rows={2}
        className="mt-1.5 mb-5 w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none focus:border-brass"
      />

      <div className="grid gap-4">
        {SECTIONS.map((s) => (
          <div key={s.key}>
            <label
              className="eyebrow eyebrow-brass flex items-baseline justify-between"
              htmlFor={`te-${s.key}`}
            >
              <span>{s.label}</span>
              <span className="font-mono text-[9px] tracking-normal text-ink-faint normal-case">
                {s.hint}
              </span>
            </label>
            <textarea
              id={`te-${s.key}`}
              value={text[s.key]}
              onChange={(e) =>
                setText((prev) => ({ ...prev, [s.key]: e.target.value }))
              }
              rows={Math.min(
                10,
                Math.max(3, text[s.key].split("\n").length + 1),
              )}
              className="mt-1.5 w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-brass"
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-5 flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
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
