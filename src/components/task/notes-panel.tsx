"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addNote, deleteNote } from "@/app/actions";
import { Button } from "@/components/ui";

type Note = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string | Date;
};

export function NotesPanel({
  taskId,
  notes,
  canWrite,
}: {
  taskId: string;
  notes: Note[];
  canWrite: boolean;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      {canWrite && (
        <form
          ref={formRef}
          action={() => {
            const body = value.trim();
            if (!body) return;
            setValue("");
            startTransition(() => addNote(taskId, body));
          }}
          className="mb-4"
        >
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            placeholder="Log a note — what worked, what to watch for, what's left…"
            className="w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          />
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" disabled={pending || !value.trim()}>
              {pending ? "Saving…" : "Add note"}
            </Button>
          </div>
        </form>
      )}

      <ul className="space-y-2.5">
        {notes.length === 0 && (
          <li className="text-sm text-ink-faint">No notes yet.</li>
        )}
        {notes.map((n) => (
          <li
            key={n.id}
            className="group rounded-lg border border-line bg-paper px-3.5 py-3"
          >
            <p className="text-sm whitespace-pre-wrap text-ink">{n.body}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-wide text-ink-faint uppercase">
                {n.authorName} ·{" "}
                {new Date(n.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => startTransition(() => deleteNote(n.id))}
                  className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                  aria-label="Delete note"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
