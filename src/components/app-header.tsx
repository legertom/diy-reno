import Link from "next/link";
import { Wrench } from "lucide-react";
import { signOut } from "@/auth";
import { initials } from "@/lib/utils";
import { ForemanLauncher } from "@/components/foreman-launcher";

export function AppHeader({
  user,
  crumb,
  sheet = "A-1",
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  crumb?: { href: string; label: string };
  sheet?: string;
}) {
  return (
    <>
    <header className="blueprint-surface sticky top-0 z-30 border-b border-brass/40">
      <div className="mx-auto flex h-16 max-w-3xl items-stretch px-5">
        {/* Wordmark cell */}
        <div className="flex min-w-0 items-center gap-3 border-r border-white/12 pr-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2">
            <span
              aria-hidden
              className="grid size-7 place-items-center border border-white/30 font-mono text-[11px] text-[#cfe0f2]"
            >
              ◳
            </span>
            <span className="font-display text-lg leading-none tracking-tight text-white">
              DIY<span className="text-brass-2">·</span>RENO
            </span>
          </Link>
        </div>

        {/* Crumb / drawing title */}
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4">
          <span className="font-mono text-[9px] tracking-[0.22em] text-[#7fa6cb] uppercase">
            {crumb ? "Sheet" : "Index"}
          </span>
          {crumb ? (
            <Link
              href={crumb.href}
              className="truncate text-sm text-[#dbe6f2] hover:text-white"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-sm text-[#dbe6f2]">All projects</span>
          )}
        </div>

        {/* Title-block controls */}
        <div className="flex items-stretch">
          <span className="hidden items-center border-l border-white/12 px-4 sm:flex">
            <span className="sheet-no text-[#7fa6cb]">{sheet}</span>
          </span>
          <Link
            href="/profile"
            aria-label="Your toolbox"
            className="flex items-center border-l border-white/12 px-3.5 text-[#cfe0f2] transition-colors hover:bg-white/5 hover:text-white"
          >
            <Wrench className="size-4" />
          </Link>
          <span
            className="flex items-center border-l border-white/12 pl-3.5"
            title={user.name ?? user.email ?? ""}
          >
            <span className="grid size-7 place-items-center overflow-hidden rounded-full border border-white/25 bg-white/10 text-[10px] font-semibold text-white">
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
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
            className="flex"
          >
            <button
              type="submit"
              className="border-l border-white/12 px-3.5 font-mono text-[10px] tracking-[0.14em] text-[#7fa6cb] uppercase transition-colors hover:bg-white/5 hover:text-white"
            >
              Exit
            </button>
          </form>
        </div>
      </div>
      <div className="dim-rule mx-auto max-w-3xl" />
    </header>
    <ForemanLauncher />
    </>
  );
}
