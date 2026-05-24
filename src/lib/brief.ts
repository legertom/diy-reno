import { z } from "zod";

/* The structured "spec-sheet" brief. Replaces free-form markdown so the
 * editorial render stays consistent across every project. Old projects keep
 * working — the polish API populates both `brief_structured` (this JSON) and
 * `brief` (the plain-text fallback below), and the chat prompt always reads
 * `brief` so the Foreman is untouched by this change. */

export const briefLocationSchema = z.object({
  /** e.g. "Flatbush Co-op" — the building / complex name if any. */
  building: z.string().optional(),
  /** e.g. "Brooklyn, NY 11226" — neighborhood + city + ZIP. */
  address: z.string().optional(),
  /** Year built, four digits. */
  yearBuilt: z.number().int().min(1600).max(2100).optional(),
});

export const briefPropertySchema = z.object({
  /** Ownership form, e.g. "Co-op · proprietary lease" / "Owner-occupied". */
  ownership: z.string().optional(),
  /** Room dimensions / size, e.g. "5 × 8 ft" or "20' × 7.5' (150 sq ft)". */
  dimensions: z.string().optional(),
  /** Wet areas, e.g. "Bathtub surround + separate tiled shower". */
  wetAreas: z.string().optional(),
  /** Wall / floor substrate, e.g. "Likely plaster (unverified)". */
  substrate: z.string().optional(),
  /** Era-defining elements being preserved, e.g. "Original 1935 pink tile". */
  era: z.string().optional(),
});

export const structuredBriefSchema = z.object({
  /** Project title, e.g. "Bathroom Tile Renovation". */
  title: z.string().min(1),
  /** 1–3 sentence narrative describing what's being done. */
  scope: z.string().min(1),
  location: briefLocationSchema.optional(),
  property: briefPropertySchema.optional(),
  /** Conditions found on site, one item per row. */
  existingConditions: z.array(z.string()).optional(),
  /** Pre-work that's been cleared, e.g. asbestos survey, board approval. */
  preWorkCompleted: z.array(z.string()).optional(),
  /** Site hazards the Foreman should keep in mind on every task. */
  hazards: z.array(z.string()).optional(),
  /** Co-op rules, work-hour limits, neighbor considerations, etc. */
  constraints: z.array(z.string()).optional(),
  /** Free-form catch-all for anything that doesn't fit elsewhere. */
  notes: z.string().optional(),
});

export type StructuredBrief = z.infer<typeof structuredBriefSchema>;
export type BriefLocation = z.infer<typeof briefLocationSchema>;
export type BriefProperty = z.infer<typeof briefPropertySchema>;

/** Plain-text serialization for the Foreman system prompt. The chat route
 *  injects `brief` (text) into its prompt verbatim — keeping that contract
 *  stable means the Foreman doesn't need to learn JSON. */
export function briefToPlainText(b: StructuredBrief): string {
  const lines: string[] = [];

  if (b.location) {
    const parts = [
      b.location.building,
      b.location.address,
      b.location.yearBuilt ? `built ${b.location.yearBuilt}` : null,
    ].filter((p): p is string => Boolean(p));
    if (parts.length) lines.push(`Location: ${parts.join(" · ")}`);
  }

  lines.push(`Scope: ${b.scope}`);

  if (b.property) {
    const { ownership, dimensions, wetAreas, substrate, era } = b.property;
    if (ownership) lines.push(`Ownership: ${ownership}`);
    if (dimensions) lines.push(`Dimensions: ${dimensions}`);
    if (wetAreas) lines.push(`Wet areas: ${wetAreas}`);
    if (substrate) lines.push(`Substrate: ${substrate}`);
    if (era) lines.push(`Era pieces: ${era}`);
  }

  const block = (label: string, items?: string[]) => {
    if (!items?.length) return;
    lines.push("", `${label}:`);
    for (const item of items) lines.push(`- ${item}`);
  };

  block("Existing conditions", b.existingConditions);
  block("Cleared / pre-work completed", b.preWorkCompleted);
  block("Hazards", b.hazards);
  block("Constraints", b.constraints);

  if (b.notes) {
    lines.push("", "Notes:", b.notes);
  }

  return lines.join("\n");
}
