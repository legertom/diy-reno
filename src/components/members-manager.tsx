"use client";

import { useState, useTransition } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import {
  inviteMember,
  updateMemberRole,
  removeMember,
} from "@/app/actions";
import { Button, Badge } from "@/components/ui";
import { initials } from "@/lib/utils";

type Member = {
  id: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  name: string | null;
  image: string | null;
  active: boolean;
};

export function MembersManager({
  projectId,
  owner,
  members,
  isOwner,
}: {
  projectId: string;
  owner: { name: string | null; email: string | null; image: string | null };
  members: Member[];
  isOwner: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      {isOwner && (
        <form
          action={() => {
            const e = email.trim().toLowerCase();
            if (!e.includes("@")) {
              setErr("Enter a valid email");
              return;
            }
            setErr(null);
            setEmail("");
            startTransition(async () => {
              try {
                await inviteMember(projectId, e, role);
              } catch (error) {
                setErr((error as Error).message);
              }
            });
          }}
          className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="helper@email.com"
            className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          />
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "editor" | "viewer")
            }
            className="rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none focus:border-brass"
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <Button type="submit" size="sm" disabled={pending}>
            <UserPlus className="size-4" /> Invite
          </Button>
        </form>
      )}
      {err && <p className="mb-3 text-xs text-danger">{err}</p>}

      <ul className="space-y-2">
        <li className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2.5">
          <Avatar name={owner.name} email={owner.email} image={owner.image} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {owner.name ?? owner.email}
            </p>
            <p className="truncate text-xs text-ink-faint">{owner.email}</p>
          </div>
          <Badge tone="brass">owner</Badge>
        </li>

        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2.5"
          >
            <Avatar name={m.name} email={m.email} image={m.image} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {m.name ?? m.email}
              </p>
              <p className="truncate text-xs text-ink-faint">
                {m.email}
                {!m.active && " · invited"}
              </p>
            </div>
            {isOwner ? (
              <>
                <select
                  defaultValue={m.role === "owner" ? "editor" : m.role}
                  onChange={(e) =>
                    startTransition(() =>
                      updateMemberRole(
                        m.id,
                        e.target.value as "editor" | "viewer",
                      ),
                    )
                  }
                  className="rounded-md border border-line-strong bg-card px-2 py-1 text-xs outline-none focus:border-brass"
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button
                  type="button"
                  onClick={() => startTransition(() => removeMember(m.id))}
                  className="text-ink-faint hover:text-danger"
                  aria-label="Remove collaborator"
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            ) : (
              <Badge tone="blueprint">{m.role}</Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Avatar({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string | null;
  image: string | null;
}) {
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-blueprint-tint text-[11px] font-semibold text-blueprint">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
