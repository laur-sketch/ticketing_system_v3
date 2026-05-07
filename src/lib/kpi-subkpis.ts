import type { Prisma } from "@prisma/client";

export type SubKpiItem = { id: string; title: string; done?: boolean };

export type SubKpiSegment = { id: string; label: string; items: SubKpiItem[] };

/** Stored JSON: legacy flat array or wrapped envelope. */
export type SubKpisStoredEnvelope = {
  segmented: boolean;
  items?: SubKpiItem[];
  segments?: SubKpiSegment[];
};

export type NormalizedSubKpis =
  | { segmented: false; flat: SubKpiItem[] }
  | { segmented: true; segments: SubKpiSegment[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function normalizeSubKpis(raw: unknown): NormalizedSubKpis {
  if (Array.isArray(raw)) {
    const flat = raw.map((x) => {
      const r = x as SubKpiItem;
      return { id: String(r?.id ?? ""), title: String(r?.title ?? ""), done: Boolean(r?.done) };
    });
    return { segmented: false, flat };
  }
  if (isPlainObject(raw)) {
    if (raw.segmented === true && Array.isArray(raw.segments)) {
      const segments = (raw.segments as unknown[]).map((seg) => {
        const s = seg as SubKpiSegment;
        const id = String(s?.id ?? "");
        const label = String(s?.label ?? "");
        const items = Array.isArray(s?.items)
          ? (s.items as unknown[]).map((it) => {
              const r = it as SubKpiItem;
              return {
                id: String(r?.id ?? ""),
                title: String(r?.title ?? ""),
                done: Boolean(r?.done),
              };
            })
          : [];
        return { id, label, items };
      });
      return { segmented: true, segments };
    }
    if (Array.isArray(raw.items)) {
      const flat = (raw.items as unknown[]).map((x) => {
        const r = x as SubKpiItem;
        return { id: String(r?.id ?? ""), title: String(r?.title ?? ""), done: Boolean(r?.done) };
      });
      return { segmented: false, flat };
    }
  }
  return { segmented: false, flat: [] };
}

export function collectAllSubKpiItems(norm: NormalizedSubKpis): SubKpiItem[] {
  if (norm.segmented) return norm.segments.flatMap((s) => s.items);
  return norm.flat;
}

export function wrapForPersist(norm: NormalizedSubKpis): Prisma.InputJsonValue {
  if (norm.segmented) {
    return { segmented: true, segments: norm.segments } as Prisma.InputJsonValue;
  }
  return { segmented: false, items: norm.flat } as Prisma.InputJsonValue;
}

/** Migrate legacy array to envelope (optional, for consistency). */
export function ensureEnvelope(raw: unknown): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  return wrapForPersist(n);
}

export function resetAllSubKpiDone(raw: unknown): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map((it) => ({ ...it, done: false })),
    }));
    return wrapForPersist({ segmented: true, segments });
  }
  const flat = n.flat.map((it) => ({ ...it, done: false }));
  return wrapForPersist({ segmented: false, flat });
}

export function setSubKpiItemDone(raw: unknown, subKpiId: string, done: boolean): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map((it) => (it.id === subKpiId ? { ...it, done } : it)),
    }));
    return wrapForPersist({ segmented: true, segments });
  }
  const flat = n.flat.map((it) => (it.id === subKpiId ? { ...it, done } : it));
  return wrapForPersist({ segmented: false, flat });
}

export function markEverySubKpiDone(raw: unknown, done: boolean): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map((it) => ({ ...it, done })),
    }));
    return wrapForPersist({ segmented: true, segments });
  }
  const flat = n.flat.map((it) => ({ ...it, done }));
  return wrapForPersist({ segmented: false, flat });
}

const MIN_SEGMENTED_SUBKPIS = 3;

export function validateSegmentStructureForPersist(
  segmented: boolean,
  flatTitles: string[],
  segmentsInput: Array<{ label: string; items: string[] }> | undefined,
): { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string } {
  if (!segmented) {
    const flat: SubKpiItem[] = flatTitles
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((title) => ({ id: crypto.randomUUID(), title, done: false }));
    if (flat.length === 0) {
      return { ok: false, error: "At least one sub-task is required." };
    }
    return { ok: true, norm: { segmented: false, flat } };
  }

  const total =
    segmentsInput?.reduce((acc, seg) => acc + seg.items.filter((t) => t.trim().length > 0).length, 0) ?? 0;
  if (total < MIN_SEGMENTED_SUBKPIS) {
    return {
      ok: false,
      error: `Segmented checklists require at least ${MIN_SEGMENTED_SUBKPIS} sub-tasks across segments.`,
    };
  }

  if (!segmentsInput || segmentsInput.length === 0) {
    return { ok: false, error: "Add at least one segment with a label before adding sub-tasks." };
  }

  const segments: SubKpiSegment[] = [];
  for (const seg of segmentsInput) {
    const label = seg.label.trim();
    if (!label) {
      return { ok: false, error: "Each segment needs a label before saving." };
    }
    const items = seg.items
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map((title) => ({ id: crypto.randomUUID(), title, done: false }));
    segments.push({ id: crypto.randomUUID(), label, items });
    if (items.length === 0) {
      return { ok: false, error: `Segment "${label}" has no sub-tasks; add titles or remove the segment.` };
    }
  }

  return { ok: true, norm: { segmented: true, segments } };
}

export function validateStructuredUpdate(
  body: unknown,
): { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "Invalid sub-task payload." };
  const segmented = body.segmented === true;
  if (segmented) {
    const segs = body.segments;
    if (!Array.isArray(segs) || segs.length === 0) {
      return { ok: false, error: "segmented payloads require segments array." };
    }
    const segmentsOut: SubKpiSegment[] = [];
    let totalItems = 0;
    for (const s of segs) {
      if (!isPlainObject(s)) continue;
      const label = typeof s.label === "string" ? s.label.trim() : "";
      if (!label) return { ok: false, error: "Each segment must have a label." };
      const sid = typeof s.id === "string" && s.id.trim() ? s.id.trim() : crypto.randomUUID();
      const rawItems = Array.isArray(s.items) ? s.items : [];
      const items: SubKpiItem[] = [];
      for (const it of rawItems) {
        if (!isPlainObject(it)) continue;
        const title = typeof it.title === "string" ? it.title.trim() : "";
        if (!title) continue;
        const id = typeof it.id === "string" && it.id.trim() ? it.id.trim() : crypto.randomUUID();
        items.push({ id, title, done: Boolean(it.done) });
      }
      if (items.length === 0) {
        return { ok: false, error: `Segment "${label}" cannot be empty.` };
      }
      totalItems += items.length;
      segmentsOut.push({ id: sid, label, items });
    }
    if (totalItems < MIN_SEGMENTED_SUBKPIS) {
      return {
        ok: false,
        error: `Segmented tasks must keep at least ${MIN_SEGMENTED_SUBKPIS} sub-tasks in total.`,
      };
    }
    return { ok: true, norm: { segmented: true, segments: segmentsOut } };
  }
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const flat: SubKpiItem[] = [];
  for (const it of rawItems) {
    if (!isPlainObject(it)) continue;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    if (!title) continue;
    const id = typeof it.id === "string" && it.id.trim() ? it.id.trim() : crypto.randomUUID();
    flat.push({ id, title, done: Boolean(it.done) });
  }
  if (flat.length === 0) {
    return { ok: false, error: "Flat checklist needs at least one sub-task." };
  }
  return { ok: true, norm: { segmented: false, flat } };
}
