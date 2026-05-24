import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { getAccess, getProjectPhotos } from "@/lib/projects";
import { structuredBriefSchema } from "@/lib/brief";
import { BriefPDF, type BriefPhoto } from "@/lib/brief-pdf";

// PDF rendering involves font subsetting and image fetching — give it room.
// The route is dynamic anyway (calls auth()), so no need for force-dynamic.
export const maxDuration = 60;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "project"
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> {
  const { projectId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Not signed in", { status: 401 });
  }

  const role = await getAccess(
    projectId,
    session.user.id,
    session.user.email,
  );
  if (!role) {
    return new Response("Not found", { status: 404 });
  }

  const db = getDb();
  const [projectRow, photoRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        title: projects.title,
        briefStructured: projects.briefStructured,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((rows) => rows[0]),
    getProjectPhotos(projectId),
  ]);

  if (!projectRow) {
    return new Response("Not found", { status: 404 });
  }

  const parsed = structuredBriefSchema.safeParse(projectRow.briefStructured);
  if (!parsed.success) {
    return new Response(
      "This project doesn't have a formatted brief yet. Tap Format on the brief first.",
      { status: 400 },
    );
  }

  const photos: BriefPhoto[] = photoRows.map((p) => ({
    id: p.id,
    url: p.url,
    caption: p.caption,
  }));

  // Lazy-import the renderer so the rest of the route stays light.
  const { renderToBuffer } = await import("@react-pdf/renderer");

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      BriefPDF({
        title: projectRow.title,
        brief: parsed.data,
        photos,
        generatedAt: new Date(),
      }),
    );
  } catch (err) {
    console.error("[brief-pdf] render failed:", err);
    return new Response("Couldn't render the PDF", { status: 500 });
  }

  const filename = `${slugify(projectRow.title)}-brief.pdf`;

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
