import { auth } from "@/auth";
import { getAccess, getProjectChat } from "@/lib/projects";

// Returns the project-level Foreman thread for the floating bubble.
export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "Missing project" }, { status: 400 });
  }
  const role = await getAccess(
    projectId,
    session.user.id,
    session.user.email,
  );
  if (!role) return Response.json({ error: "Forbidden" }, { status: 403 });

  const messages = await getProjectChat(projectId);
  return Response.json({ messages });
}
