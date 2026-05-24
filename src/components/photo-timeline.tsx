"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  X,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
  Camera,
  CornerDownRight,
  Loader2,
} from "lucide-react";
import {
  deletePhoto,
  movePhoto,
  updatePhotoMeta,
} from "@/app/actions";
import type { TimelinePhoto } from "@/lib/projects";

type Task = { id: string; num: string; title: string };

/** Calm, non-countdown relative date. Weeks beyond 4 → months; months
 *  beyond 12 → years. "3 weeks ago" only — never a deadline overlay. */
function relativeDate(d: Date | null): string {
  if (!d) return "no date";
  const ms = Date.now() - d.getTime();
  const day = 1000 * 60 * 60 * 24;
  const days = Math.round(ms / day);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.round(days / 7);
    return w === 1 ? "1 week ago" : `${w} weeks ago`;
  }
  if (days < 365) {
    const m = Math.round(days / 30);
    return m === 1 ? "1 month ago" : `${m} months ago`;
  }
  const y = Math.round(days / 365);
  return y === 1 ? "1 year ago" : `${y} years ago`;
}

export function PhotoTimeline({
  projectId,
  photos,
  rooms,
  tasks,
  canWrite,
}: {
  projectId: string;
  photos: TimelinePhoto[];
  rooms: string[];
  tasks: Task[];
  canWrite: boolean;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <>
      <div className="mt-10 grid grid-cols-3 gap-px bg-line-strong sm:grid-cols-4 md:grid-cols-5">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpenIdx(i)}
            className="group relative aspect-square overflow-hidden bg-paper-2"
            aria-label={`Open photo ${i + 1} of ${photos.length}`}
          >
            <Image
              src={p.url}
              alt={p.caption ?? "Project photo"}
              fill
              sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 20vw"
              className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
            {(p.takenAt || p.roomName) && (
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/55 to-transparent p-1.5 text-[10px] font-medium text-white">
                <span className="truncate">
                  {p.roomName ?? ""}
                </span>
                <span className="shrink-0 tabular-nums opacity-80">
                  {relativeDate(p.takenAt ?? p.createdAt)}
                </span>
              </div>
            )}
          </button>
        ))}
      </div>

      {openIdx !== null && (
        <Lightbox
          projectId={projectId}
          photos={photos}
          rooms={rooms}
          tasks={tasks}
          canWrite={canWrite}
          startIdx={openIdx}
          onClose={() => setOpenIdx(null)}
        />
      )}
    </>
  );
}

