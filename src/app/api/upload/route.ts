import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { getAccess, canWrite } from "@/lib/projects";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Not signed in");

        const { projectId } = JSON.parse(clientPayload ?? "{}") as {
          projectId?: string;
        };
        if (!projectId) throw new Error("Missing project");

        const role = await getAccess(
          projectId,
          session.user.id,
          session.user.email,
        );
        if (!canWrite(role)) throw new Error("Not authorized");

        return {
          allowedContentTypes: ["image/*"],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ projectId }),
        };
      },
      onUploadCompleted: async () => {
        /* DB row is created client-side via registerPhoto after upload() */
      },
    });

    return Response.json(json);
  } catch (error) {
    console.error("[upload] token generation failed:", error);
    return Response.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
