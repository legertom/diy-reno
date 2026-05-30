import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { getAccess } from "@/lib/projects";

/** Phase 5.13 magazine cover. Server-rendered editorial composition
 *  over the cached dream-hero image — real text via Satori (not
 *  hallucinated pixels), zero new AI spend. Endpoint shape mirrors
 *  Next.js's recommended OG image route pattern; the resulting PNG is
 *  what the picks page `<img>`s and what Tom long-presses to share.
 *
 *  Cost discipline: no AI call. ~200ms CPU per render; browser caches
 *  for an hour via the response header below. */

export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 1600;

const MONTHS = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

function monthLabel(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await ctx.params;

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Not signed in", { status: 401 });
  }
  const role = await getAccess(projectId, session.user.id, session.user.email);
  if (!role) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getDb();
  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      dreamImageUrl: projects.dreamImageUrl,
    })
    .from(projects)
    .where(eq(projects.id, projectId));

  if (!project) return new Response("Not found", { status: 404 });
  if (!project.dreamImageUrl) {
    return new Response("No dream image yet — generate one first", {
      status: 409,
    });
  }

  // Load the editorial typeface from node_modules. Geist is the locked
  // family per Phase 3; using the same face here keeps the cover on-
  // brand instead of falling back to Satori's default Inter.
  const fontsDir = join(
    process.cwd(),
    "node_modules/geist/dist/fonts/geist-sans",
  );
  const [regular, bold] = await Promise.all([
    readFile(join(fontsDir, "Geist-Regular.ttf")),
    readFile(join(fontsDir, "Geist-Bold.ttf")),
  ]);

  const month = monthLabel(new Date());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#1a1714",
        }}
      >
        {/* Full-bleed dream image as the cover photograph. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={project.dreamImageUrl}
          alt=""
          width={WIDTH}
          height={HEIGHT}
          style={{
            position: "absolute",
            inset: 0,
            width: WIDTH,
            height: HEIGHT,
            objectFit: "cover",
          }}
        />

        {/* Top gradient for masthead legibility. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 220,
            display: "flex",
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Bottom gradient for headline legibility. */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 560,
            display: "flex",
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
          }}
        />

        {/* Masthead */}
        <div
          style={{
            position: "absolute",
            top: 60,
            left: 64,
            right: 64,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#f3efe6",
          }}
        >
          <div
            style={{
              fontFamily: "Geist",
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: 6,
            }}
          >
            DIY RENO
          </div>
          <div
            style={{
              fontFamily: "Geist",
              fontWeight: 400,
              fontSize: 18,
              letterSpacing: 4,
              opacity: 0.85,
            }}
          >
            CRAFT JOURNAL · {month}
          </div>
        </div>

        {/* Hairline under masthead */}
        <div
          style={{
            position: "absolute",
            top: 108,
            left: 64,
            right: 64,
            height: 1,
            backgroundColor: "rgba(243,239,230,0.4)",
          }}
        />

        {/* Headline block */}
        <div
          style={{
            position: "absolute",
            bottom: 140,
            left: 64,
            right: 64,
            display: "flex",
            flexDirection: "column",
            color: "#f3efe6",
          }}
        >
          <div
            style={{
              fontFamily: "Geist",
              fontWeight: 400,
              fontSize: 22,
              letterSpacing: 6,
              opacity: 0.9,
              marginBottom: 18,
            }}
          >
            THE COVER
          </div>
          <div
            style={{
              fontFamily: "Geist",
              fontWeight: 700,
              fontSize: 96,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {project.title}
          </div>
          <div
            style={{
              fontFamily: "Geist",
              fontWeight: 400,
              fontSize: 28,
              lineHeight: 1.3,
              opacity: 0.85,
              marginTop: 28,
              maxWidth: 880,
            }}
          >
            As the Foreman sees it taking shape — one tile prep day at a time.
          </div>
        </div>

        {/* Bottom hairline + month sigil */}
        <div
          style={{
            position: "absolute",
            bottom: 64,
            left: 64,
            right: 64,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#f3efe6",
          }}
        >
          <div
            style={{
              fontFamily: "Geist",
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: 4,
              opacity: 0.85,
            }}
          >
            No. {pad2(new Date().getUTCMonth() + 1)} · {new Date().getUTCFullYear()}
          </div>
          <div
            style={{
              fontFamily: "Geist",
              fontWeight: 400,
              fontSize: 16,
              letterSpacing: 4,
              opacity: 0.7,
            }}
          >
            DIYRENO.APP
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: [
        {
          name: "Geist",
          data: new Uint8Array(regular).buffer as ArrayBuffer,
          weight: 400,
          style: "normal",
        },
        {
          name: "Geist",
          data: new Uint8Array(bold).buffer as ArrayBuffer,
          weight: 700,
          style: "normal",
        },
      ],
      headers: {
        // Re-render once per hour at most; same dream → same cover.
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
