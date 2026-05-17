"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Wrench } from "lucide-react";
import { addUserTool, removeUserTool } from "@/app/actions";
import { Button } from "@/components/ui";

type Tool = { id: string; name: string };

const SUGGESTIONS = [
  "Drill/driver",
  "Random orbital sander",
  "Circular saw",
  "Reciprocating saw",
  "Miter saw",
  "Heat gun",
  "Shop vac",
  "Pry bar",
  "Stud finder",
  "Level (4 ft)",
  "Utility knife",
  "Caulk gun",
];

export function ToolsManager({ tools }: { tools: Tool[] }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const owned = new Set(tools.map((t) => t.name.toLowerCase()));

  function add(value: string) {
    const v = value.trim();
    if (!v) return;
    setName("");
    startTransition(() => addUserTool(v));
  }

  return (
    <div>
      <form
        action={() => add(name)}
        className="mb-4 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a tool you own…"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
        />
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </form>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {SUGGESTIONS.filter((s) => !owned.has(s.toLowerCase())).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            disabled={pending}
            className="rounded-full border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-brass hover:text-brass disabled:opacity-50"
          >
            + {s}
          </button>
        ))}
      </div>

      {tools.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No tools yet. Add what you own — the Foreman uses this to tell you
          what to buy or rent for each task.
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {tools.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2"
            >
              <Wrench className="size-3.5 shrink-0 text-brass" />
              <span className="flex-1 truncate text-sm text-ink">
                {t.name}
              </span>
              <button
                type="button"
                onClick={() => startTransition(() => removeUserTool(t.id))}
                className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                aria-label={`Remove ${t.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
