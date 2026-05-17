"use client";

import { useRef, useState, useTransition } from "react";
import {
  Trash2,
  Plus,
  Wrench,
  Camera,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { addUserTool, addUserTools, removeUserTool } from "@/app/actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Tool = { id: string; name: string };

const SUGGESTIONS = [
  "Drill/driver",
  "Random orbital sander",
  "Circular saw",
  "Reciprocating saw",
  "Miter saw",
  "Heat gun",
  "Shop vac",
  "Pry bar",
  "Stud finder",
  "Level (4 ft)",
  "Utility knife",
  "Caulk gun",
];

/** Downscale big phone photos before upload (keeps the request small). */
async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.82),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export function ToolsManager({ tools }: { tools: Tool[] }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const owned = new Set(tools.map((t) => t.name.toLowerCase()));

  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [detected, setDetected] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function add(value: string) {
    const v = value.trim();
    if (!v) return;
    setName("");
    startTransition(() => addUserTool(v));
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    setScanError(null);
    setDetected(null);
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append("image", blob, "tools.jpg");
      const res = await fetch("/api/identify-tools", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as {
        tools?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Scan failed");
      const fresh = (data.tools ?? []).filter(
        (n) => !owned.has(n.toLowerCase()),
      );
      setDetected(fresh);
      setPicked(new Set(fresh));
    } catch (e) {
      setScanError((e as Error).message || "Couldn't scan that photo");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function confirmAdd() {
    const list = [...picked];
    if (list.length === 0) {
      setDetected(null);
      return;
    }
    setDetected(null);
    setPicked(new Set());
    startTransition(() => addUserTools(list));
  }

  return (
    <div>
      <form action={() => add(name)} className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a tool you own…"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
        />
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </form>

      {/* Scan tools from a photo */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onPhoto(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={scanning}
        onClick={() => fileRef.current?.click()}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-paper px-4 py-3.5 text-sm text-ink-soft transition-colors hover:border-brass hover:text-brass disabled:opacity-60"
      >
        {scanning ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Reading your tools…
          </>
        ) : (
          <>
            <Camera className="size-4" /> Scan tools from a photo
          </>
        )}
      </button>
      {scanError && (
        <p className="-mt-3 mb-4 text-xs text-danger">{scanError}</p>
      )}

      {detected && (
        <div className="mb-5 rounded-lg border border-brass/40 bg-brass-tint/40 p-4">
          {detected.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No new tools spotted — either none in frame or you already own
              them. Try a clearer, closer photo.
            </p>
          ) : (
            <>
              <p className="mb-2 font-mono text-[10px] tracking-[0.18em] text-brass uppercase">
                Spotted {detected.length} — tap to include
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detected.map((n) => {
                  const on = picked.has(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        setPicked((s) => {
                          const next = new Set(s);
                          if (next.has(n)) next.delete(n);
                          else next.add(n);
                          return next;
                        })
                      }
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                        on
                          ? "border-brass bg-brass text-white"
                          : "border-line-strong bg-card text-ink-soft",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                      {n}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={confirmAdd}
                  disabled={pending || picked.size === 0}
                >
                  Add {picked.size} to toolbox
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDetected(null);
                    setPicked(new Set());
                  }}
                >
                  <X className="size-4" /> Discard
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-1.5">
        {SUGGESTIONS.filter((s) => !owned.has(s.toLowerCase())).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => add(s)}
            disabled={pending}
            className="rounded-full border border-line-strong bg-paper px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-brass hover:text-brass disabled:opacity-50"
          >
            + {s}
          </button>
        ))}
      </div>

      {tools.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No tools yet. Add what you own — the Foreman uses this to tell you
          what to buy or rent for each task.
        </p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {tools.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-2.5 rounded-lg border border-line bg-paper px-3 py-2"
            >
              <Wrench className="size-3.5 shrink-0 text-brass" />
              <span className="flex-1 truncate text-sm text-ink">
                {t.name}
              </span>
              <button
                type="button"
                onClick={() => startTransition(() => removeUserTool(t.id))}
                className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                aria-label={`Remove ${t.name}`}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
