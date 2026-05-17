"use client";

import { useState, useTransition } from "react";
import { Trash2, Check, Plus } from "lucide-react";
import {
  addShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
} from "@/app/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

type Item = {
  id: string;
  label: string;
  quantity: string | null;
  purchased: boolean;
};

export function ShoppingList({
  projectId,
  taskId,
  items,
  canWrite,
}: {
  projectId: string;
  taskId: string | null;
  items: Item[];
  canWrite: boolean;
}) {
  const [label, setLabel] = useState("");
  const [qty, setQty] = useState("");
  const [pending, startTransition] = useTransition();
  const remaining = items.filter((i) => !i.purchased).length;

  return (
    <div>
      {canWrite && (
        <form
          action={() => {
            const l = label.trim();
            if (!l) return;
            const q = qty.trim();
            setLabel("");
            setQty("");
            startTransition(() =>
              addShoppingItem(projectId, taskId, l, q || undefined),
            );
          }}
          className="mb-4 flex gap-2"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Add an item to buy…"
            className="min-w-0 flex-1 rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          />
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qty"
            className="w-16 rounded-lg border border-line-strong bg-paper px-2 py-2 text-sm outline-none placeholder:text-ink-faint focus:border-brass"
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !label.trim()}
            aria-label="Add item"
          >
            <Plus className="size-4" />
          </Button>
        </form>
      )}

      {items.length > 0 && (
        <p className="mb-2 font-mono text-[10px] tracking-wide text-ink-faint uppercase">
          {remaining} to buy · {items.length - remaining} got
        </p>
      )}

      <ul className="space-y-1.5">
        {items.length === 0 && (
          <li className="text-sm text-ink-faint">Nothing on the list yet.</li>
        )}
        {items.map((it) => (
          <li
            key={it.id}
            className="group flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2"
          >
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => startTransition(() => toggleShoppingItem(it.id))}
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-[5px] border transition-colors",
                it.purchased
                  ? "border-positive bg-positive text-white"
                  : "border-line-strong bg-card hover:border-brass",
              )}
              aria-label={it.purchased ? "Mark not bought" : "Mark bought"}
            >
              {it.purchased && <Check className="size-3" strokeWidth={3} />}
            </button>
            <span
              className={cn(
                "flex-1 text-sm",
                it.purchased
                  ? "text-ink-faint line-through"
                  : "text-ink",
              )}
            >
              {it.label}
              {it.quantity && (
                <span className="ml-2 font-mono text-[11px] text-ink-faint">
                  ×{it.quantity}
                </span>
              )}
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={() =>
                  startTransition(() => deleteShoppingItem(it.id))
                }
                className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
                aria-label="Remove"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
