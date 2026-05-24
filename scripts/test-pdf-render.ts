// Standalone smoke test: render the BriefPDF with mock data so we can verify
// the @react-pdf/renderer pipeline (Geist font registration, layout, page
// breaks, photos) without needing a live DB. Writes to /tmp/brief-test.pdf.

import { writeFile } from "node:fs/promises";
import { renderToBuffer } from "@react-pdf/renderer";
import { BriefPDF } from "../src/lib/brief-pdf";
import type { StructuredBrief } from "../src/lib/brief";

const brief: StructuredBrief = {
  title: "Kitchen Renovation",
  scope:
    "Gut renovation of a 1935 Brooklyn co-op kitchen: replace cabinets, counter, sink, dishwasher, range, and floor; refresh walls and lighting. Doing as much as possible solo on nights and weekends.",
  location: {
    building: "Flatbush Co-op",
    address: "Brooklyn, NY 11226",
    yearBuilt: 1935,
  },
  property: {
    ownership: "Co-op · proprietary lease",
    dimensions: "20' × 7.5' galley (150 sq ft)",
    wetAreas: "Single sink wall (no dishwasher today)",
    substrate: "Likely plaster over brick (unverified)",
    era: "Original 1935 floor tile in vestibule (preserve)",
  },
  existingConditions: [
    "Cabinets: 1990s flat-pack, doors warped, mismatched hinges",
    "Counter: laminate with delamination at sink edge",
    "Floor: vinyl sheet over unknown substrate",
    "One 20A circuit serves the whole kitchen — undersized for new range",
  ],
  preWorkCompleted: [
    "Board approval received for scope (2026-03-12)",
    "Insurance certificate filed with management",
    "Asbestos survey: floor tested negative, walls untested",
  ],
  hazards: [
    "Assume lead paint on painted surfaces until tested (built 1935)",
    "Wall substrate likely plaster — cut carefully, expect dust",
    "Old wiring: assume ungrounded until verified at each box",
  ],
  constraints: [
    "Work hours per house rules: weekdays 9–5, Saturday 10–4, no Sunday work",
    "Service elevator must be reserved 48h in advance",
    "Hallway protection required during demo",
    "Trash chute is for household waste only — construction debris bagged + carried",
  ],
  notes:
    "Neighbors below are sensitive to noise — anchor cabinets with adhesive plus a few screws into studs only where needed. Keep angle-grinder use to mornings.",
};

async function main() {
  const buffer = await renderToBuffer(
    BriefPDF({
      title: brief.title,
      brief,
      photos: [],
      generatedAt: new Date("2026-05-24T00:00:00Z"),
    }),
  );
  const out = "/tmp/brief-test.pdf";
  await writeFile(out, buffer);
  console.log(`Wrote ${buffer.length} bytes to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
