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
  Home,
  MessageSquare,
  Plus,
  Check,
  Palette,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import {
  createTaskFromPhoto,
  deletePhoto,
  extractPhotoPalette,
  movePhoto,
  previewPaint,
  setHeroShot,
  updatePhotoMeta,
  type PreviewPaintResult,
} from "@/app/actions";
import type { TimelinePhoto } from "@/lib/projects";
import { OPEN_FOREMAN_EVENT } from "@/components/foreman-bubble";

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
  heroShotPhotoId,
}: {
  projectId: string;
  photos: TimelinePhoto[];
  rooms: string[];
  tasks: Task[];
  canWrite: boolean;
  heroShotPhotoId: string | null;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [safetyOnly, setSafetyOnly] = useState(false);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of photos) {
      for (const t of p.tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [photos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return photos.filter((p) => {
      if (roomFilter && p.roomName !== roomFilter) return false;
      if (tagFilter && !p.tags?.includes(tagFilter)) return false;
      if (
        safetyOnly &&
        !(p.safetyFlags ?? []).some(
          (f) => f.severity === "warn" || f.severity === "stop",
        )
      )
        return false;
      if (!q) return true;
      const haystacks = [
        p.caption,
        p.captionAi,
        p.roomName,
        ...(p.tags ?? []),
        ...(p.rois ?? []).map((r) => r.caption),
        p.taskTitle,
      ];
      return haystacks.some(
        (h) => typeof h === "string" && h.toLowerCase().includes(q),
      );
    });
  }, [photos, search, roomFilter, tagFilter, safetyOnly]);

  return (
    <>
      <div className="mt-8 space-y-3 px-5 sm:px-8">
        <input
          type="search"
          placeholder="Search captions, tags, rooms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-full border border-line-strong bg-paper px-4 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
        />
        <div className="flex flex-wrap gap-1.5">
          {rooms.map((r) => (
            <FilterChip
              key={r}
              label={r}
              active={roomFilter === r}
              onClick={() => setRoomFilter(roomFilter === r ? null : r)}
            />
          ))}
          {allTags.map((t) => (
            <FilterChip
              key={t}
              label={`#${t}`}
              active={tagFilter === t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            />
          ))}
          <FilterChip
            label="Safety"
            tone="warn"
            active={safetyOnly}
            onClick={() => setSafetyOnly((s) => !s)}
          />
          {(roomFilter || tagFilter || safetyOnly || search) && (
            <button
              type="button"
              onClick={() => {
                setRoomFilter(null);
                setTagFilter(null);
                setSafetyOnly(false);
                setSearch("");
              }}
              className="ml-1 text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
        {filtered.length !== photos.length && (
          <p className="text-[11px] font-semibold tracking-[0.16em] text-ink-faint uppercase">
            {filtered.length} of {photos.length}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-px bg-line-strong sm:grid-cols-4 md:grid-cols-5">
        {filtered.map((p, i) => (
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
          photos={filtered}
          rooms={rooms}
          tasks={tasks}
          canWrite={canWrite}
          heroShotPhotoId={heroShotPhotoId}
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
  heroShotPhotoId,
  startIdx,
  onClose,
}: {
  projectId: string;
  photos: TimelinePhoto[];
  rooms: string[];
  tasks: Task[];
  canWrite: boolean;
  heroShotPhotoId: string | null;
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
          isHeroShot={active.id === heroShotPhotoId}
          onDeleted={() => {
            onClose();
          }}
          onAskForeman={() => {
            // Close the lightbox FIRST (it covers the viewport at z-50, so
            // the bubble would be hidden behind it), then dispatch a single
            // event carrying the projectId + attachment so there's no
            // mount-vs-listener race.
            onClose();
            window.dispatchEvent(
              new CustomEvent(OPEN_FOREMAN_EVENT, {
                detail: {
                  projectId,
                  attach: {
                    url: active.url,
                  },
                },
              }),
            );
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
  isHeroShot,
  onDeleted,
  onAskForeman,
}: {
  projectId: string;
  photo: TimelinePhoto;
  rooms: string[];
  tasks: Task[];
  canWrite: boolean;
  isHeroShot: boolean;
  onDeleted: () => void;
  onAskForeman: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [roomName, setRoomName] = useState(photo.roomName ?? "");
  const [taskId, setTaskId] = useState(photo.taskId ?? "");
  const [pending, startTransition] = useTransition();
  const [palette, setPalette] = useState<
    | {
        hex: string;
        name: string;
        surface?: string;
        matches: { brand: string; url: string }[];
      }[]
    | null
  >(null);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [paletteError, setPaletteError] = useState<string | null>(null);

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
            <ROIStrip
              projectId={projectId}
              photo={photo}
              canWrite={canWrite}
            />
            {paletteError && (
              <p className="text-xs text-red-300">{paletteError}</p>
            )}
            {palette && palette.length > 0 && (
              <PalettePanel palette={palette} />
            )}
            {palette && palette.length === 0 && (
              <p className="text-xs opacity-60">
                The Foreman didn&apos;t find anything worth matching here.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onAskForeman}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-black hover:bg-white/90"
              >
                <MessageSquare className="size-3" /> Ask the Foreman
              </button>
              <button
                type="button"
                disabled={paletteLoading}
                onClick={async () => {
                  setPaletteError(null);
                  setPaletteLoading(true);
                  try {
                    const result = await extractPhotoPalette({
                      projectId,
                      photoId: photo.id,
                    });
                    setPalette(result?.colors ?? []);
                  } catch (e) {
                    setPaletteError(
                      (e as Error).message || "Could not extract colors",
                    );
                  } finally {
                    setPaletteLoading(false);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-[12px] hover:bg-white/10 disabled:opacity-50"
              >
                {paletteLoading ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Palette className="size-3" />
                )}{" "}
                {palette ? "Refresh colors" : "Match this color"}
              </button>
              {canWrite && (
                <>
                  <PaintPreviewButton photoId={photo.id} />
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
                        await setHeroShot({
                          projectId,
                          photoId: isHeroShot ? null : photo.id,
                        });
                      })
                    }
                    className={
                      isHeroShot
                        ? "inline-flex items-center gap-1 rounded-full border border-brass/60 bg-brass/15 px-3 py-1.5 text-[12px] text-brass hover:bg-brass/25 disabled:opacity-50"
                        : "inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-[12px] hover:bg-white/10 disabled:opacity-50"
                    }
                    aria-pressed={isHeroShot}
                    title={
                      isHeroShot
                        ? "Currently today's view on the home screen"
                        : "Show this on the home screen as today's view"
                    }
                  >
                    <Home className="size-3" />
                    {isHeroShot ? "Today's view" : "Set as today's view"}
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
                </>
              )}
            </div>
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

/** Phase 5.11 v0 "Try this in your room" entrypoint. Sparkles-icon-gated,
 *  canWrite-only — never default. Opens an inline panel of preset paint
 *  colors plus a freeform hex input. Server cap is 5/day per user; the
 *  panel surfaces remaining renders right above the swatches so the user
 *  always knows what they have left. Cached previews (same color, same
 *  photo) don't count toward the cap. */
const PAINT_PRESETS: { hex: string; name: string }[] = [
  { hex: "#f3efe6", name: "Soft white" },
  { hex: "#e6dec9", name: "Warm cream" },
  { hex: "#c7c0ad", name: "Stone" },
  { hex: "#9aa999", name: "Sage" },
  { hex: "#7d8d96", name: "Slate blue" },
  { hex: "#3a4a5a", name: "Hale navy" },
  { hex: "#c69f7b", name: "Warm tan" },
  { hex: "#4a3a35", name: "Espresso" },
];

function PaintPreviewButton({ photoId }: { photoId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PreviewPaintResult | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [hexInput, setHexInput] = useState("");

  async function tryColor(rawColor: string) {
    setChosen(rawColor);
    setPending(true);
    try {
      const r = await previewPaint({ photoId, color: rawColor });
      setResult(r);
    } catch (e) {
      setResult({
        ok: false,
        reason: "bad_color",
        message: (e as Error).message || "Could not render preview",
        spend: result?.spend ?? { used: 0, cap: 5, remaining: 5 },
      });
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setResult(null);
    setChosen(null);
    setHexInput("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={
          open
            ? "inline-flex items-center gap-1 rounded-full border border-brass/60 bg-brass/15 px-3 py-1.5 text-[12px] text-brass hover:bg-brass/25"
            : "inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1.5 text-[12px] hover:bg-white/10"
        }
      >
        <Sparkles className="size-3" />
        Try this in your room
      </button>
      {open && (
        <div className="basis-full rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <PaintCapLine spend={result?.spend ?? null} />
          {result?.ok ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-md border border-white/15 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.url}
                  alt={`Paint preview ${chosen ?? ""}`}
                  className="block max-h-[60vh] w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="opacity-80">
                  Painted{" "}
                  <span className="font-mono">{chosen}</span>
                </span>
                {result.cached && (
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] opacity-70">
                    cached · free
                  </span>
                )}
                <button
                  type="button"
                  onClick={reset}
                  className="ml-auto rounded-full border border-white/20 px-3 py-1 text-[11px] hover:bg-white/10"
                >
                  Try another
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {result && !result.ok && (
                <p
                  className={
                    result.reason === "cap"
                      ? "rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100"
                      : "rounded-md border border-red-400/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-100"
                  }
                  role="alert"
                >
                  {result.message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {PAINT_PRESETS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    disabled={pending}
                    onClick={() => tryColor(c.hex)}
                    className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] hover:bg-white/10 disabled:opacity-50"
                    title={c.hex}
                  >
                    <span
                      className="size-4 rounded-full border border-white/20"
                      style={{ backgroundColor: c.hex }}
                      aria-hidden="true"
                    />
                    {c.name}
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = hexInput.trim();
                  if (v) void tryColor(v);
                }}
              >
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => setHexInput(e.target.value)}
                  placeholder="#7c9474"
                  className="flex-1 rounded-md border border-white/20 bg-white/[0.04] px-2 py-1 text-[12px] font-mono outline-none focus:border-brass"
                  inputMode="text"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={pending || !hexInput.trim()}
                  className="rounded-full border border-white/20 px-3 py-1 text-[11px] hover:bg-white/10 disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    "Try"
                  )}
                </button>
              </form>
              {pending && (
                <p className="text-[11px] opacity-70">
                  <Loader2 className="mr-1 inline size-3 animate-spin" />
                  Painting {chosen}… (~3–5s)
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** "3 of 5 today" line above the swatches. Quiet, informational —
 *  matches the no-pressure UI rule. Hidden until we have a spend snapshot
 *  to avoid flashing "0 of 5" before the first render. */
function PaintCapLine({
  spend,
}: {
  spend: { used: number; cap: number; remaining: number } | null;
}) {
  if (!spend) return null;
  return (
    <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] uppercase opacity-60">
      {spend.used} of {spend.cap} renders today
      {spend.remaining === 0 && " · back tomorrow"}
    </p>
  );
}

function PalettePanel({
  palette,
}: {
  palette: {
    hex: string;
    name: string;
    surface?: string;
    matches: { brand: string; url: string }[];
  }[];
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="mb-2 text-[10px] font-semibold tracking-[0.18em] uppercase opacity-70">
        Match colors at a paint store
      </div>
      <ul className="space-y-3">
        {palette.map((c) => (
          <li key={c.hex} className="flex items-start gap-3">
            <span
              className="mt-0.5 size-10 shrink-0 rounded-md border border-white/20"
              style={{ backgroundColor: c.hex }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{c.name}</span>{" "}
                <span className="ml-1 font-mono text-[11px] opacity-70">
                  {c.hex}
                </span>
                {c.surface && (
                  <span className="ml-2 text-[11px] opacity-60">
                    · {c.surface}
                  </span>
                )}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {c.matches.map((m) => (
                  <a
                    key={m.brand}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] hover:bg-white/10"
                  >
                    {m.brand} <ExternalLink className="size-3" />
                  </a>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "warn";
}) {
  const base =
    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors";
  const warnActive =
    "border-warn bg-warn-tint text-warn";
  const neutralActive = "border-ink bg-ink text-paper";
  const idle =
    "border-line-strong bg-card text-ink-soft hover:border-ink hover:text-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${base} ${
        active ? (tone === "warn" ? warnActive : neutralActive) : idle
      }`}
    >
      {label}
    </button>
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
 *  object-position crop on the source image (no extra Blob writes).
 *  Defect ROIs get a "Make this a task" one-tap action (5.8 photo→task). */
function ROIStrip({
  projectId,
  photo,
  canWrite,
}: {
  projectId: string;
  photo: TimelinePhoto;
  canWrite: boolean;
}) {
  if (!photo.rois || photo.rois.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase opacity-60">
        Foreman noticed
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photo.rois.map((roi) => (
          <ROITile
            key={roi.id}
            projectId={projectId}
            photo={photo}
            roi={roi}
            canWrite={canWrite}
          />
        ))}
      </div>
    </div>
  );
}

function ROITile({
  projectId,
  photo,
  roi,
  canWrite,
}: {
  projectId: string;
  photo: TimelinePhoto;
  roi: import("@/lib/photo-vision-types").PhotoROI;
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ num: string } | null>(null);
  const isDefect = roi.category === "defect";

  return (
    <div className="w-32 shrink-0 space-y-1.5" title={roi.caption}>
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
      {canWrite && isDefect && !created && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const t = await createTaskFromPhoto({
                projectId,
                title: roi.caption,
                photoId: photo.id,
              });
              if (t) setCreated({ num: t.num });
            })
          }
          className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase opacity-90 hover:bg-white/10 disabled:opacity-50"
        >
          <Plus className="size-3" /> Make a task
        </button>
      )}
      {created && (
        <div className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-positive/40 bg-positive/15 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-positive">
          <Check className="size-3" /> Task #{created.num}
        </div>
      )}
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
