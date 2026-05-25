import "server-only";
import { z } from "zod";
import { generateText, Output } from "ai";

/** Phase 5.10 v0 — color extraction from a photo. Same model as the
 *  passive vision pass; the spend is one-off per click (no caching),
 *  so it never recurs per view. */
const PALETTE_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";

export const photoColorSchema = z.object({
  /** Hex code, #RRGGBB. The model is asked to normalize to lowercase. */
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Plain English name the user can read: "warm white", "sage", etc. */
  name: z.string(),
  /** What's painted/upholstered with this color — "walls", "cabinets",
   *  "trim", "fabric", etc. Helps when the user is shopping for one
   *  specific surface. Optional because not every color in an image
   *  corresponds to a paintable surface. */
  surface: z.string().optional(),
});

export const photoPaletteSchema = z.object({
  colors: z.array(photoColorSchema).min(1).max(6),
});

export type PhotoColor = z.infer<typeof photoColorSchema>;
export type PhotoPalette = z.infer<typeof photoPaletteSchema>;

const SYSTEM = `Look at one photo (a paint chip, an inspiration shot, a finished room, anything visual) and identify the 3–5 dominant or interesting colors. For each, return:

- hex: a #RRGGBB code (lowercase letters, exactly 7 characters), your best estimate
- name: a short human-readable name ("warm white", "sage", "muted brass")
- surface: optional — what the color is painted on or made from in the photo ("walls", "cabinets", "trim", "tile", "fabric"); leave it off when the color isn't obviously a surface

Be conservative — false negatives are better than false positives. If the image is mostly one color, return only that one. If it's a busy scene, return the 5 the user would most likely want to match. Skip pure white, pure black, and neutral grays unless they're the main subject. Don't invent names.`;

export class PaletteError extends Error {}

export async function extractPalette(imageUrl: string): Promise<PhotoPalette> {
  try {
    const { output } = await generateText({
      model: PALETTE_MODEL,
      experimental_output: Output.object({ schema: photoPaletteSchema }),
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the dominant colors from this photo.",
            },
            { type: "image", image: new URL(imageUrl) },
          ],
        },
      ],
    });
    // Normalize hex casing — the schema allows either, but the UI keys
    // off lowercase for consistent swatches.
    return {
      colors: output.colors.map((c) => ({
        ...c,
        hex: c.hex.toLowerCase(),
      })),
    };
  } catch (e) {
    throw new PaletteError((e as Error).message || "palette extraction failed");
  }
}

/** Build per-brand search URLs from a color name. Honest about what
 *  this is: a deep link into the brand's search, not a guaranteed
 *  match. No external API call, no API key, no recurring cost — the
 *  brand's own search ranks the closest matches. */
export function paintMatchLinks(
  color: PhotoColor,
): { brand: string; url: string }[] {
  const q = encodeURIComponent(color.name);
  return [
    {
      brand: "Sherwin-Williams",
      url: `https://www.sherwin-williams.com/en-us/color/color-search?term=${q}`,
    },
    {
      brand: "Benjamin Moore",
      url: `https://www.benjaminmoore.com/en-us/color-overview/find-your-color/color-search?searchKeyword=${q}`,
    },
    {
      brand: "Behr",
      url: `https://www.behr.com/consumer/color/find-a-color?query=${q}`,
    },
  ];
}
