import { generateText, Output } from "ai";
import { z } from "zod";
import { auth } from "@/auth";

export const maxDuration = 60;

const MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4.6";

const PROMPT = `You are identifying DIY / renovation / hand & power tools in a photo so they can be added to a homeowner's tool inventory.

List every distinct TOOL you can clearly see. Rules:
- Use concise, common names a hardware store would use (e.g. "Cordless drill", "Random orbital sander", "Speed square", "Caulk gun"). Title case, singular.
- One entry per distinct tool type. Don't list duplicates or quantities.
- Include power tools, hand tools, and measuring/layout tools. Ignore consumables, fasteners, materials, packaging, furniture, and anything you're not reasonably confident is a tool.
- If you see no tools, return an empty list.`;

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let bytes: Uint8Array;
  let mediaType = "image/jpeg";
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return Response.json(
        { error: "Image too large — try again." },
        { status: 413 },
      );
    }
    if (file.type) mediaType = file.type;
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "Could not read image" }, { status: 400 });
  }

  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({
        schema: z.object({
          tools: z
            .array(
              z.object({
                name: z
                  .string()
                  .describe("Concise common tool name, title case, singular"),
              }),
            )
            .describe("Distinct tools visible in the photo"),
        }),
      }),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image", image: bytes, mediaType },
          ],
        },
      ],
    });

    const names = Array.from(
      new Set(
        (output?.tools ?? [])
          .map((t) => t.name.trim())
          .filter((n) => n.length > 1 && n.length < 60),
      ),
    );

    return Response.json({ tools: names });
  } catch (e) {
    console.error("[identify-tools] failed:", e);
    return Response.json(
      { error: "Couldn't analyze that photo — try another." },
      { status: 502 },
    );
  }
}
