import { generateText } from "ai";
import { auth } from "@/auth";
import { getAccess } from "@/lib/projects";

export const maxDuration = 45;

const MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4.6";

const SYSTEM = `You turn a homeowner's messy renovation description into a tight, well-organized PROJECT BRIEF that an AI site foreman will read on every task.

Rules:
- PRESERVE every concrete fact the user gave (wall/structure type, house age, room/dimensions, layout, scope, what's staying vs going, materials on hand, tools, crew/help, budget, timeline constraints, utilities, prior work done). Do not drop details.
- Do NOT invent specifics that weren't stated (no made-up dimensions, dates, brands, or budgets).
- You MAY add clearly-flagged safety implications that follow directly from stated facts — e.g. if the home is pre-1978 or has old plaster/flooring, note "(assume lead/asbestos until tested)". Mark anything inferred with "(inferred)".
- Output PLAIN TEXT (short labeled lines or '- ' bullets, no markdown headers, no preamble, no sign-off). Group logically: Structure, Age & hazards, Space, Scope, Constraints, Crew, Budget, Materials/tools on hand, Notes. Omit a group if the user said nothing about it.
- Be concise and factual — this is reference context, not prose. If the input is empty or has no real content, return exactly: NO_CONTENT`;

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { projectId, raw } = (await req.json()) as {
    projectId?: string;
    raw?: string;
  };
  if (!projectId) {
    return Response.json({ error: "Missing project" }, { status: 400 });
  }
  const text = (raw ?? "").trim();
  if (text.length < 8) {
    return Response.json(
      { error: "Add a bit more detail first." },
      { status: 400 },
    );
  }

  const role = await getAccess(
    projectId,
    session.user.id,
    session.user.email,
  );
  if (!role) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { text: out } = await generateText({
      model: MODEL,
      system: SYSTEM,
      prompt: `Clean up and structure this into the project brief:\n\n${text}`,
    });
    const brief = out.trim();
    if (!brief || brief === "NO_CONTENT") {
      return Response.json(
        { error: "Couldn't find real detail to structure." },
        { status: 422 },
      );
    }
    return Response.json({ brief });
  } catch (e) {
    console.error("[polish-brief] failed:", e);
    return Response.json(
      { error: "Couldn't polish that — try again." },
      { status: 502 },
    );
  }
}
