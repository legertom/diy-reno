import Link from "next/link";
import { signOut } from "@/auth";
import { initials } from "@/lib/utils";

export function AppHeader({
  user,
  crumb,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  crumb?: { href: string; label: string };
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-5">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="font-display text-lg tracking-tight text-ink shrink-0"
          >
            DIY<span className="text-brass">Reno</span>
          </Link>
          {crumb && (
            <>
              <span className="text-line-strong">/</span>
              <Link
                href={crumb.href}
                className="truncate text-sm text-ink-soft hover:text-brass"
              >
                {crumb.label}
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="grid size-8 place-items-center overflow-hidden rounded-full border border-line-strong bg-blueprint-tint text-[11px] font-semibold text-blueprint"
            title={user.name ?? user.email ?? ""}
          >
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              initials(user.name, user.email)
            )}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button
              type="submit"
              className="font-mono text-[11px] tracking-wide text-ink-faint uppercase hover:text-danger"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
