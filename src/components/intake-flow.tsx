"use client";

import { useState } from "react";
import { Hammer } from "lucide-react";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui";
import { NewProjectForm } from "@/components/new-project-form";
import { IntakeModal } from "@/components/intake-modal";

/** Empty-state container for first-time users: auto-opens the intake
 *  modal, keeps a manual re-open button + the bare-form escape as the
 *  fallback if they dismiss. Mounted only when the user has no real
 *  (non-placeholder) projects yet. */
export function IntakeFlow({
  projectId,
  initialMessages,
}: {
  projectId: string;
  initialMessages: UIMessage[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-8 max-w-xl">
      <p className="text-base text-ink-soft">
        Let&apos;s set up your place and your first project — just talk it
        through with the Foreman. No forms, no rush; answer what you know
        and skip the rest.
      </p>
      <div className="mt-7">
        <Button type="button" onClick={() => setOpen(true)}>
          <Hammer className="size-4" />
          Set up with the Foreman
        </Button>
      </div>
      <details className="mt-10">
        <summary className="cursor-pointer text-sm text-ink-faint transition-colors hover:text-ink">
          Or create a project yourself
        </summary>
        <div className="mt-6">
          <NewProjectForm />
        </div>
      </details>

      {open && (
        <IntakeModal
          projectId={projectId}
          initialMessages={initialMessages}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
