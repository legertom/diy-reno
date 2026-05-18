import { requireUser, listProjectsForUser } from "@/lib/projects";
import { ForemanBubble } from "@/components/foreman-bubble";

// Global, always-available Foreman. Rendered from AppHeader so it
// appears on every authenticated page (never on /signin).
export async function ForemanLauncher() {
  const user = await requireUser();
  const { owned, shared } = await listProjectsForUser(
    user.id,
    user.email,
  );
  const projects = [...owned, ...shared].map((p) => ({
    id: p.id,
    title: p.title,
  }));
  return <ForemanBubble projects={projects} />;
}