function Lightbox({
  projectId,
  photos,
  rooms,
  tasks,
  canWrite,
  startIdx,
  onClose,
}: {
  projectId: string;
  photos: TimelinePhoto[];
  rooms: string[];
  tasks: Task[];
  canWrite: boolean;
  startIdx: number;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(startIdx);

  // Scroll to the start index on mount, without animation.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.children[startIdx] as HTMLElement | undefined;
    if (target) el.scrollLeft = target.offsetLeft;
  }, [startIdx]);

  // Update activeIdx as the user swipes.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIdx(idx);
  }, []);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const active = photos[activeIdx];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-80 tabular-nums">
          {activeIdx + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-10 place-items-center rounded-full hover:bg-white/10"
        >
          <X className="size-5" />
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
      >
        {photos.map((p) => (
          <div
            key={p.id}
            className="relative flex h-full w-full shrink-0 snap-center items-center justify-center px-2"
          >
            {/* Direct <img> (not next/image) so we get the full-resolution
                Blob asset and consistent EXIF orientation handling. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={p.caption ?? "Project photo"}
              className="max-h-full max-w-full object-contain"
              style={{ imageOrientation: "from-image" }}
            />
          </div>
        ))}
      </div>

      {active && (
        <LightboxMeta
          key={active.id}
          projectId={projectId}
          photo={active}
          rooms={rooms}
          tasks={tasks}
          canWrite={canWrite}
          onDeleted={() => {
            // Close after delete; the page revalidates on the action.
            onClose();
          }}
        />
      )}
    </div>
  );
}

function LightboxMeta({
  projectId,
  photo,
  rooms,
  tasks,
  canWrite,
  onDeleted,
}: {
  projectId: string;
  photo: TimelinePhoto;
  rooms: string[];
  tasks: Task[];
  canWrite: boolean;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [roomName, setRoomName] = useState(photo.roomName ?? "");
  const [taskId, setTaskId] = useState(photo.taskId ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(
    () =>
      (photo.caption ?? "") !== caption ||
      (photo.roomName ?? "") !== roomName ||
      (photo.taskId ?? "") !== taskId,
    [photo, caption, roomName, taskId],
  );

  const linkedTask = photo.taskId
    ? tasks.find((t) => t.id === photo.taskId)
    : null;

  return (
    <div className="border-t border-white/10 bg-black/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-baseline justify-between gap-3 text-[11px] font-semibold tracking-[0.18em] uppercase opacity-80">
          <span>{relativeDate(photo.takenAt ?? photo.createdAt)}</span>
          {photo.takenAt && (
            <span className="font-normal tracking-normal normal-case opacity-60">
              EXIF · {photo.takenAt.toLocaleDateString()}
            </span>
          )}
        </div>

        {!editing ? (
          <>
            <SafetyOverlay flags={photo.safetyFlags} />
            <p className="min-h-6 text-base">
              {photo.caption ? (
                photo.caption
              ) : photo.captionAi ? (
                <>
                  <span className="mr-2 align-middle text-[10px] font-semibold tracking-[0.16em] uppercase opacity-50">
                    Foreman
                  </span>
                  {photo.captionAi}
                </>
              ) : (
                <span className="opacity-50">
                  {photo.visionCompletedAt
                    ? "No caption"
                    : "Foreman is looking at this…"}
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              {photo.roomName && (
                <span className="rounded-full border border-white/20 px-2.5 py-1">
                  {photo.roomName}
                </span>
              )}
              {linkedTask && (
                <Link
                  href={`/p/${projectId}/t/${linkedTask.id}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2.5 py-1 hover:bg-white/10"
                >
                  <CornerDownRight className="size-3" /> #{linkedTask.num}{" "}
                  {linkedTask.title}
                </Link>
              )}
              {photo.tags?.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] opacity-80"
                >
                  #{t}
                </span>
              ))}
            </div>
            <ROIStrip photo={photo} />

            {canWrite && (
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-[12px] hover:bg-white/10"
                >
                  <Pencil className="size-3" /> Edit
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await movePhoto({ id: photo.id, direction: "up" });
                    })
                  }
                  className="grid size-8 place-items-center rounded-full border border-white/20 hover:bg-white/10 disabled:opacity-50"
                  aria-label="Move earlier in timeline"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await movePhoto({ id: photo.id, direction: "down" });
                    })
                  }
                  className="grid size-8 place-items-center rounded-full border border-white/20 hover:bg-white/10 disabled:opacity-50"
                  aria-label="Move later in timeline"
                >
                  <ChevronDown className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("Delete this photo?")) return;
                    startTransition(async () => {
                      await deletePhoto(photo.id);
                      onDeleted();
                    });
                  }}
                  className="ml-auto grid size-8 place-items-center rounded-full border border-white/20 text-red-300 hover:bg-red-500/20"
                  aria-label="Delete photo"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!dirty) {
                setEditing(false);
                return;
              }
              startTransition(async () => {
                await updatePhotoMeta({
                  id: photo.id,
                  caption,
                  roomName: roomName || null,
                  taskId: taskId || null,
                });
                setEditing(false);
              });
            }}
            className="space-y-3"
          >
            <label className="block">
              <span className="block text-[11px] font-semibold tracking-[0.18em] uppercase opacity-70">
                Caption
              </span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm"
                placeholder="What's this a photo of?"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[11px] font-semibold tracking-[0.18em] uppercase opacity-70">
                  Room
                </span>
                <select
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm"
                >
                  <option value="">— None —</option>
                  {rooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold tracking-[0.18em] uppercase opacity-70">
                  Task
                </span>
                <select
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm"
                >
                  <option value="">— None —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.num} {t.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={pending || !dirty}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-black hover:bg-white/90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditing(false);
                  setCaption(photo.caption ?? "");
                  setRoomName(photo.roomName ?? "");
                  setTaskId(photo.taskId ?? "");
                }}
                className="rounded-full border border-white/20 px-3 py-1.5 text-[12px] hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** "Stop, call a pro" overlay — the most important Foreman voice
 *  surface in the lightbox. Quiet but firm. Only renders the highest-
 *  severity flag in the row to avoid panic. */
function SafetyOverlay({
  flags,
}: {
  flags: import("@/lib/photo-vision-types").PhotoSafetyFlag[] | null;
}) {
  if (!flags || flags.length === 0) return null;
  const ordered = [...flags].sort(
    (a, b) =>
      severityWeight(b.severity) - severityWeight(a.severity),
  );
  const top = ordered[0];
  if (top.severity === "info") return null;
  const tone =
    top.severity === "stop"
      ? "border-red-400/60 bg-red-500/15 text-red-100"
      : "border-amber-400/50 bg-amber-500/10 text-amber-100";
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${tone}`}
      role="alert"
    >
      <span className="mr-2 align-middle text-[10px] font-semibold tracking-[0.16em] uppercase opacity-80">
        {top.severity === "stop" ? "Stop · call a pro" : "Heads up"}
        {" · "}
        {top.kind}
      </span>
      <span>{top.detail}</span>
      {top.recommendation && (
        <span className="mt-1 block text-[12px] opacity-90">
          {top.recommendation}
        </span>
      )}
    </div>
  );
}

function severityWeight(s: "info" | "warn" | "stop"): number {
  return s === "stop" ? 3 : s === "warn" ? 2 : 1;
}

/** "Foreman noticed these…" — the 5.4 detail strip. Each ROI is a CSS
 *  object-position crop on the source image (no extra Blob writes). */
function ROIStrip({ photo }: { photo: TimelinePhoto }) {
  if (!photo.rois || photo.rois.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase opacity-60">
        Foreman noticed
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photo.rois.map((roi) => (
          <div
            key={roi.id}
            className="w-32 shrink-0 space-y-1.5"
            title={roi.caption}
          >
            <div
              className="relative aspect-square overflow-hidden rounded-md border border-white/15 bg-white/5"
              style={{
                backgroundImage: `url(${photo.url})`,
                backgroundSize: `${(1 / Math.max(roi.bbox.w, 0.05)) * 100}% ${(1 / Math.max(roi.bbox.h, 0.05)) * 100}%`,
                backgroundPosition: `${(roi.bbox.x / Math.max(1 - roi.bbox.w, 0.05)) * 100}% ${(roi.bbox.y / Math.max(1 - roi.bbox.h, 0.05)) * 100}%`,
                backgroundRepeat: "no-repeat",
              }}
            />
            <div className="text-[10px] leading-snug opacity-80">
              <span className="mr-1 opacity-60">{roi.category}</span>
              {roi.caption}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Reusable camera/upload affordance. Routes through uploadProjectPhoto
 *  (the single chokepoint). Used on the project home, task row, and
 *  anywhere else a "shoot or upload" button is wanted. The `capture`
 *  attribute makes mobile open the camera by default while still allowing
 *  library picks. */
export function PhotoCameraButton({
  projectId,
  taskId = null,
  pathPrefix,
  variant = "button",
  label = "Add photos",
  className,
  ariaLabel,
}: {
  projectId: string;
  taskId?: string | null;
  pathPrefix: string;
  variant?: "button" | "icon";
  label?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const { uploadProjectPhoto } = await import("@/lib/photo-upload");
      for (const file of Array.from(files)) {
        await uploadProjectPhoto({
          file,
          projectId,
          taskId,
          pathPrefix,
        });
      }
    } catch (e) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />
      {variant === "icon" ? (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            inputRef.current?.click();
          }}
          aria-label={ariaLabel ?? label}
          className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-ink-faint transition-colors hover:border-brass hover:text-brass disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Camera className="size-3.5" />
          )}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-60"
        >
          <Camera className="size-4" />
          {busy ? "Uploading…" : label}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
