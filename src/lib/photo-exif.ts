/**
 * Client-side EXIF read for photo uploads. We only care about two fields:
 *   - capture moment  (DateTimeOriginal / DateTime)
 *   - orientation     (1–8; rotation/flip hint)
 *
 * **No GPS** — DIY Reno never reads or surfaces location from photos.
 * `exifr` is explicitly configured `gps: false` so latitude/longitude never
 * even enter memory. Tom's photos are taken on-site in his own home; the
 * privacy default is "the app doesn't know."
 *
 * Returns nulls (never throws) when EXIF is absent or malformed —
 * screenshots, web downloads, and re-encoded images often lack it. The
 * upload path falls back to upload time + no orientation in that case.
 */
import exifr from "exifr";

export type PhotoExif = {
  takenAt: Date | null;
  orientation: number | null;
};

export async function readPhotoExif(file: File): Promise<PhotoExif> {
  if (!file.type.startsWith("image/")) {
    return { takenAt: null, orientation: null };
  }
  try {
    const parsed = (await exifr.parse(file, {
      pick: ["DateTimeOriginal", "DateTime", "Orientation"],
      gps: false,
      ifd1: false,
      interop: false,
      tiff: true,
      exif: true,
    })) as
      | {
          DateTimeOriginal?: Date | string;
          DateTime?: Date | string;
          Orientation?: number;
        }
      | undefined;

    if (!parsed) return { takenAt: null, orientation: null };

    const raw = parsed.DateTimeOriginal ?? parsed.DateTime;
    let takenAt: Date | null = null;
    if (raw instanceof Date) {
      takenAt = isFinite(raw.getTime()) ? raw : null;
    } else if (typeof raw === "string") {
      const d = new Date(raw);
      takenAt = isFinite(d.getTime()) ? d : null;
    }

    const orientation =
      typeof parsed.Orientation === "number" &&
      parsed.Orientation >= 1 &&
      parsed.Orientation <= 8
        ? parsed.Orientation
        : null;

    return { takenAt, orientation };
  } catch {
    return { takenAt: null, orientation: null };
  }
}
