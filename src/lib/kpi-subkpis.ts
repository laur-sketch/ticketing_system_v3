import type { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { normalizeTimeZone } from "./kpi-recurrence";

/** Optional `dueDate` / `actualDate` are calendar days `YYYY-MM-DD` (IT Project Implementation sub-tasks). */
export type SubKpiItem = {
  id: string;
  title: string;
  done?: boolean;
  dueDate?: string | null;
  actualDate?: string | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeOptionalSubKpiYmd(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return YMD.test(s) ? s : null;
}

function itemFromRaw(r: Record<string, unknown>): SubKpiItem {
  const id = String(r?.id ?? "");
  const title = String(r?.title ?? "");
  const done = Boolean(r?.done);
  const dueDate = normalizeOptionalSubKpiYmd(r?.dueDate);
  const actualDate = normalizeOptionalSubKpiYmd(r?.actualDate);
  return {
    id,
    title,
    done,
    ...(dueDate ? { dueDate } : {}),
    ...(actualDate ? { actualDate } : {}),
  };
}

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
    const flat = raw.map((x) =>
      isPlainObject(x) ? itemFromRaw(x as Record<string, unknown>) : { id: "", title: "", done: false },
    );
    return { segmented: false, flat };
  }
  if (isPlainObject(raw)) {
    if (raw.segmented === true && Array.isArray(raw.segments)) {
      const segments = (raw.segments as unknown[]).map((seg) => {
        const s = seg as SubKpiSegment;
        const id = String(s?.id ?? "");
        const label = String(s?.label ?? "");
        const items = Array.isArray(s?.items)
          ? (s.items as unknown[]).map((it) =>
              isPlainObject(it)
                ? itemFromRaw(it as Record<string, unknown>)
                : { id: "", title: "", done: false },
            )
          : [];
        return { id, label, items };
      });
      return { segmented: true, segments };
    }
    if (Array.isArray(raw.items)) {
      const flat = (raw.items as unknown[]).map((x) =>
        isPlainObject(x) ? itemFromRaw(x as Record<string, unknown>) : { id: "", title: "", done: false },
      );
      return { segmented: false, flat };
    }
  }
  return { segmented: false, flat: [] };
}

export function collectAllSubKpiItems(norm: NormalizedSubKpis): SubKpiItem[] {
  if (norm.segmented) return norm.segments.flatMap((s) => s.items);
  return norm.flat;
}

/** Checklist completion: percent = (total − missing) / total, missing = unchecked items. */
export type KpiChecklistProgress = {
  total: number;
  done: number;
  missing: number;
  percent: number;
};

export function kpiChecklistProgress(raw: unknown): KpiChecklistProgress {
  const all = collectAllSubKpiItems(normalizeSubKpis(raw));
  const total = all.length;
  const done = all.filter((s) => s.done).length;
  const missing = total - done;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, missing, percent };
}

export function aggregateKpiChecklistProgress(
  records: ReadonlyArray<{ subKpis: unknown }>,
): KpiChecklistProgress {
  let total = 0;
  let done = 0;
  for (const r of records) {
    const p = kpiChecklistProgress(r.subKpis);
    total += p.total;
    done += p.done;
  }
  const missing = total - done;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, missing, percent };
}

/** Daily cyber/network: checked = incident (breach/downtime), unchecked = clear (safe/uptime). */
export const DAILY_INVERTED_CHECKLIST_PILLARS = new Set<string>([
  "CYBERSECURITY",
  "NETWORK PERFORMANCE",
]);

export function isDailyInvertedChecklistPillar(
  title: string,
  frequency: string,
): boolean {
  return frequency === "DAILY" && DAILY_INVERTED_CHECKLIST_PILLARS.has(title.trim());
}

/** Donut/headline view: positive = good state, negative = bad state (may invert raw checklist). */
export type KpiChecklistMetricView = KpiChecklistProgress & {
  positive: number;
  negative: number;
  inverted: boolean;
};

export function kpiChecklistMetricView(
  agg: KpiChecklistProgress,
  invert: boolean,
): KpiChecklistMetricView {
  if (!invert) {
    return { ...agg, positive: agg.done, negative: agg.missing, inverted: false };
  }
  const positive = agg.missing;
  const negative = agg.done;
  const percent = agg.total > 0 ? Math.round((positive / agg.total) * 100) : 0;
  return { ...agg, percent, positive, negative, inverted: true };
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

/** When marking an IT Project sub-task done, default actual date to today (timezone) if unset. Clears actual date when unchecked. */
export function applyItProjectSubTaskDoneMeta(
  raw: unknown,
  subKpiId: string,
  done: boolean,
  timeZone: string,
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const zone = normalizeTimeZone(timeZone);
  const today =
    DateTime.now().setZone(zone).toISODate() ?? DateTime.utc().toISODate() ?? undefined;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    if (!done) {
      const next = { ...it, done: false };
      delete (next as { actualDate?: string }).actualDate;
      return next;
    }
    const hasActual = Boolean(it.actualDate?.trim());
    return {
      ...it,
      done: true,
      ...(!hasActual && today ? { actualDate: today } : {}),
    };
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersist({ segmented: true, segments });
  }
  const flat = n.flat.map(touch);
  return wrapForPersist({ segmented: false, flat });
}

export function setSubKpiItemScheduleMeta(
  raw: unknown,
  subKpiId: string,
  meta: { dueDate?: string | null; actualDate?: string | null },
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const due =
    meta.dueDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.dueDate) ?? null;
  const act =
    meta.actualDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.actualDate) ?? null;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    let next = { ...it };
    if (due !== undefined) {
      if (due) next = { ...next, dueDate: due };
      else {
        delete (next as { dueDate?: string }).dueDate;
      }
    }
    if (act !== undefined) {
      if (act) next = { ...next, actualDate: act };
      else {
        delete (next as { actualDate?: string }).actualDate;
      }
    }
    return next;
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersist({ segmented: true, segments });
  }
  const flat = n.flat.map(touch);
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

function subKpiFromStructuredItem(it: Record<string, unknown>): SubKpiItem | null {
  const title = typeof it.title === "string" ? it.title.trim() : "";
  if (!title) return null;
  const id = typeof it.id === "string" && it.id.trim() ? it.id.trim() : crypto.randomUUID();
  const dueDate = normalizeOptionalSubKpiYmd(it.dueDate);
  const actualDate = normalizeOptionalSubKpiYmd(it.actualDate);
  return {
    id,
    title,
    done: Boolean(it.done),
    ...(dueDate ? { dueDate } : {}),
    ...(actualDate ? { actualDate } : {}),
  };
}

/** Exported for client-side save validation (must match segmented KPI rules). */
export const MIN_SEGMENTED_SUBKPIS_FOR_CREATE = 3;
const MIN_SEGMENTED_SUBKPIS = MIN_SEGMENTED_SUBKPIS_FOR_CREATE;

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
        const row = subKpiFromStructuredItem(it);
        if (row) items.push(row);
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
    const row = subKpiFromStructuredItem(it);
    if (row) flat.push(row);
  }
  if (flat.length === 0) {
    return { ok: false, error: "Flat checklist needs at least one sub-task." };
  }
  return { ok: true, norm: { segmented: false, flat } };
}
