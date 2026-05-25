import { z } from "zod";

/** Shape locked in PHOTO_PLAN.md §5 Q2.
 *  Populated by the Phase 4 intake interview and editable from the
 *  "why this image?" panel in 5.2. The Foreman writes it via a tool
 *  (added in this phase); structured field changes are dreamTriggers. */
export const styleProfileSchema = z.object({
  /** 3–5 hex values. Anchor swatches for the render. */
  palette: z.array(z.string().regex(/^#([0-9a-fA-F]{3}){1,2}$/)).max(5).optional(),
  finishes: z
    .object({
      cabinets: z.string().optional(),
      counters: z.string().optional(),
      floors: z.string().optional(),
      fixtures: z.string().optional(),
      backsplash: z.string().optional(),
      walls: z.string().optional(),
    })
    .optional(),
  /** Freeform from intake — "warm scandinavian", "1920s english cottage". */
  vibe: z.string().optional(),
  /** Up to 3 inspiration Blob URLs. Grounding for the multimodal model
   *  when present. */
  referenceImages: z.array(z.string().url()).max(3).optional(),
  dimensionsHint: z.string().optional(),
});

export type StyleProfile = z.infer<typeof styleProfileSchema>;

/** Build the dream-hero prompt from a project's styleProfile + brief.
 *  Kept as one function so the "why this image?" panel can render the
 *  same text the model receives.
 *
 *  When `hasRoomPhotos` is true, the renderer is also passing the user's
 *  actual room photos as image inputs — the prompt leads with a strong
 *  "preserve THIS room" instruction so the multimodal model doesn't
 *  invent a different kitchen. When `refImageCount > 0` the prompt
 *  acknowledges inspiration images.  */
export function buildDreamPrompt(input: {
  projectTitle: string;
  brief: string | null;
  styleProfile: StyleProfile | null;
  hasRoomPhotos?: boolean;
  refImageCount?: number;
}): string {
  const sp = input.styleProfile ?? {};
  const parts: string[] = [];

  if (input.hasRoomPhotos) {
    parts.push(
      `THIS IS THE USER'S ACTUAL ROOM — see the attached photo${input.refImageCount && input.refImageCount > 0 ? "s of the room" : "(s)"}. Render the SAME room finished: preserve the layout, the window placement, the wall positions, the ceiling height, and the proportions. Do NOT invent a different kitchen. Show how the room they actually have will look once the renovation is complete.`,
    );
  } else {
    parts.push(
      `High-end editorial photograph of a finished ${input.projectTitle.toLowerCase()}.`,
    );
  }

  parts.push(
    `Magazine-quality, natural light, single hero shot, no people, no text overlays, no watermarks.`,
  );

  if (input.refImageCount && input.refImageCount > 0) {
    parts.push(
      `Some attached photos are inspiration references — pull style and finish cues from them, but apply those cues to the user's actual room (not a copy of the reference).`,
    );
  }

  if (sp.vibe) parts.push(`Vibe: ${sp.vibe}.`);
  if (sp.dimensionsHint) parts.push(`Space: ${sp.dimensionsHint}.`);

  const f = sp.finishes ?? {};
  const finishLines: string[] = [];
  if (f.cabinets) finishLines.push(`cabinets: ${f.cabinets}`);
  if (f.counters) finishLines.push(`counters: ${f.counters}`);
  if (f.floors) finishLines.push(`floors: ${f.floors}`);
  if (f.fixtures) finishLines.push(`fixtures: ${f.fixtures}`);
  if (f.backsplash) finishLines.push(`backsplash: ${f.backsplash}`);
  if (f.walls) finishLines.push(`walls: ${f.walls}`);
  if (finishLines.length) parts.push(`Finishes — ${finishLines.join("; ")}.`);

  if (sp.palette && sp.palette.length) {
    parts.push(`Color palette anchored by ${sp.palette.join(", ")}.`);
  }

  if (input.brief && input.brief.trim()) {
    parts.push(
      `Honor existing constraints from the project brief: ${input.brief.trim().slice(0, 500)}.`,
    );
  }

  parts.push(
    `Aspect 4:3. Composition: wide hero framing showing the full room. Style: Architectural Digest meets Kinfolk — warm paper tones, restraint over theming, generous negative space.`,
  );

  return parts.join(" ");
}

/** Heuristic completeness signal. Drives the "Generate your dream" CTA
 *  state on the home page (no nag — just an unobtrusive "ready when you
 *  are"). */
export function styleProfileHasEnoughForRender(sp: StyleProfile | null): boolean {
  if (!sp) return false;
  if (sp.vibe && sp.vibe.trim()) return true;
  const f = sp.finishes ?? {};
  const finishCount = Object.values(f).filter(
    (v) => typeof v === "string" && v.trim().length > 0,
  ).length;
  return finishCount >= 2;
}

/** Deep equality on the dreamTrigger-relevant subset. Returns true when a
 *  re-render is warranted by a styleProfile change. Reference image add /
 *  remove counts via array length + URL set. */
export function styleProfileTriggersRerender(
  before: StyleProfile | null,
  after: StyleProfile | null,
): boolean {
  if (!before && !after) return false;
  if (!before || !after) return true;
  if (before.vibe !== after.vibe) return true;
  if (before.dimensionsHint !== after.dimensionsHint) return true;
  if ((before.palette ?? []).join("|") !== (after.palette ?? []).join("|"))
    return true;
  const fb = before.finishes ?? {};
  const fa = after.finishes ?? {};
  const keys: (keyof NonNullable<StyleProfile["finishes"]>)[] = [
    "cabinets",
    "counters",
    "floors",
    "fixtures",
    "backsplash",
    "walls",
  ];
  for (const k of keys) if (fb[k] !== fa[k]) return true;
  const rb = (before.referenceImages ?? []).slice().sort().join("|");
  const ra = (after.referenceImages ?? []).slice().sort().join("|");
  if (rb !== ra) return true;
  return false;
}
