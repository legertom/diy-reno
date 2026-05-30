import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { getAccess } from "@/lib/projects";

/** Phase 5.13 shareable postcard. Landscape editorial render over the
 *  cached dream image with hairline-rule chrome. Designed to be
 *  long-pressed on a phone → Save image → drop in a family text or a
 *  Slack channel.
 *
 *  Same provider story as the cover route: no AI spend; ~200ms CPU per
 *  render; cached an hour at the browser edge. */

export const dynamic = "force-dynamic";

const WIDTH = 1600;
const HEIGHT = 1000;

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
      summary: projects.summary,
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

  const fontsDir = join(
    process.cwd(),
    "node_modules/geist/dist/fonts/geist-sans",
  );
  const [regular, bold] = await Promise.all([
    readFile(join(fontsDir, "Geist-Regular.ttf")),
    readFile(join(fontsDir, "Geist-Bold.ttf")),
  ]);

  const today = new Date();
  const stamp = `${monthShort(today)} ${today.getUTCDate()}, ${today.getUTCFullYear()}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#f3efe6",
          padding: 40,
        }}
      >
        {/* Outer frame */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            border: "1px solid #1a1714",
            padding: 12,
          }}
        >
          {/* Inner hairline */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              border: "1px solid #1a1714",
              flexDirection: "row",
            }}
          >
            {/* Dream image — left two-thirds */}
            <div
              style={{
                width: 960,
                height: "100%",
                position: "relative",
                display: "flex",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={project.dreamImageUrl}
                alt=""
                width={960}
                height={910}
                style={{
                  width: 960,
                  height: 910,
                  objectFit: "cover",
                }}
              />
            </div>

            {/* Right caption column */}
            <div
              style={{
                width: 544,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                padding: "48px 56px",
                color: "#1a1714",
                backgroundColor: "#f3efe6",
              }}
            >
              <div
                style={{
                  fontFamily: "Geist",
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: 6,
                  marginBottom: 14,
                }}
              >
                POSTCARD · {stamp}
              </div>
              <div
                style={{
                  width: 60,
                  height: 1,
                  backgroundColor: "#1a1714",
                  marginBottom: 36,
                }}
              />
              <div
                style={{
                  fontFamily: "Geist",
                  fontWeight: 700,
                  fontSize: 48,
                  lineHeight: 1.1,
                  letterSpacing: -1,
                }}
              >
                Wish you were here.
              </div>
              <div
                style={{
                  fontFamily: "Geist",
                  fontWeight: 400,
                  fontSize: 24,
                  lineHeight: 1.4,
                  marginTop: 28,
                  opacity: 0.85,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span>This is what {project.title.toLowerCase()}</span>
                <span>is on its way to becoming.</span>
              </div>
              {project.summary && (
                <div
                  style={{
                    fontFamily: "Geist",
                    fontWeight: 400,
                    fontSize: 18,
                    lineHeight: 1.5,
                    marginTop: 28,
                    opacity: 0.7,
                  }}
                >
                  {trim(project.summary, 140)}
                </div>
              )}

              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: 1,
                    backgroundColor: "#1a1714",
                    opacity: 0.5,
                    marginBottom: 16,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "Geist",
                    fontWeight: 700,
                    fontSize: 14,
                    letterSpacing: 4,
                  }}
                >
                  <span>— THE FOREMAN</span>
                  <span style={{ opacity: 0.6 }}>DIYRENO.APP</span>
                </div>
              </div>
            </div>
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
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}

function monthShort(d: Date): string {
  return [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ][d.getUTCMonth()];
}

function trim(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
