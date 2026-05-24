"use client";

import { useState, useTransition } from "react";
import { resetAccount } from "@/app/actions";
import { Button } from "@/components/ui";

export function ResetAccountForm({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const matched = text.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <form
      action={(fd) => startTransition(() => resetAccount(fd))}
      className="grid gap-3"
    >
      <div>
        <label className="eyebrow eyebrow-brass" htmlFor="confirm">
          Type your email to confirm
        </label>
        <input
          id="confirm"
          name="confirm"
          autoComplete="off"
          spellCheck={false}
          placeholder={email}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
        />
      </div>
      <div>
        <Button
          type="submit"
          variant="danger"
          disabled={pending || !matched}
        >
          {pending ? "Resetting…" : "Reset everything"}
        </Button>
      </div>
    </form>
  );
}
