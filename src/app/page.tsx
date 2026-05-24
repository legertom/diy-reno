import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { UIMessage } from "ai";
import {
  requireUser,
  listProjectsForUser,
  ensureIntakePlaceholder,
  getProjectChat,
  INTAKE_PLACEHOLDER_TITLE,
} from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Eyebrow, Badge, SectionHeader } from "@/components/ui";
import { NewProjectForm } from "@/components/new-project-form";
import { IntakeFlow } from "@/components/intake-flow";

export default async function DashboardPage() {
  const user = await requireUser();
  const { owned, shared } = await listProjectsForUser(user.id, user.email);
  const all = [...owned, ...shared];

  // Hide intake placeholders from the listing — they only exist so the
  // modal has a project_id to write to, and shouldn't look like real work
  // sitting on the dashboard until the Foreman has renamed them.
  const visible = all.filter(
    (p) => p.title !== INTAKE_PLACEHOLDER_TITLE,
  );

  // First-time users (no real projects yet) get the auto-opening intake
  // modal. The placeholder is created idempotently so refreshing or
  // dismissing/reopening continues the same chat thread.
  let intake: { projectId: string; messages: UIMessage[] } | null = null;
  if (visible.length === 0) {
    const { projectId } = await ensureIntakePlaceholder(user.id);
    const messages = (await getProjectChat(projectId)) as UIMessage[];
    intake = { projectId, messages };
  }

  // Group by Property (the organizing parent introduced in Phase 1).
  const groups: { name: string; items: typeof visible }[] = [];
  for (const p of visible) {
    const name = p.property?.name ?? "My place";
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, items: [] };
      groups.push(g);
    }
    g.items.push(p);
  }

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-32 sm:px-8 sm:pt-20">
        <header className="max-w-2xl">
          <Eyebrow>DIY Reno</Eyebrow>
          <h1 className="font-display mt-4 text-[clamp(2.75rem,9vw,5.25rem)] text-ink">
            Your renovations
          </h1>
          <p className="mt-4 max-w-md text-base text-ink-soft">
            One place, one job at a time — planned with an expert contractor
            in the room.
          </p>
        </header>

        <section className="mt-16 sm:mt-24">
          <SectionHeader index="01" label="Projects" />

          {visible.length === 0 && intake ? (
            <IntakeFlow
              projectId={intake.projectId}
              initialMessages={intake.messages}
            />
          ) : (
            <div className="mt-10 space-y-14">
              {groups.map((g) => (
                <div key={g.name}>
                  <div className="flex items-baseline gap-4">
                    <Eyebrow>{g.name}</Eyebrow>
                    <span className="dim-rule min-w-8 flex-1 translate-y-[-0.3em]" />
                  </div>
                  <ul className="mt-2">
                    {g.items.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/p/${p.id}`}
                          className="group flex items-start justify-between gap-6 border-b border-line py-6 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                              <h2 className="font-display text-2xl text-ink transition-colors group-hover:text-ink-soft sm:text-3xl">
                                {p.title}
                              </h2>
                              {p.role !== "owner" && (
                                <Badge tone="blueprint">{p.role}</Badge>
                              )}
                            </div>
                            {p.summary && (
                              <p className="mt-2 max-w-xl text-sm text-ink-faint">
                                {p.summary}
                              </p>
                            )}
                          </div>
                          <ArrowUpRight
                            className="mt-1.5 size-6 shrink-0 text-line-strong transition-colors group-hover:text-ink"
                            strokeWidth={1.5}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {visible.length > 0 && (
          <section className="mt-20 sm:mt-28">
            <SectionHeader index="02" label="New project" />
            <div className="mt-8 max-w-xl">
              <NewProjectForm />
            </div>
          </section>
        )}
      </main>
    </>
  );
}
