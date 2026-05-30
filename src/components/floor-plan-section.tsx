"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  Upload,
  Loader2,
  Sparkles,
  Plus,
  Check,
  X,
} from "lucide-react";
import {
  extractRoomsFromFloorPlanAction,
  setPropertyRooms,
  uploadFloorPlan,
} from "@/app/actions";

type Room = { name: string; notes?: string };
type Suggestion = Room & { id: string; accepted: boolean };

/** Phase 5.14 — floor plan upload + owner-confirmed room extraction.
 *  Owner-only by parent gate; the actions themselves also gate. */
export function FloorPlanSection({
  propertyId,
  propertyName,
  floorPlanUrl,
  rooms,
}: {
  propertyId: string;
  propertyName: string;
  floorPlanUrl: string | null;
  rooms: Room[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [savePending, startSave] = useTransition();
  const [keptRooms, setKeptRooms] = useState<Room[]>(rooms);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("propertyId", propertyId);
      fd.set("file", files[0]);
      await uploadFloorPlan(fd);
    } catch (e) {
      setError((e as Error).message || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function findRooms() {
    setExtracting(true);
    setError(null);
    try {
      const result = await extractRoomsFromFloorPlanAction(propertyId);
      const seen = new Set(
        keptRooms.map((r) => r.name.trim().toLowerCase()),
      );
      const next: Suggestion[] = result.rooms.map((r, i) => ({
        id: `s-${i}`,
        name: r.name,
        notes: r.notes,
        // Default: accept any room that's not already in the kept set.
        accepted: !seen.has(r.name.trim().toLowerCase()),
      }));
      setSuggestions(next);
    } catch (e) {
      setError((e as Error).message || "The Foreman couldn't read this one");
    } finally {
      setExtracting(false);
    }
  }

  function toggle(id: string) {
    setSuggestions((prev) =>
      prev?.map((s) => (s.id === id ? { ...s, accepted: !s.accepted } : s)) ??
      null,
    );
  }

  function renameSuggestion(id: string, name: string) {
    setSuggestions((prev) =>
      prev?.map((s) => (s.id === id ? { ...s, name } : s)) ?? null,
    );
  }

  function dropKeptRoom(name: string) {
    setKeptRooms((prev) => prev.filter((r) => r.name !== name));
  }

  function commit() {
    const accepted =
      suggestions?.filter((s) => s.accepted && s.name.trim().length > 0) ??
      [];
    const final: Room[] = [
      ...keptRooms,
      ...accepted.map((s) => ({ name: s.name.trim(), notes: s.notes })),
    ];
    // Dedupe by case-insensitive name; first occurrence wins.
    const seen = new Set<string>();
    const deduped = final.filter((r) => {
      const key = r.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    startSave(async () => {
      try {
        await setPropertyRooms({
          propertyId,
          rooms: deduped,
        });
        setKeptRooms(deduped);
        setSuggestions(null);
      } catch (e) {
        setError((e as Error).message || "Could not save rooms");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-soft">
          Upload a sketch, MLS listing, or contractor drawing of{" "}
          {propertyName.toLowerCase()}. The Foreman will read it and
          suggest the rooms — you confirm which ones to keep.
        </p>
      </div>

      {floorPlanUrl ? (
        <div className="space-y-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-paper-2 sm:max-w-xl">
            <Image
              src={floorPlanUrl}
              alt="Floor plan"
              fill
              sizes="(max-width: 640px) 100vw, 600px"
              className="object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-[12px] hover:border-ink disabled:opacity-50"
            >
              <Upload className="size-3" />
              {busy ? "Uploading…" : "Replace floor plan"}
            </button>
            <button
              type="button"
              disabled={extracting}
              onClick={findRooms}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-ink-soft disabled:opacity-50"
            >
              {extracting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              {extracting ? "Reading…" : "Find rooms with the Foreman"}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-paper px-4 py-8 text-sm text-ink-soft transition-colors hover:border-brass hover:text-brass disabled:opacity-60 sm:max-w-xl"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Upload className="size-4" />
                Upload a floor plan
              </>
            )}
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => onFiles(e.target.files)}
      />

      {error && <p className="text-xs text-danger">{error}</p>}

      {keptRooms.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
            Currently on this property
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {keptRooms.map((r) => (
              <li
                key={r.name}
                className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-paper px-2.5 py-1 text-[12px] text-ink"
              >
                {r.name}
                <button
                  type="button"
                  onClick={() => dropKeptRoom(r.name)}
                  aria-label={`Remove ${r.name}`}
                  className="opacity-50 hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions && (
        <div className="rounded-lg border border-line bg-paper-2 p-4">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
            The Foreman noticed
          </p>
          {suggestions.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              Couldn&apos;t make out any rooms in this image. Try a clearer
              sketch or a higher-resolution scan.
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {suggestions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 rounded-md border border-line bg-paper p-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(s.id)}
                      aria-pressed={s.accepted}
                      className={
                        s.accepted
                          ? "grid size-6 shrink-0 place-items-center rounded-full border border-ink bg-ink text-paper"
                          : "grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-transparent hover:text-ink-faint"
                      }
                    >
                      <Check className="size-3" />
                    </button>
                    <div className="flex-1 space-y-1">
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => renameSuggestion(s.id, e.target.value)}
                        disabled={!s.accepted}
                        className="w-full rounded-md border border-line bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-brass disabled:opacity-50"
                      />
                      {s.notes && (
                        <p className="text-[11px] text-ink-faint">{s.notes}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={commit}
                  disabled={savePending}
                  className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-ink-soft disabled:opacity-50"
                >
                  {savePending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  Save selected
                </button>
                <button
                  type="button"
                  disabled={savePending}
                  onClick={() => setSuggestions(null)}
                  className="rounded-full border border-line-strong px-3 py-1.5 text-[12px] hover:border-ink disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
