"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

export type PointerDragGhost = {
  itemId: string;
  label: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
};

type Session = {
  itemId: string;
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  activated: boolean;
  offsetX: number;
  offsetY: number;
};

/**
 * Touch + mouse column drag: move pointer with activation threshold, then drop on a registered column.
 * Avoids HTML5 DnD which is unreliable on mobile Safari.
 */
export function usePointerColumnDrag<T extends string>(options: {
  onDrop: (itemId: string, column: T) => void;
  onHover?: (column: T | null) => void;
  onDragEnd?: () => void;
  /** When true, column is not a valid drop target (still receives hover for UX if needed). */
  isColumnDropDisabled?: (column: T) => boolean;
  /** Minimum movement (px) before a drag activates; avoids fighting taps and light scrolls. */
  activationDistance?: number;
  disabled?: boolean;
}) {
  const { onDrop, onHover, onDragEnd, isColumnDropDisabled, activationDistance = 14, disabled = false } = options;
  const colRef = useRef(new Map<string, HTMLElement>());
  const sessionRef = useRef<Session | null>(null);
  const [ghost, setGhost] = useState<PointerDragGhost | null>(null);
  const [hoverColumn, setHoverColumn] = useState<T | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  const registerColumn = useCallback((id: T) => (el: HTMLElement | null) => {
    const key = String(id);
    if (el) colRef.current.set(key, el);
    else colRef.current.delete(key);
  }, []);

  const hitTest = useCallback((clientX: number, clientY: number): T | null => {
    let best: { key: string; area: number } | null = null;
    for (const [key, el] of colRef.current) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        const area = r.width * r.height;
        if (!best || area < best.area) best = { key, area };
      }
    }
    return best?.key as T | null;
  }, []);

  const getCardPointerProps = useCallback(
    (itemId: string, opts: { getLabel: () => string }) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (disabled) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("a[href], input, select, textarea")) return;

        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        sessionRef.current = {
          itemId,
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          clientX: e.clientX,
          clientY: e.clientY,
          activated: false,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
        };

        const onMove = (ev: PointerEvent) => {
          const s = sessionRef.current;
          if (!s || ev.pointerId !== s.pointerId) return;
          const dx = ev.clientX - s.startX;
          const dy = ev.clientY - s.startY;
          if (!s.activated) {
            if (dx * dx + dy * dy < activationDistance * activationDistance) return;
            s.activated = true;
            setDraggingItemId(s.itemId);
            document.body.style.userSelect = "none";
            try {
              document.body.style.setProperty("touch-action", "none");
            } catch {
              document.body.style.touchAction = "none";
            }
          }
          s.clientX = ev.clientX;
          s.clientY = ev.clientY;
          setGhost({
            itemId: s.itemId,
            label: opts.getLabel(),
            x: ev.clientX,
            y: ev.clientY,
            offsetX: s.offsetX,
            offsetY: s.offsetY,
          });
          const col = hitTest(ev.clientX, ev.clientY);
          const allowed = col != null && !isColumnDropDisabled?.(col);
          const nextHoverColumn = allowed ? col : null;
          setHoverColumn(nextHoverColumn);
          onHover?.(nextHoverColumn);
          if (s.activated) ev.preventDefault();
        };

        const cleanup = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
          document.body.style.userSelect = "";
          try {
            document.body.style.removeProperty("touch-action");
          } catch {
            document.body.style.touchAction = "";
          }
        };

        const onUp = (ev: PointerEvent) => {
          const s = sessionRef.current;
          if (!s || ev.pointerId !== s.pointerId) return;
          cleanup();
          if (s.activated) {
            const col = hitTest(ev.clientX, ev.clientY);
            if (col != null && !isColumnDropDisabled?.(col)) {
              onDrop(s.itemId, col);
            }
            ev.preventDefault();
          }
          sessionRef.current = null;
          setGhost(null);
          setHoverColumn(null);
          onHover?.(null);
          setDraggingItemId(null);
          onDragEnd?.();
        };

        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      },
    }),
    [activationDistance, disabled, hitTest, isColumnDropDisabled, onDragEnd, onDrop, onHover],
  );

  return { registerColumn, getCardPointerProps, ghost, hoverColumn, draggingItemId };
}

export function PointerDragGhostLayer({ ghost }: { ghost: PointerDragGhost | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  if (!mounted || !ghost || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] max-w-[min(92vw,320px)] rounded-lg border border-orange-400/50 bg-white/95 px-3 py-2 shadow-2xl ring-2 ring-orange-500/25 dark:border-orange-500/40 dark:bg-zinc-900/95 dark:ring-orange-400/20"
      style={{
        left: ghost.x - ghost.offsetX,
        top: ghost.y - ghost.offsetY,
      }}
    >
      <p className="line-clamp-2 text-xs font-semibold text-zinc-900 dark:text-zinc-100">{ghost.label}</p>
    </div>,
    document.body,
  );
}
