import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Eyebrow } from "@/components/ui";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="blueprint-surface rounded-[var(--radius-card)] px-9 py-14 shadow-[var(--shadow-lift)]">
          <Eyebrow className="!text-[#9fb0c8]">Renovation, coached</Eyebrow>
          <h1 className="font-display mt-5 text-6xl leading-[0.95] text-white">
            DIY
            <br />
            RENO
          </h1>
          <p className="mt-6 max-w-[18rem] text-sm leading-relaxed text-[#c3ccdb]">
            Plan the job. Work it one step at a time. Ask an expert
            contractor anything, anytime.
          </p>
          <div className="dim-rule mt-9 w-24 opacity-60" />
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-card px-5 py-3.5 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition-colors hover:border-ink"
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>

        <p className="mt-7 text-center text-[11px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
          Free · Your plans, your collaborators
        </p>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
