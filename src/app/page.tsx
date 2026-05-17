import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { requireUser, listProjectsForUser } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow, Badge, SectionHeader } from "@/components/ui";
import { NewProjectForm } from "@/components/new-project-form";

export default async function DashboardPage() {
  const user = await requireUser();
  const { owned, shared } = await listProjectsForUser(user.id, user.email);
  const all = [...owned, ...shared];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-3xl px-5 pt-8 pb-24">
        <div className="blueprint-surface sheet-frame tick-corners rounded-[var(--radius-card)] px-7 py-8 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <Eyebrow className="!text-[#7fa6cb]">Project Dossier</Eyebrow>
            <span className="sheet-no text-[#7fa6cb]">DIY·RENO / A-1</span>
          </div>
          <h1 className="font-display mt-3 text-3xl leading-[1.05] text-white sm:text-[2.7rem]">
            Your renovations
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#aec6de]">
            Every job, drafted like a set of plans — phased, scheduled, and
            built with an expert in the room.
          </p>
        </div>

        <section className="mt-8">
          <SectionHeader
            index="01"
            label="In progress"
            sheet={`${all.length} TOTAL`}
          />

          <div className="mt-4 grid gap-3">
            {all.length === 0 && (
              <Card frame className="px-7 py-10 text-center">
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

        <section className="mt-10">
          <SectionHeader index="02" label="New project" sheet="NEW" />
          <Card frame className="mt-4 p-6">
            <div className="mb-4 flex items-center gap-1.5 text-brass">
              <Plus className="size-3.5" strokeWidth={2.5} />
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase">
                Start a drawing set
              </span>
            </div>
            <NewProjectForm />
          </Card>
        </section>
      </main>
    </>
  );
}
