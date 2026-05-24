import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { canWrite, getAccess } from "@/lib/projects";
import { projects } from "@/db/schema";
import {
  briefToPlainText,
  structuredBriefSchema,
  type StructuredBrief,
} from "@/lib/brief";

export const maxDuration = 45;

const MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4.6";

const SYSTEM = `You turn a homeowner's messy renovation description into a structured PROJECT BRIEF that an AI site foreman will read on every task. You output ONE JSON object that matches the provided schema. No prose, no markdown, just the structured data.

Rules:
- PRESERVE every concrete fact the user gave (wall/structure type, house age, room/dimensions, layout, scope, what's staying vs going, materials on hand, tools, crew/help, budget, timeline constraints, utilities, prior work done). Drop a field only if the user truly said nothing about it.
- Do NOT invent specifics that weren't stated (no made-up dimensions, dates, brands, or budgets).
- You MAY add clearly-flagged safety implications that follow directly from stated facts — e.g. if the home is pre-1978 or has old plaster/flooring, list a "Hazards" item like "Assume lead paint on painted surfaces until tested (built 1935)". Mark anything inferred with a parenthetical "(inferred)".
- "title" must be a short project name (e.g. "Bathroom Tile Renovation"). If the user didn't give one, infer the most accurate short title from the scope.
- "scope" must be 1–3 sentences in plain language summarizing what's being done.
- For list fields (existingConditions, preWorkCompleted, hazards, constraints): one concrete item per array entry, no bullets or numbering inside the strings.
- Be concise and factual — this is reference context, not prose.`;

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
  if (!canWrite(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let structured: StructuredBrief;
  try {
    const { output } = await generateText({
      model: MODEL,
      system: SYSTEM,
      output: Output.object({ schema: structuredBriefSchema }),
      prompt: `Structure this into the project brief:\n\n${text}`,
    });
    structured = output;
  } catch (e) {
    console.error("[polish-brief] generation failed:", e);
    return Response.json(
      { error: "Couldn't polish that — try again." },
      { status: 502 },
    );
  }

  const plain = briefToPlainText(structured);
  if (!plain.trim()) {
    return Response.json(
      { error: "Couldn't find real detail to structure." },
      { status: 422 },
    );
  }

  const db = getDb();
  await db
    .update(projects)
    .set({
      brief: plain,
      briefStructured: structured,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  revalidatePath(`/p/${projectId}`);
  revalidatePath(`/p/${projectId}/foreman`);
  revalidatePath("/");

  return Response.json({ brief: plain, structured });
}
