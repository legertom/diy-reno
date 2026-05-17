/* Seeds the hand-crafted Kitchen Renovation plan as the owner's project.
 * Re-runnable: wipes any existing "Kitchen Renovation" for the email below
 * and recreates it. Owner = SEED_OWNER_EMAIL (linked on first Google login).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

const SEED_OWNER_EMAIL = (
  process.env.SEED_OWNER_EMAIL || "tomleger@gmail.com"
).toLowerCase();

type Guide = {
  tools?: string[];
  materials?: string[];
  safety?: string[];
  steps?: string[];
  tips?: string[];
};
type Item = {
  key: string;
  num: string;
  title: string;
  phase: string;
  hrs: string;
  done?: boolean;
  who?: "tom" | "friends" | "all";
  inProgress?: boolean;
  isNew?: boolean;
  detail?: string;
  guide?: Guide;
};

const ITEMS: Item[] = [
  { key: "t1", num: "1", title: "Clear kitchen & protect surfaces", phase: "1. Wall Prep (done)", hrs: "2–4h", done: true },

  { key: "t2-prev", num: "2", title: "Window frame — earlier strip cycles already applied", phase: "1. Wall Prep — frame strip (in progress)", hrs: "—", done: true, detail: "Tracks the coats you've already done." },
  { key: "t2-scrape1", num: "2a", title: "Window frame — scrape current stripper coat + assess", phase: "1. Wall Prep — frame strip (in progress)", hrs: "1h", who: "tom", inProgress: true, detail: "After ~24h dwell. See if paint lifts cleanly or you need another cycle.", guide: {
    tools: [`Plastic putty knife (1.5–2")`, `Stiff metal scraper for stubborn spots`, `Dental picks or wire brush for corners + molding detail`, `Drop cloth or cardboard to catch debris`, `Lint-free rags`],
    materials: [`Mineral spirits OR denatured alcohol (check your stripper's label for which neutralizer)`, `Nitrile gloves`, `Eye protection`, `Respirator if old paint`],
    safety: [`If house is pre-1978, test debris for lead (Klean-Strip D-Lead swabs ~$10). If positive, switch to wet methods + bag debris for hazardous waste.`],
    steps: [`Test a small area first: scrape with plastic knife at ~30° angle. Paint should curl up in chunks.`, `If paint is still hard or chips, dwell time wasn't long enough — wait a couple more hours OR plan another stripper coat (see step 2b).`, `Work the whole frame with the plastic knife — gentler on the wood underneath.`, `Switch to stiff metal scraper only for stubborn flat areas.`, `Use dental picks for grooves and molding profiles.`, `Wipe the scraped frame with a rag dampened in the recommended neutralizer.`, `Let dry fully (~30 min) before deciding if another coat is needed.`],
    tips: [`Plastic knife = won't gouge wood. Use it for 90% of the work.`, `If the wood feels fuzzy after scraping, that's fine — final sanding handles it.`],
  } },
  { key: "t2-extra", num: "2b", title: "Window frame — apply another stripper coat (if needed)", phase: "1. Wall Prep — frame strip (in progress)", hrs: "0.5h", who: "tom", detail: "Only if step 2a left visible paint.", guide: {
    tools: [`Chip brush or applicator (depends on stripper brand)`, `Plastic wrap (optional, slows evaporation)`, `Disposable container`],
    materials: [`Same paint stripper you've been using`],
    safety: [`Ventilate well — open window, run a fan`, `Nitrile gloves + eye protection`],
    steps: [`Apply stripper liberally — 1/8" thick over remaining paint`, `Cover with plastic wrap if label allows (extends dwell time + prevents skim)`, `Wait per product label — most need 30 min to 24h depending on paint layers`, `Plan the next scrape session for the next evening`],
    tips: [`A second thick coat usually beats a thin third coat. Be generous.`],
  } },
  { key: "t2-final", num: "2c", title: "Window frame — final scrape + neutralize + light sand", phase: "1. Wall Prep — frame strip (in progress)", hrs: "1h", who: "tom", guide: {
    tools: [`Plastic + metal scraper`, `Sanding sponge (medium 120 + fine 220) — orbital is too aggressive for trim`, `Tack cloth or damp microfiber`],
    materials: [`Stripper's neutralizer (water, mineral spirits, or alcohol per label)`, `Rags`],
    steps: [`Final scrape — paint should come off cleanly down to wood`, `Wipe entire frame with neutralizer-dampened rag; let dry 30+ min`, `Hand-sand with 120 grit sponge to knock down rough spots`, `Follow with 220 grit sponge for a smooth pre-primer finish`, `Tack cloth or damp microfiber wipe — frame is ready for primer`],
    tips: [`Don't use the 5" orbital here — too aggressive for narrow trim profiles. Sanding sponge gets into corners.`],
  } },

  { key: "t3-prev", num: "3", title: "Door frame — earlier strip cycles already applied", phase: "1. Wall Prep — frame strip (in progress)", hrs: "—", done: true },
  { key: "t3-scrape1", num: "3a", title: "Door frame — scrape current stripper coat + assess", phase: "1. Wall Prep — frame strip (in progress)", hrs: "1h", who: "tom", inProgress: true, detail: "Same technique as #2a. Watch for lead if pre-1978.", guide: {
    tools: [`Plastic putty knife`, `Metal scraper`, `Dental picks`, `Rags`],
    safety: [`Pre-1978 house? Test for lead — door frames often have many old coats.`],
    steps: [`Scrape with plastic knife at ~30°`, `Pick into corners + door stop molding profile`, `Bag debris carefully (lead-safe disposal if applicable)`, `Wipe with neutralizer; let dry before assessing`],
  } },
  { key: "t3-extra", num: "3b", title: "Door frame — apply another stripper coat (if needed)", phase: "1. Wall Prep — frame strip (in progress)", hrs: "0.5h", who: "tom" },
  { key: "t3-final", num: "3c", title: "Door frame — final scrape + neutralize + light sand", phase: "1. Wall Prep — frame strip (in progress)", hrs: "1h", who: "tom", guide: {
    tools: [`Sanding sponges 120 + 220`],
    steps: [`Final scrape`, `Neutralize per stripper label`, `Hand-sand 120 → 220`, `Tack cloth wipe`],
  } },

  { key: "t4", num: "4", title: "Fill deep holes with spackle", phase: "1. Wall Prep (done)", hrs: "1–2h", done: true },
  { key: "t5", num: "5", title: "Cover large gashes with patches", phase: "1. Wall Prep (done)", hrs: "2–4h", done: true },
  { key: "t6", num: "6", title: "Drywall missing section behind fridge", phase: "1. Wall Prep (done)", hrs: "3–6h", done: true },
  { key: "t7", num: "7", title: "Skim coat entire wall", phase: "1. Wall Prep (done)", hrs: "6–10h", done: true },
  { key: "t8", num: "8", title: "Sand walls smooth", phase: "1. Wall Prep (done)", hrs: "3–5h", done: true },

  { key: "t9", num: "9", title: "Clean up workspace", phase: "1.5 Remediation (NEW)", hrs: "1h", who: "all", isNew: true, detail: "Reset the kitchen so streak work and floor demo aren't fighting dust.", guide: {
    tools: [`Shop vac (HEPA filter ideal)`, `Broom + dustpan`, `Damp microfiber rags`, `Drop cloths or rosin paper`, `Heavy-duty trash bags`],
    steps: [`Vacuum top-down: ceiling corners → walls → window sills → floor`, `Sweep loose debris into pile, then vacuum`, `Wipe walls and trim with damp (not wet) microfiber — picks up fine dust`, `Lay drop cloths along baseboards and over any zones you'll cover with debris`, `Set out a disposal area near the door for tile + plywood debris bags`],
    tips: [`A clean surface lets primer adhere well. Skip this and the streak work will look chalky.`],
  } },
  { key: "t10", num: "10", title: "Strip handyman paint streaks (heat gun + scraper)", phase: "1.5 Remediation (NEW)", hrs: "2–3h", who: "tom", isNew: true, detail: "Heat gun is faster than chemical stripper for thin splatter.", guide: {
    tools: [`Heat gun with variable temp (set 1100–1300°F)`, `Plastic putty knife (1.5–2")`, `Wide plastic scraper (3")`, `Scrap cardboard to catch hot debris`, `Painter's tape`],
    materials: [`N95 or P100 respirator`, `Nitrile gloves`, `Safety glasses`],
    safety: [`TEST FOR LEAD FIRST if any paint pre-1978 — heat gun aerosolizes lead. If positive, switch to chemical stripper.`, `Heat gun can burn skin and ignite paper/cloth. Never set down running.`, `Ventilate — open window, run a fan toward outside.`, `Have a fire extinguisher within reach.`],
    steps: [`Mask off any nearby paint that should stay`, `Hold heat gun 4–6 inches from streak; sweep back and forth, don't dwell`, `When paint bubbles or softens (10–20 sec), scrape with plastic knife at ~30° angle`, `Scrape onto cardboard for easy disposal`, `Work one streak at a time; let zone cool before re-checking`, `Plastic knife first to protect skim coat — only metal scraper if needed on stubborn spots`],
    tips: [`Goof Off or denatured alcohol on a rag can lift very thin paint splatter without heat — try it first on a single streak.`, `If a streak digs a tiny divot when scraped, mark it — you'll feather joint compound during sand step.`],
  } },
  { key: "t11", num: "11", title: "Sand smooth where streaks were stripped", phase: "1.5 Remediation (NEW)", hrs: "1–2h", who: "tom", isNew: true, detail: `Get walls back to primer-ready smooth with the 5" orbital.`, guide: {
    tools: [`5" random orbital sander`, `Shop vac with sander dust port adapter (or sander's onboard dust bag)`, `Sanding sponge (180 + 220) for corners/edges`, `Tack cloth or damp microfiber`],
    materials: [`120 grit hook-and-loop discs (3–5 ea)`, `150 grit discs (3–5)`, `180 grit discs (3–5)`, `Lightweight joint compound + putty knife (for any divots you noted)`],
    safety: [`N95 dust mask minimum`, `Eye protection`, `Hearing protection — orbital is loud over time`],
    steps: [`Connect dust collection — bag or shop vac. Don't skip this; clouds of skim-coat dust are no joke.`, `If any streak left a divot, feather a thin pass of joint compound over it, let dry per product, then proceed.`, `Start with 120 grit. Knock down any scraper marks or paint residue.`, `LIGHT pressure — weight of the sander only. Pushing dishes out swirl marks.`, `Keep the sander FLAT against the wall — tilting digs gouges.`, `Overlapping passes, ~50% overlap. Move steady, don't park in one spot.`, `Switch to 150 grit. Sand until 120 grit scratches disappear.`, `Finish with 180 grit. This is your primer-ready surface.`, `STOP at 220 max — going finer leaves the wall too slick for primer to grip.`, `Hand-sand corners and edges with a 180 grit sanding sponge.`, `Vacuum the wall thoroughly. Then wipe with damp (not wet) microfiber.`, `Run your hand over the surface — should feel like smooth paper. Any rough spots, hit them again.`],
    tips: [`120 grit discs load up fast if there's any paint residue. Change them often — a loaded disc just polishes.`, `Random-orbital action (vs. just orbital) is what avoids swirl marks. Make sure your sander is the random-orbital kind, not a basic palm sander.`, `If you see swirl marks under raking light, it means too much pressure or a tilted pad. Lighter touch, flatter pad.`],
  } },

  { key: "t12", num: "12", title: "Primer coat 1 (walls + trim)", phase: "2. Prime", hrs: "2h", who: "tom", detail: "Frames must be fully stripped + sanded first.", guide: {
    tools: [`2.5" angled sash brush (Purdy XL or Wooster Shortcut)`, `9" roller frame`, `9" roller cover, 3/8" nap (smooth-medium walls)`, `Paint tray + liners`, `Painter's tape`, `Drop cloths`, `Stir stick`],
    materials: [`Stain-blocking primer — Zinsser Bulls Eye 1-2-3 (water-based) OR Kilz Premium. ~1 gal for walls + trim.`, `Rags`],
    safety: [`Ventilate the room — open window, run fan`],
    steps: [`Tape outlets, windows, and anywhere you want clean edges`, `Stir primer thoroughly — no need to shake`, `Pour into tray; load roller about 1/3 way up roller`, `Cut in first with brush: 3" border around all edges (ceiling, baseboard, corners, around frames)`, `Roll walls in 3-foot W or N pattern, then fill in without re-loading`, `Brush trim and frames with smooth long strokes, with the grain`, `Let dry per label — typically 1 hr to recoat, 24 hr full cure`, `Inspect for thin spots before recoat — primer should look uniform`],
    tips: [`3/8" nap roller gives a fine finish on smooth walls. Use 1/2" nap if walls are textured.`, `Cut in and roll the same wall within 10–15 min — wet-edge prevents lap marks.`, `Brushes: spend the money on Purdy. Cheap brushes shed bristles into your primer.`],
  } },
  { key: "t13", num: "13", title: "Primer coat 2", phase: "2. Prime", hrs: "2h", who: "tom", guide: {
    steps: [`Wait recoat time per label (usually 1–4 hr)`, `Same technique as coat 1`, `After this coat: walls should look opaque, even, no visible old color or stains showing through`, `Full cure 24 hr before finish paint`],
  } },

  { key: "t14", num: "14", title: "Remove 12x12 tile + dispose", phase: "3. Floor", hrs: "2h", who: "friends", detail: "Down to the plywood underlayment.", guide: {
    tools: [`Long-handle floor scraper (4" or 6" wide)`, `Pry bar`, `Hammer`, `Utility knife (to score grout)`, `Heavy-duty contractor bags or a bin`],
    materials: [`Spray bottle of water`, `N95 mask`, `Gloves`, `Eye protection`, `Knee pads`],
    safety: [`Tile chips are sharp — eye protection mandatory`, `Mist with water to suppress dust — don't dry-grind`],
    steps: [`If tiles are grouted, score grout lines with utility knife`, `Pick a corner. Wedge pry bar under first tile and pop it up — sometimes a hammer tap on the bar helps`, `Once one is up, slide floor scraper underneath the next one at low angle and lever it up`, `Mist with water as you go — keeps dust down AND protects the linoleum below`, `DON'T scrape into the layer below — leave the linoleum intact for the asbestos test`, `Bag tiles in contractor bags. Double-bag if heavy — they tear easily.`, `Tile is heavy; ~1 sq ft of ceramic = 4 lb. Don't overfill bags.`],
    tips: [`If tiles refuse to budge, the mastic is gripping hard. Apply gentle heat with a heat gun on a stuck tile for a few seconds to soften the mastic.`, `Friends with two pry bars working from opposite corners is faster than one person.`],
  } },
  { key: "t15", num: "15", title: "Pull plywood + nails, cut to strips, dispose", phase: "3. Floor", hrs: "2h", who: "friends", guide: {
    tools: [`Reciprocating saw (sawzall) with wood demo blade OR circular saw set to plywood depth`, `Pry bar`, `Hammer`, `Cat's paw or nail puller`, `Drill (to back out screws if any)`, `Heavy bags`],
    safety: [`Eye protection — flying nails`, `Ear protection if using saw`, `Gloves — splinters everywhere`, `Watch your saw depth: set to plywood thickness ONLY to avoid cutting linoleum below`],
    steps: [`First, pull any obviously exposed staples or nails with cat's paw`, `Measure plywood thickness (usually 1/4" or 1/2")`, `Set saw depth = plywood thickness + 1/16" (no more)`, `Score plywood into ~2×3' strips (long cuts with grain)`, `Pry up each strip — pry bar under one edge, lift`, `Pull/clip any remaining nails or fasteners as you go`, `Cut larger pieces into strips that fit your disposal bin`, `Bag nails separately — they puncture trash bags`],
    tips: [`Oscillating multi-tool with wood blade is great for tight spots near cabinets — slower but precise.`, `DON'T cut into the linoleum below the plywood — you want it intact for sampling.`],
  } },
  { key: "t16a", num: "16a", title: "Cut + bag asbestos sample from exposed linoleum", phase: "3. Floor", hrs: "15m", who: "tom", guide: {
    tools: [`Sharp utility knife (new blade)`, `Spray bottle of water (heavy mist setting)`, `Two zip-top bags (gallon size)`, `Sharpie`, `Masking tape`],
    materials: [`P100 respirator`, `Nitrile gloves`, `Eye protection`, `Disposable rag`],
    safety: [`Treat the linoleum as asbestos-containing UNTIL the lab says otherwise.`, `Mist heavily before cutting — wet fibers don't aerosolize.`, `Don't sweep, scrape, or sand the sample area.`, `Bag the knife blade with the sample if it touched mastic.`],
    steps: [`Pick an inconspicuous spot — ideally under where the new floor will start (corner or against wall)`, `Mist the area heavily with water until visibly saturated`, `Score a ~1" × 1" square with utility knife`, `Pry up the sample with the knife tip — get a piece that includes BOTH linoleum and mastic underneath`, `Drop sample into first zip bag, press out air, seal`, `Place sealed bag inside second zip bag, seal again`, `Label outer bag with: today's date, your name, address, sample location (e.g., 'kitchen, NW corner')`, `Wipe the sampled area lightly with damp rag; bag rag with debris`, `Disinfect any tools that touched mastic`],
    tips: [`Mail-in labs: search 'mail-in asbestos test' — EMSL, ESS Labs, others. Typical cost $40–80, results 3–5 business days.`, `Many labs accept walk-in samples too if you're near one.`],
  } },
  { key: "t16b", num: "16b", title: "Ship asbestos sample to lab", phase: "3. Floor", hrs: "15m", who: "tom", guide: {
    steps: [`Download/print the lab's chain-of-custody form from their website`, `Fill out: sample location, date, your contact info`, `Place sample bag in padded envelope (bubble mailer)`, `Ship USPS Priority or overnight per lab's preference — usually $10–30`, `Save tracking number`, `Results typically emailed in 3–5 business days`],
  } },
  { key: "t17", num: "17", title: "Scrape linoleum + mastic (only if test NEGATIVE)", phase: "3. Floor", hrs: "4h", who: "friends", guide: {
    tools: [`Long-handle floor scraper`, `Plastic putty knives`, `Scrub pads`, `Bucket + rags`],
    materials: [`Mastic remover (Sentinel 626, BlueBear 500MR, or similar — water-based safer than solvent)`, `P100 respirator`, `Nitrile gloves`, `Eye protection`],
    safety: [`STOP HERE IF ASBESTOS TEST CAME BACK POSITIVE. Do not DIY. Hire a licensed abatement contractor.`, `Even with negative test, ventilate the room — mastic remover fumes.`],
    steps: [`Score linoleum into manageable strips with utility knife`, `Pry up strips with floor scraper — easier now that tile and plywood are gone`, `After linoleum is up, mastic remains as a sticky residue`, `Apply mastic remover per label — usually liberal coat`, `Let dwell per product (often 30 min to 2 hr)`, `Scrape with floor scraper — should come off in goopy strings`, `Repeat on stubborn spots`, `Final wipe with water + clean rags`, `Let subfloor dry fully (overnight) before subfloor prep`],
    tips: [`Heat gun on stubborn mastic can help, but raises asbestos concern even on negative tests if any particles get airborne. Stick with chemical remover.`, `Skip the mastic remover for small patches you can scrape dry — but most floors need it.`],
  } },
  { key: "t18", num: "18", title: "Prep subfloor", phase: "3. Floor", hrs: "2h", who: "tom", guide: {
    tools: [`4-foot level`, `Drill/driver`, `Pry bar`, `Putty knife`, `Floor scraper`, `Shop vac`],
    materials: [`Deck screws (1-5/8" for sheathing into joists, 2-1/2" for heavier patches)`, `Floor patch compound (Henry 547) for small dips`, `Self-leveling underlayment if dips are larger than 1/4"`],
    steps: [`Walk the subfloor — listen for squeaks`, `At each squeak, locate the joist with stud finder and drive a 2-1/2" deck screw through subfloor into joist`, `Inspect for rot or soft spots — cut out and replace if found`, `Lay 4-foot level across floor in multiple directions; mark dips and high spots`, `Small dips (< 1/4"): patch with floor patch using wide putty knife`, `Larger dips: pour self-leveling underlayment (read label carefully — most need primer first)`, `Let patch/leveler cure per product (often 24h for self-leveler)`, `Vacuum + damp wipe before flooring goes down`],
  } },
  { key: "t19a", num: "19a", title: "Floor install — underlayment + start laying", phase: "3. Floor", hrs: "2h", who: "tom", detail: "Specific steps depend on floor type. Assuming LVP click-lock (most common DIY).", guide: {
    tools: [`Tapping block`, `Pull bar`, `Rubber mallet`, `Miter saw or circular saw (fine-tooth blade for laminate/LVP)`, `Utility knife (LVP only)`, `Speed square`, `1/4" spacers`, `Tape measure`, `Pencil`],
    materials: [`LVP planks (buy 10% extra for waste/mistakes)`, `Underlayment if planks don't have it pre-attached (rolled foam typical)`, `Transition strips for doorways`],
    steps: [`Acclimate planks 48 hr in the room before install (most labels require this)`, `Vacuum subfloor one more time`, `Roll out underlayment if needed, butt seams (don't overlap), tape if label says`, `Pick longest wall as start. Measure room width to figure how wide the last row will be — if it'd be < 2", trim the first row narrower so last row isn't a sliver`, `Place 1/4" spacers along start wall (LVP needs expansion gap)`, `Lock first plank's long edge to spacer, square it up`, `Lock second plank to first (short-edge tap with tapping block)`, `Continue across the row`, `Cut last plank to length with miter saw — use cut piece to start row 2 IF it's > 8" (offset rule)`],
  } },
  { key: "t19b", num: "19b", title: "Floor install — continue", phase: "3. Floor", hrs: "2h", who: "tom", guide: {
    steps: [`Stagger end joints by at least 8" row to row — anything closer looks bad and weakens lock`, `Cut around obstructions (doorways, vents, cabinets) with utility knife — score and snap`, `Use pull bar for the last plank in each row — tapping block won't fit against wall`, `Check progress with a level every few rows`],
  } },
  { key: "t19c", num: "19c", title: "Floor install — finish + thresholds", phase: "3. Floor", hrs: "2h", who: "tom", guide: {
    steps: [`Cut final row plank widths to fit, allowing 1/4" expansion gap`, `Remove all spacers`, `Install transition strips at doorways — screw or adhesive per kit`, `Reinstall baseboard or quarter-round to cover the expansion gap`, `Vacuum, then walk every plank — no squeaks or loose ends`, `Cover floor with rosin paper before any more work happens in the room`],
  } },

  { key: "t20", num: "20", title: "Finish paint coat 1 (BEFORE floor install)", phase: "4. Finish Paint", hrs: "2h", who: "tom", guide: {
    tools: [`2.5" angled sash brush`, `9" roller frame + 3/8" nap cover`, `Extension pole`, `Paint tray + liner`, `Drop cloths over subfloor`, `Painter's tape`],
    materials: [`Finish paint — eggshell or satin for a kitchen (easier to wipe down than flat)`, `Stir stick`],
    steps: [`Lay drop cloths over the entire subfloor — no exceptions`, `Tape edges where finish ends (countertops, switches, ceiling line if you're not painting it)`, `Stir paint thoroughly`, `Cut in: 3" brushed border around all edges, corners, around trim`, `Roll walls within 10–15 min of cut-in (wet-edge prevents lap marks)`, `3-foot W or N pattern, then fill in`, `Brush trim with long smooth strokes`, `Let cure per label — typically 4h touch, 24h recoat`],
    tips: [`Eggshell strikes the right balance: enough sheen to clean grease, not so much it shows every flaw.`, `Two thin coats > one thick coat. Always.`],
  } },
  { key: "t21", num: "21", title: "Finish paint coat 2", phase: "4. Finish Paint", hrs: "2h", who: "tom", guide: {
    steps: [`Wait recoat time per label`, `Same technique as coat 1`, `AFTER drying: pull tape at a 45° angle while paint is just dry to touch — avoids tear-off`, `Inspect with raking light (low-angle lamp) for missed spots, lap marks, drips`],
  } },

  { key: "t22", num: "22", title: "CordMate run — measure, cut, mount over door header", phase: "5. Move-in", hrs: "2h", who: "tom", guide: {
    tools: [`Tape measure`, `Pencil`, `Level (2 ft)`, `Miter saw or hacksaw + miter box`, `Drill`, `Painter's tape`],
    materials: [`Wiremold CordMate II kit (cover channel + corners + end caps)`, `14/3 SJT appliance cord rated for the appliance amps`, `Adhesive strips OR mounting screws (in kit)`],
    steps: [`Plan the path: outlet → up the wall → over the door header → down to appliance`, `Measure each segment`, `Hold a piece of CordMate against the wall, use level to mark straight lines`, `Cut channel pieces with miter saw — 45° miters at outside corners (or use included corner caps)`, `Test-fit before mounting`, `Mount channel with adhesive backing (peel + press) or screws if label suggests`, `Run the cord inside the channel`, `Snap on cover plates`, `Optional: paint cover to match trim (Krylon Fusion sticks to plastic — light coats)`],
    tips: [`The outside corner caps look cleaner than miter-cut joints — use them where possible.`, `Don't overload — keep the appliance's combined amps well under the source circuit's rating.`],
  } },
  { key: "t23", num: "23", title: "Hang stainless steel shelves", phase: "5. Move-in", hrs: "2h", who: "friends", guide: {
    tools: [`Stud finder (with deep-scan if walls are thick)`, `Drill/driver`, `Level (2 ft)`, `Pencil`, `Tape measure`],
    materials: [`Shelf brackets + included screws`, `2.5" deck screws for stud mounts`, `Toggle bolts or Snaptoggle anchors (for non-stud locations) rated for shelf load + ~30% safety margin`],
    steps: [`Mark desired shelf height with pencil + level line`, `Run stud finder along that line — mark every stud`, `Align brackets to studs when possible — way stronger`, `Where a bracket can't hit a stud, use toggle bolts (Snaptoggle is the easiest)`, `Drill pilot holes, drive screws into studs OR insert toggles`, `Hang first shelf, level it across`, `Subsequent shelves: measure from first to maintain consistent spacing`, `Test load gently before stocking`],
    tips: [`For heavy items (cans, dishes), every bracket on a stud — don't trust anchors with significant weight.`, `Coordinate placement with the CordMate path so the cord doesn't run behind a shelf you can't access.`],
  } },
  { key: "t24", num: "24", title: "Order dishwasher", phase: "5. Move-in", hrs: "30m", who: "tom", detail: "ORDER DAY 1 — 2–6 wk lead time.", guide: {
    steps: [`Measure cabinet opening: width (standard 24"), depth, height`, `Confirm existing hookups: GFCI outlet location, water supply line, drain location`, `Pick model — check decibel rating (45 dB or less for quiet), tub material (stainless > plastic)`, `Note delivery + haul-away options`, `Save order confirmation + estimated delivery date`],
  } },
  { key: "t25", num: "25", title: `Order 24" gas range`, phase: "5. Move-in", hrs: "30m", who: "tom", guide: {
    steps: [`Measure: 24" wide × depth × height available`, `Confirm gas line size and shutoff valve location behind/under range`, `Confirm 120V outlet location (range needs power for ignition + clock)`, `Pick model — note BTU output, oven capacity, convection or not`, `Confirm hood CFM rating matches range`, `Note cord length needed for your CordMate run — order longer cord separately if standard isn't enough`, `Arrange delivery + haul-away of old unit if any`],
  } },
  { key: "t26", num: "26", title: "Begin moving back in — stock shelves, small appliances", phase: "5. Move-in", hrs: "2h", who: "tom", guide: {
    steps: [`Clean shelves before stocking — adhesive residue, sawdust, anything`, `Stock by use frequency: daily items at eye level, occasional up high or low`, `Reconnect small appliances`, `Hold off on final stocking until appliances arrive — they may move things around`],
  } },
  { key: "t27", num: "27", title: "Install dishwasher + range when delivered", phase: "5. Move-in", hrs: "2h", who: "tom", guide: {
    tools: [`Adjustable wrench`, `Pipe wrench (for gas)`, `Level`, `Screwdriver`, `Small flashlight`],
    materials: [`NEW flexible gas connector (never reuse the old one)`, `Gas-rated yellow PTFE tape OR pipe dope (not standard white tape)`, `Soapy water in a spray bottle (leak detection)`],
    safety: [`Gas connection: if you smell gas after installing, shut off main valve immediately. Open windows. Don't use any electrical switch — the spark can ignite gas.`, `If unsure on gas: have the gas company or a plumber pressure-test the connection.`],
    steps: [`RANGE: Close gas shutoff valve fully`, `Slide range in partway — easier to access the gas line`, `Connect new flex gas connector — yellow tape on threads (3 wraps, clockwise)`, `Tighten connector — snug, then 1/4 turn more. Don't overtighten.`, `Plug range into 120V outlet via CordMate path`, `Open gas valve SLOWLY`, `Spray every gas connection with soapy water — bubbles = leak. Tighten and re-test.`, `Slide range fully into position; level with adjustable feet`, `Test all burners + oven`, `DISHWASHER: Close water supply valve`, `Connect water supply line (compression fitting — hand tight + 1/4 turn)`, `Connect drain line with high loop (per local code — prevents backflow)`, `Plug into existing GFCI`, `Open water valve slowly; check for drips`, `Level dishwasher (back legs adjust separately from front)`, `Anchor to underside of counter (per included brackets)`, `Run empty test cycle — listen for leaks, watch for proper drain`],
  } },
];

type Day = {
  date: string;
  dateISO?: string;
  label?: string;
  weekend?: boolean;
  rest?: boolean;
  restNote?: string;
  items?: string[];
  why?: string;
};
const SCHEDULE: ({ week: string } | Day)[] = [
  { week: "Week 1 — Cleanup, frame strip cycles, floor demo, asbestos sample" },
  { date: "Sun May 17", dateISO: "2026-05-17", label: "Sunday · friends", weekend: true, items: ["t9", "t10", "t11", "t2-scrape1", "t3-scrape1", "t14", "t15", "t16a", "t24", "t25"], why: "Friends pull the floor while you do streak remediation + frame scraping. Bag sample + place orders tonight." },
  { date: "Mon May 18", dateISO: "2026-05-18", label: "Monday", items: ["t16b", "t2-extra", "t3-extra"], why: "Ship the sample (clock starts). Apply another stripper coat to whichever frame still has paint." },
  { date: "Tue May 19", dateISO: "2026-05-19", label: "Tuesday", items: ["t2-final", "t3-final"], why: "After ~24h dwell: final scrape, neutralize, light sand on both frames. Asbestos lab Day 1." },
  { date: "Wed May 20", dateISO: "2026-05-20", label: "Wednesday", items: ["t12"], why: "Frames are done — primer coat 1 (walls + trim together)." },
  { date: "Thu May 21", dateISO: "2026-05-21", label: "Thursday · rest", rest: true, restNote: "Primer curing. Asbestos lab Day 3." },
  { date: "Fri May 22", dateISO: "2026-05-22", label: "Friday", items: ["t13"], why: "Primer coat 2. Lab results may land today." },
  { week: "Week 2 — Asbestos result, lino scrape, paint 1, paint 2" },
  { date: "Sat May 23", dateISO: "2026-05-23", label: "Saturday · friends", weekend: true, items: ["t17", "t18"], why: "Lab result day. NEGATIVE → scrape lino + mastic, prep subfloor. POSITIVE → STOP floor work; spend day on stud marking + abatement quotes." },
  { date: "Sun May 24", dateISO: "2026-05-24", label: "Sunday · rest", rest: true, restNote: "Primer fully cured. Floor area settling." },
  { date: "Mon May 25", dateISO: "2026-05-25", label: "Monday", items: ["t20"], why: "Finish paint coat 1. Drop cloths over exposed subfloor." },
  { date: "Tue May 26", dateISO: "2026-05-26", label: "Tuesday · rest", rest: true, restNote: "Paint curing." },
  { date: "Wed May 27", dateISO: "2026-05-27", label: "Wednesday", items: ["t21"], why: "Finish paint coat 2 — walls DONE." },
  { date: "Thu May 28", dateISO: "2026-05-28", label: "Thursday", items: ["t19a"], why: "Begin flooring. Tape baseboards to protect paint." },
  { date: "Fri May 29", dateISO: "2026-05-29", label: "Friday", items: ["t19b"], why: "Keep laying floor." },
  { week: "Week 3 — Floor finish + fixtures + move in" },
  { date: "Sat May 30", dateISO: "2026-05-30", label: "Saturday · friends", weekend: true, items: ["t19c", "t22", "t23"], why: "Floor finishes, CordMate up, shelves hung. Friends speed everything up." },
  { date: "Sun May 31", dateISO: "2026-05-31", label: "Sunday · friends", weekend: true, items: ["t26"], why: "Stock shelves + move back in." },
  { date: "On arrival", dateISO: "9999-12-31", label: "When delivered", items: ["t27"], why: "Slot appliances in once they ship." },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = drizzle(neon(url), { schema, casing: "snake_case" });

  // Ensure an owner user row exists (Google login links to it by email).
  let [owner] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, SEED_OWNER_EMAIL));
  if (!owner) {
    [owner] = await db
      .insert(schema.users)
      .values({ email: SEED_OWNER_EMAIL, name: "Tom" })
      .returning();
    console.log(`Created owner user ${SEED_OWNER_EMAIL}`);
  }

  // Clean reseed: drop any existing "Kitchen Renovation" for this owner.
  const existing = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.ownerId, owner.id),
        eq(schema.projects.title, "Kitchen Renovation"),
      ),
    );
  for (const p of existing) {
    await db.delete(schema.projects).where(eq(schema.projects.id, p.id));
  }

  const [project] = await db
    .insert(schema.projects)
    .values({
      ownerId: owner.id,
      title: "Kitchen Renovation",
      summary: "Full DIY gut + refinish — walls, frames, floor, fixtures.",
    })
    .returning();

  // Phases (unique, first-seen order).
  const phaseOrder: string[] = [];
  for (const it of ITEMS)
    if (!phaseOrder.includes(it.phase)) phaseOrder.push(it.phase);
  const phaseIdByName = new Map<string, string>();
  for (let i = 0; i < phaseOrder.length; i++) {
    const [ph] = await db
      .insert(schema.phases)
      .values({ projectId: project.id, name: phaseOrder[i], position: i })
      .returning();
    phaseIdByName.set(phaseOrder[i], ph.id);
  }

  // Tasks + guides.
  const taskIdByKey = new Map<string, string>();
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i];
    const [t] = await db
      .insert(schema.tasks)
      .values({
        projectId: project.id,
        phaseId: phaseIdByName.get(it.phase) ?? null,
        refKey: it.key,
        num: it.num,
        title: it.title,
        detail: it.detail ?? null,
        hoursEstimate: it.hrs,
        status: it.done
          ? "done"
          : it.inProgress
            ? "in_progress"
            : "todo",
        completedAt: it.done ? new Date() : null,
        assigneeLabel: it.who ?? null,
        highlighted: !!it.isNew,
        position: i,
      })
      .returning();
    taskIdByKey.set(it.key, t.id);
    if (it.guide) {
      await db.insert(schema.taskGuides).values({
        taskId: t.id,
        tools: it.guide.tools ?? [],
        materials: it.guide.materials ?? [],
        safety: it.guide.safety ?? [],
        steps: it.guide.steps ?? [],
        tips: it.guide.tips ?? [],
      });
    }
  }

  // Schedule sections + days + day→task links.
  let sectionId: string | null = null;
  let sectionPos = 0;
  let dayPos = 0;
  for (const entry of SCHEDULE) {
    if ("week" in entry) {
      const [s] = await db
        .insert(schema.scheduleSections)
        .values({
          projectId: project.id,
          title: entry.week,
          position: sectionPos++,
        })
        .returning();
      sectionId = s.id;
      continue;
    }
    const iso =
      entry.dateISO && entry.dateISO !== "9999-12-31"
        ? entry.dateISO
        : null;
    const [d] = await db
      .insert(schema.scheduleDays)
      .values({
        projectId: project.id,
        sectionId,
        label: entry.date,
        dateIso: iso,
        sublabel: entry.label ?? null,
        isWeekend: !!entry.weekend,
        isRest: !!entry.rest,
        restNote: entry.restNote ?? null,
        why: entry.why ?? null,
        position: dayPos++,
      })
      .returning();
    const items = entry.items ?? [];
    for (let k = 0; k < items.length; k++) {
      const taskId = taskIdByKey.get(items[k]);
      if (!taskId) continue;
      await db.insert(schema.scheduleDayTasks).values({
        dayId: d.id,
        taskId,
        position: k,
      });
    }
  }

  console.log(
    `Seeded "Kitchen Renovation" — ${ITEMS.length} tasks, ${phaseOrder.length} phases, owner ${SEED_OWNER_EMAIL}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
