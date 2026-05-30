import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { properties } from "@/db/schema";

/** Phase 5.14 floor-plan ingestion. Single Gemini Flash vision call:
 *  user-uploaded sketch or contractor drawing → suggested room list,
 *  which the property owner confirms one by one before it lands in
 *  `property.rooms` (column from Phase 1, nullable until 5.14). Same
 *  provider family as the photo-vision pass; cost shape is the same
 *  ("once per upload, never per view"). */
const FLOOR_PLAN_MODEL =
  process.env.FLOOR_PLAN_MODEL ||
  process.env.VISION_MODEL ||
  "google/gemini-2.5-flash";

export const floorPlanExtractionSchema = z.object({
  rooms: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .max(40)
          .describe(
            "Short room label as a human would say it — 'Kitchen', 'Primary bath', 'Living room'. Title case.",
          ),
        notes: z
          .string()
          .max(140)
          .optional()
          .describe(
            "Optional one-line context the user might find useful — adjacency, approximate dimensions if labeled, fixtures visible. Skip if there's nothing concrete to add.",
          ),
      }),
    )
    .max(20)
    .describe(
      "Each room visible in the floor plan. Skip closets and shafts unless the plan explicitly labels them as a usable room. Conservative — better to miss a room than to invent one.",
    ),
});

export type FloorPlanExtraction = z.infer<typeof floorPlanExtractionSchema>;

export class FloorPlanError extends Error {}

const SYSTEM = `You are the same warm-honest Foreman the user already talks to. They've uploaded a floor plan — could be a hand sketch, an MLS listing, or a contractor's drawing. Read it carefully and return the rooms you can see.

Rules:
- Use everyday room names ("Kitchen", "Primary bedroom", "Powder room") — not architectural codes ("BR-1").
- Title Case. One name per room.
- Skip closets, mechanical shafts, and structural voids unless the plan labels them as a usable room.
- Per room, optionally add a short notes line if there's a concrete fact visible in the plan (adjacency, approximate dimensions if labeled, fixtures present). Skip the notes if you'd be inventing.
- Conservative. Better to miss a room than to invent one. If the image isn't a floor plan, return an empty array.
- Don't moralize. Don't comment on the renovation potential or "what could be better."`;

/** Server-only. Calls the vision pass on the property's floor plan and
 *  returns the suggested rooms WITHOUT persisting them. The UI presents
 *  the list to the owner who accepts/edits/discards each before
 *  setPropertyRooms (in actions.ts) writes the confirmed set. */
export async function extractRoomsFromFloorPlan(
  propertyId: string,
): Promise<FloorPlanExtraction> {
  const db = getDb();
  const [property] = await db
    .select({
      id: properties.id,
      floorPlanUrl: properties.floorPlanUrl,
    })
    .from(properties)
    .where(eq(properties.id, propertyId));
  if (!property) throw new FloorPlanError("Property not found");
  if (!property.floorPlanUrl) {
    throw new FloorPlanError("No floor plan uploaded for this property yet");
  }

  const { output } = await generateText({
    model: FLOOR_PLAN_MODEL,
    experimental_output: Output.object({ schema: floorPlanExtractionSchema }),
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read this floor plan and list the rooms.",
          },
          { type: "image", image: new URL(property.floorPlanUrl) },
        ],
      },
    ],
  });

  return output;
}
