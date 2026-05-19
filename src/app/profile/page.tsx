import { requireUser, getUserTools } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow, SectionHeader } from "@/components/ui";
import { ToolsManager } from "@/components/tools-manager";

export default async function ProfilePage() {
  const user = await requireUser();
  const tools = await getUserTools(user.id);

  return (
    <>
      <AppHeader user={user} crumb={{ href: "/", label: "Projects" }} />
      <main className="mx-auto max-w-5xl px-5 pt-12 pb-32 sm:px-8 sm:pt-16">
        <header className="max-w-xl">
          <Eyebrow>Your toolbox</Eyebrow>
          <h1 className="font-display mt-4 text-[clamp(2rem,6vw,3.5rem)] text-ink">
            Tools you own
          </h1>
          <p className="mt-3 max-w-md text-base text-ink-soft">
            List the tools already in your kit. On every task, the Foreman
            cross-checks the tools the job needs against this list and tells
            you what to <span className="text-ink">buy</span> versus{" "}
            <span className="text-ink">rent</span>.
          </p>
        </header>

        <section className="mt-12">
          <SectionHeader index="01" label="Inventory" className="mb-4" />
          <Card frame className="mt-6 p-5 sm:p-6">
            <ToolsManager
              tools={tools.map((t) => ({ id: t.id, name: t.name }))}
            />
          </Card>
        </section>
      </main>
    </>
  );
}
