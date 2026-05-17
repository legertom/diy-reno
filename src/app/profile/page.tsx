import { requireUser, getUserTools } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow, SectionHeader } from "@/components/ui";
import { ToolsManager } from "@/components/tools-manager";

export default async function ProfilePage() {
  const user = await requireUser();
  const tools = await getUserTools(user.id);

  return (
    <>
      <AppHeader
        user={user}
        crumb={{ href: "/", label: "Projects" }}
        sheet="T-1"
      />
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28">
        <div className="blueprint-surface sheet-frame tick-corners rounded-[var(--radius-card)] px-7 py-7 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <Eyebrow className="!text-[#7fa6cb]">Your toolbox</Eyebrow>
            <span className="sheet-no text-[#7fa6cb]">SCHEDULE T-1</span>
          </div>
          <h1 className="font-display mt-3 text-3xl leading-[1.05] text-white sm:text-[2.4rem]">
            Tools you own
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#aec6de]">
            List the tools already in your kit. On every task, the Foreman
            cross-checks the tools the job needs against this list and tells
            you what to <span className="text-white">buy</span> versus{" "}
            <span className="text-white">rent</span>.
          </p>
        </div>

        <section className="mt-8">
          <SectionHeader
            index="01"
            label="Inventory"
            sheet={`${tools.length} ITEMS`}
            className="mb-3"
          />
          <Card frame className="p-5 sm:p-6">
            <ToolsManager
              tools={tools.map((t) => ({ id: t.id, name: t.name }))}
            />
          </Card>
        </section>
      </main>
    </>
  );
}
