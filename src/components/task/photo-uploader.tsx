"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { Trash2, Upload, Sparkles, Loader2 } from "lucide-react";
import { registerPhoto, deletePhoto } from "@/app/actions";

type Photo = {
  id: string;
  url: string;
  caption: string | null;
};

export const ATTACH_EVENT = "reno:attach-photo";

export function PhotoUploader({
  projectId,
  taskId,
  photos,
  canWrite,
}: {
  projectId: string;
  taskId: string;
  photos: Photo[];
  canWrite: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const blob = await upload(
          `projects/${projectId}/${taskId}/${file.name}`,
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
        });
      }
    } catch (e) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function askAI(p: Photo) {
    window.dispatchEvent(
      new CustomEvent(ATTACH_EVENT, {
        detail: { url: p.url, caption: p.caption },
      }),
    );
  }

  return (
    <div>
      {canWrite && (
        <div className="mb-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-paper px-4 py-5 text-sm text-ink-soft transition-colors hover:border-brass hover:text-brass disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="size-4" /> Add photos
              </>
            )}
          </button>
          {error && (
            <p className="mt-2 text-xs text-danger">{error}</p>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No photos yet — capture progress for posterity, or upload one and ask
          the expert about it.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-paper-2"
            >
              <Image
                src={p.url}
                alt={p.caption ?? "Renovation photo"}
                fill
                sizes="(max-width: 640px) 33vw, 200px"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => askAI(p)}
                  className="inline-flex items-center gap-1 rounded bg-white/90 px-1.5 py-1 text-[10px] font-medium text-blueprint"
                >
                  <Sparkles className="size-3" /> Ask AI
                </button>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(() => deletePhoto(p.id))
                    }
                    disabled={pending}
                    className="rounded bg-white/90 p-1 text-danger"
                    aria-label="Delete photo"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
