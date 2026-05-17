import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { requireUser, listProjectsForUser } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow, Badge } from "@/components/ui";
import { NewProjectForm } from "@/components/new-project-form";

export default async function DashboardPage() {
  const user = await requireUser();
  const { owned, shared } = await listProjectsForUser(user.id, user.email);
  const all = [...owned, ...shared];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-5 pt-8 pb-24">
        <div className="blueprint-surface ticked rounded-[var(--radius-card)] px-7 py-8 shadow-[var(--shadow-card)]">
          <Eyebrow className="!text-[#9fc0e0]">Project Dossier</Eyebrow>
          <h1 className="font-display mt-2 text-3xl text-white sm:text-4xl">
            Your renovations
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#bcd0e6]">
            Every job, drafted like a set of plans — phased, scheduled, and
            built with an expert in the room.
          </p>
        </div>

        <section className="mt-7">
          <div className="flex items-center justify-between">
            <Eyebrow brass>In progress</Eyebrow>
            <span className="font-mono text-[11px] text-ink-faint">
              {all.length} total
            </span>
          </div>
          <div className="rule mt-2" />

          <div className="mt-4 grid gap-3">
            {all.length === 0 && (
              <Card ticked className="px-7 py-10 text-center">
                <p className="font-display text-xl">No projects yet</p>
                <p className="mt-1.5 text-sm text-ink-faint">
                  Start your first plan below — name the room or the job.
                </p>
              </Card>
            )}

            {all.map((p) => (
              <Link key={p.id} href={`/p/${p.id}`} className="group block">
                <Card className="px-5 py-4 transition-colors group-hover:border-brass">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display truncate text-xl text-ink">
                          {p.title}
                        </h2>
                        {p.role !== "owner" && (
                          <Badge tone="blueprint">{p.role}</Badge>
                        )}
                      </div>
                      {p.summary && (
                        <p className="mt-1 line-clamp-2 text-sm text-ink-faint">
                          {p.summary}
                        </p>
                      )}
                    </div>
                    <ArrowUpRight
                      className="mt-1 size-5 shrink-0 text-line-strong transition-colors group-hover:text-brass"
                      strokeWidth={1.75}
                    />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-9">
          <Eyebrow brass>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="size-3" strokeWidth={2.5} /> New project
            </span>
          </Eyebrow>
          <div className="rule mt-2" />
          <Card className="mt-4 p-5">
            <NewProjectForm />
          </Card>
        </section>
      </main>
    </>
  );
}
