"use client";

import { useTransition } from "react";
import { createProject } from "@/app/actions";
import { Button } from "@/components/ui";

export function NewProjectForm() {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(() => createProject(fd))}
      className="grid gap-3"
    >
      <div>
        <label className="eyebrow eyebrow-brass" htmlFor="title">
          Project name
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          placeholder="Kitchen renovation"
          className="mt-1.5 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
        />
      </div>
      <div>
        <label className="eyebrow eyebrow-brass" htmlFor="summary">
          One-line brief <span className="lowercase opacity-60">(optional)</span>
        </label>
        <input
          id="summary"
          name="summary"
          maxLength={200}
          placeholder="Full DIY gut + refinish, 3-week timeline"
          className="mt-1.5 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
        />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Drafting…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
