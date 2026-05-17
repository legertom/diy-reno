import { requireUser, getUserTools } from "@/lib/projects";
import { AppHeader } from "@/components/app-header";
import { Card, Eyebrow } from "@/components/ui";
import { ToolsManager } from "@/components/tools-manager";

export default async function ProfilePage() {
  const user = await requireUser();
  const tools = await getUserTools(user.id);

  return (
    <>
      <AppHeader user={user} crumb={{ href: "/", label: "Projects" }} />
      <main className="mx-auto max-w-3xl px-5 pt-6 pb-28">
        <div className="blueprint-surface ticked rounded-[var(--radius-card)] px-6 py-7 shadow-[var(--shadow-card)]">
          <Eyebrow className="!text-[#9fc0e0]">Your toolbox</Eyebrow>
          <h1 className="font-display mt-1.5 text-3xl text-white">
            Tools you own
          </h1>
          <p className="mt-2 max-w-md text-sm text-[#bcd0e6]">
            List the tools already in your kit. On every task, the Foreman
            cross-checks the tools the job needs against this list and tells
            you what to <span className="text-white">buy</span> versus{" "}
            <span className="text-white">rent</span>.
          </p>
        </div>

        <section className="mt-5">
          <Eyebrow brass>Inventory · {tools.length}</Eyebrow>
          <div className="rule mt-2 mb-3" />
          <Card className="p-5">
            <ToolsManager
              tools={tools.map((t) => ({ id: t.id, name: t.name }))}
            />
          </Card>
        </section>
      </main>
    </>
  );
}
