"use client";

import { useMemo } from "react";
import { Check, Sparkles, Wrench } from "lucide-react";
import { ASK_EVENT } from "@/components/task/task-chat";
import { cn } from "@/lib/utils";

const STOP = new Set([
  "the",
  "for",
  "and",
  "with",
  "set",
  "kit",
  "any",
  "your",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

function isOwned(planned: string, owned: string[]): boolean {
  const p = tokens(planned);
  if (p.size === 0) return false;
  return owned.some((o) => {
    const ot = tokens(o);
    if (ot.size === 0) return false;
    const subsetOfPlanned = [...ot].every((t) => p.has(t));
    const subsetOfOwned = [...p].every((t) => ot.has(t));
    return subsetOfPlanned || subsetOfOwned;
  });
}

export function TaskToolCheck({
  plannedTools,
  ownedTools,
}: {
  plannedTools: string[];
  ownedTools: string[];
}) {
  const { have, need } = useMemo(() => {
    const have: string[] = [];
    const need: string[] = [];
    for (const t of plannedTools) {
      (isOwned(t, ownedTools) ? have : need).push(t);
    }
    return { have, need };
  }, [plannedTools, ownedTools]);

  if (plannedTools.length === 0) return null;

  function ask() {
    const text =
      need.length > 0
        ? `For this task I still need: ${need.join(
            "; ",
          )}. Which of these should I buy and which should I rent? Rough costs?`
        : `I think I own all the tools for this task (${plannedTools.join(
            "; ",
          )}). Anything I'm missing or should upgrade?`;
    window.dispatchEvent(
      new CustomEvent(ASK_EVENT, { detail: { text } }),
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {have.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-[#cfe0cb] bg-positive-tint px-2.5 py-1 text-xs text-positive"
          >
            <Check className="size-3" strokeWidth={3} />
            {t}
          </span>
        ))}
        {need.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-soft"
          >
            <Wrench className="size-3 text-brass" />
            {t}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={ask}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors",
            "bg-blueprint hover:bg-[#0f2c54]",
          )}
        >
          <Sparkles className="size-3.5" />
          {need.length > 0
            ? `Ask the Foreman: buy or rent the ${need.length} I'm missing?`
            : "Ask the Foreman to double-check my kit"}
        </button>
        <span className="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
          Heuristic match · the Foreman confirms
        </span>
      </div>
    </div>
  );
}
