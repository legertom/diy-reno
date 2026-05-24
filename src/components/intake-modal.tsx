"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { UIMessage } from "ai";
import { Eyebrow } from "@/components/ui";
import { TaskChat } from "@/components/task/task-chat";

/** The intake "first scrivener" experience as a focused sheet. Full-screen
 *  on mobile (where intake will mostly happen), centered card on desktop.
 *  Renders the existing project Foreman chat so the user inherits the
 *  Phase 4 chip-choice support and tool-result rendering. Dismissable
 *  (close button, backdrop click, Esc) — the placeholder project persists
 *  in the DB so reopening continues where they left off. */
export function IntakeModal({
  projectId,
  initialMessages,
  onClose,
}: {
  projectId: string;
  initialMessages: UIMessage[];
  onClose: () => void;
}) {
  // Lock body scroll while the sheet is open (esp. mobile, where the page
  // behind would otherwise rubber-band as you scroll the chat).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Esc closes — desktop ergonomics.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-ink/55 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intake-modal-title"
    >
      <div
        className="bg-paper flex h-full w-full flex-col overflow-hidden sm:h-auto sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <Eyebrow>Welcome</Eyebrow>
            <h2
              id="intake-modal-title"
              className="font-display mt-2 text-2xl text-ink sm:text-3xl"
            >
              Let&apos;s get started
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 rounded-full p-2 text-ink-faint transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <TaskChat
            projectId={projectId}
            taskId={null}
            initialMessages={initialMessages}
          />
        </div>
      </div>
    </div>
  );
}
