import { z } from "zod";

/** ROI shape locked in PHOTO_PLAN.md §5.4. The same vision call that
 *  caption/tag/embeds a photo also returns 3–5 regions of interest with
 *  category labels. Each ROI is a CSS object-position overlay on the
 *  source image — no extra Blob writes. */
export const roiCategorySchema = z.enum([
  "defect",
  "transition",
  "progress",
  "moment",
  "safety",
]);

export const photoROISchema = z.object({
  /** Stable id within the photo. */
  id: z.string(),
  /** Normalized bbox in [0..1] coords relative to the source image. */
  bbox: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  }),
  category: roiCategorySchema,
  /** One-line "what the Foreman saw" — surfaced beneath the cropped
   *  thumbnail in the detail strip. */
  caption: z.string(),
  /** Per-ROI embedding for region-level same-angle pairing (5.7).
   *  Optional because not every model emits these; the wide-image
   *  embedding still works. */
  embedding: z.array(z.number()).optional(),
});

export const photoSafetyFlagSchema = z.object({
  /** Short code: electrical | structural | mold | asbestos | code | other. */
  kind: z.string(),
  severity: z.enum(["info", "warn", "stop"]),
  /** What was seen. */
  detail: z.string(),
  /** What the Foreman recommends — usually "stop, call a licensed pro". */
  recommendation: z.string().optional(),
});

export const photoVisionResultSchema = z.object({
  caption: z.string(),
  tags: z.array(z.string()).max(20),
  embedding: z.array(z.number()),
  rois: z.array(photoROISchema).max(8),
  safetyFlags: z.array(photoSafetyFlagSchema).max(8),
});

export type PhotoROI = z.infer<typeof photoROISchema>;
export type PhotoSafetyFlag = z.infer<typeof photoSafetyFlagSchema>;
export type PhotoVisionResult = z.infer<typeof photoVisionResultSchema>;
export type ROICategory = z.infer<typeof roiCategorySchema>;
