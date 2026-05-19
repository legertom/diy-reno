import Link from "next/link";
import { Wrench } from "lucide-react";
import { signOut } from "@/auth";
import { initials } from "@/lib/utils";
import { ForemanLauncher } from "@/components/foreman-launcher";

export function AppHeader({
  user,
  crumb,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  crumb?: { href: string; label: string };
  /** Retained for API compatibility; drawing-sheet codes were removed. */
  sheet?: string;
}) {
  return (
    <>
      <header className="sticky top-0 z-30 bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-5 sm:px-8">
          <Link
            href="/"
            className="font-display shrink-0 text-lg leading-none tracking-tight text-ink"
          >
            DIY&nbsp;RENO
          </Link>

          {crumb ? (
            <Link
              href={crumb.href}
              className="min-w-0 flex-1 truncate text-sm text-ink-faint transition-colors hover:text-ink"
            >
              ← {crumb.label}
            </Link>
          ) : (
            <span className="min-w-0 flex-1" />
          )}

          <Link
            href="/profile"
            aria-label="Your toolbox"
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Wrench className="size-4" />
          </Link>
          <span
            className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-paper-2 text-[10px] font-semibold text-ink-soft"
            title={user.name ?? user.email ?? ""}
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="size-full object-cover" />
            ) : (
              initials(user.name, user.email)
            )}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
            className="flex shrink-0"
          >
            <button
              type="submit"
              className="rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase transition-colors hover:text-ink"
            >
              Exit
            </button>
          </form>
        </div>
        <div className="dim-rule mx-auto max-w-5xl" />
      </header>
      <ForemanLauncher />
    </>
  );
}
