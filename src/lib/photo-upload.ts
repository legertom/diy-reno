import { upload } from "@vercel/blob/client";
import { registerPhoto } from "@/app/actions";
import { readPhotoExif } from "@/lib/photo-exif";

/**
 * Upload a photo to Vercel Blob AND register it as a project photo in one
 * call. This is the SINGLE path photos should enter the system.
 *
 * Calling `upload()` from `@vercel/blob/client` directly will leave the
 * photo as a Blob orphan — visible only in whichever surface uploaded it,
 * invisible to the project's photo timeline. We hit that exact leak on
 * 2026-05-24 when the chat uploader bypassed registerPhoto. Any new photo
 * entry point (drag-drop, camera, future surfaces) must come through here.
 */
export async function uploadProjectPhoto(args: {
  file: File;
  projectId: string;
  taskId: string | null;
  /** Subfolder of `projects/<projectId>/` in Blob. e.g. "chat" or a taskId. */
  pathPrefix: string;
  /** Optional room reference (must match a room name on the project's
   *  Property; the UI constrains this). Free-text by design — see
   *  schema.ts photo.roomName note. */
  roomName?: string | null;
}): Promise<{ url: string; pathname: string; mediaType: string }> {
  const { file, projectId, taskId, pathPrefix, roomName } = args;
  const exif = await readPhotoExif(file);
  const blob = await upload(
    `projects/${projectId}/${pathPrefix}/${file.name}`,
    file,
    {
      access: "public",
      handleUploadUrl: "/api/upload",
      clientPayload: JSON.stringify({ projectId }),
    },
  );
  await registerPhoto({
    projectId,
    taskId,
    url: blob.url,
    pathname: blob.pathname,
    takenAt: exif.takenAt,
    orientation: exif.orientation,
    roomName: roomName ?? null,
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
    mediaType: file.type || guessImageMediaType(blob.url),
  };
}

function guessImageMediaType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes(".png")) return "image/png";
  if (u.includes(".webp")) return "image/webp";
  if (u.includes(".gif")) return "image/gif";
  return "image/jpeg";
}
