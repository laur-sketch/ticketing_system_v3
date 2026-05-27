import type { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { itProjectAllItems, isItProjectEnvelope, parseItProjectSubKpis } from "@/lib/it-project-subkpis";
import {
  parseTaskScreenshotMetaList,
  type TaskScreenshotMetaItem,
  type TaskScreenshotSlot,
} from "@/lib/task-screenshot-meta";
import { normalizeTimeZone } from "./kpi-recurrence";

/** Optional schedule fields are calendar days `YYYY-MM-DD` (IT Project Implementation sub-tasks). */
export type SubKpiItem = {
  id: string;
  title: string;
  done?: boolean;
  assignedAgentId?: string | null;
  assignedAgentName?: string | null;
  screenshotsEnabled?: boolean;
  beforeScreenshot?: TaskScreenshotMetaItem[];
  afterScreenshot?: TaskScreenshotMetaItem[];
  location?: string | null;
  startDate?: string | null;
  /** End date (stored as dueDate for backward compatibility). */
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
  const assignedAgentId = typeof r?.assignedAgentId === "string" ? r.assignedAgentId.trim() : "";
  const assignedAgentName = typeof r?.assignedAgentName === "string" ? r.assignedAgentName.trim() : "";
  const beforeScreenshot = parseTaskScreenshotMetaList(r?.beforeScreenshot);
  const afterScreenshot = parseTaskScreenshotMetaList(r?.afterScreenshot);
  const screenshotsEnabled = r?.screenshotsEnabled === true || beforeScreenshot.length > 0 || afterScreenshot.length > 0;
  const location = typeof r?.location === "string" ? r.location.trim() : "";
  const startDate = normalizeOptionalSubKpiYmd(r?.startDate);
  const dueDate = normalizeOptionalSubKpiYmd(r?.dueDate);
  const actualDate = normalizeOptionalSubKpiYmd(r?.actualDate);
  return {
    id,
    title,
    done,
    ...(assignedAgentId ? { assignedAgentId } : {}),
    ...(assignedAgentName ? { assignedAgentName } : {}),
    ...(screenshotsEnabled ? { screenshotsEnabled: true } : {}),
    ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
    ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
    ...(location ? { location } : {}),
    ...(startDate ? { startDate } : {}),
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
  pillarScreenshotsEnabled?: boolean;
  pillarBeforeScreenshot?: TaskScreenshotMetaItem[];
  pillarAfterScreenshot?: TaskScreenshotMetaItem[];
  archivedTaskScreenshots?: ArchivedTaskScreenshotSet[];
};

export type ArchivedTaskScreenshotSet = {
  archivedAt: string;
  subTasks: Array<{
    id: string;
    title: string;
    beforeScreenshot?: TaskScreenshotMetaItem[];
    afterScreenshot?: TaskScreenshotMetaItem[];
  }>;
  pillarBeforeScreenshot?: TaskScreenshotMetaItem[];
  pillarAfterScreenshot?: TaskScreenshotMetaItem[];
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

/** IT Project tasks: all phases flattened (legacy segmented JSON is flattened for display). */
export function normalizeSubKpisForItProject(raw: unknown): NormalizedSubKpis {
  if (isItProjectEnvelope(raw)) {
    return { segmented: false, flat: itProjectAllItems(parseItProjectSubKpis(raw)) };
  }
  const n = normalizeSubKpis(raw);
  if (!n.segmented) return n;
  return { segmented: false, flat: collectAllSubKpiItems(n) };
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

/**
 * Cybersecurity / network: checked on the task board = breach or downtime;
 * unchecked items are neutral (safe / uptime), not counted as incidents.
 */
export const INVERTED_CHECKLIST_PILLARS = new Set<string>([
  "CYBERSECURITY",
  "NETWORK PERFORMANCE",
]);

/** @deprecated Use {@link isInvertedChecklistPillar} — frequency is ignored. */
export const DAILY_INVERTED_CHECKLIST_PILLARS = INVERTED_CHECKLIST_PILLARS;

export function isInvertedChecklistPillar(title: string): boolean {
  return INVERTED_CHECKLIST_PILLARS.has(title.trim());
}

export function isDailyInvertedChecklistPillar(title: string, frequency?: string): boolean {
  void frequency;
  return isInvertedChecklistPillar(title);
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

function rawEnvelopeMeta(raw: unknown) {
  if (!isPlainObject(raw)) {
    return {
      pillarScreenshotsEnabled: false,
      pillarBeforeScreenshot: [] as TaskScreenshotMetaItem[],
      pillarAfterScreenshot: [] as TaskScreenshotMetaItem[],
      archivedTaskScreenshots: [] as ArchivedTaskScreenshotSet[],
    };
  }
  const pillarBeforeScreenshot = parseTaskScreenshotMetaList(raw.pillarBeforeScreenshot);
  const pillarAfterScreenshot = parseTaskScreenshotMetaList(raw.pillarAfterScreenshot);
  return {
    pillarScreenshotsEnabled:
      raw.pillarScreenshotsEnabled === true ||
      pillarBeforeScreenshot.length > 0 ||
      pillarAfterScreenshot.length > 0,
    pillarBeforeScreenshot,
    pillarAfterScreenshot,
    archivedTaskScreenshots: parseArchivedTaskScreenshotSets(raw.archivedTaskScreenshots),
  };
}

function withEnvelopeMeta(base: Prisma.InputJsonValue, meta: ReturnType<typeof rawEnvelopeMeta>): Prisma.InputJsonValue {
  if (!isPlainObject(base)) return base;
  return {
    ...base,
    ...(meta.pillarScreenshotsEnabled ? { pillarScreenshotsEnabled: true } : {}),
    ...(meta.pillarBeforeScreenshot.length > 0 ? { pillarBeforeScreenshot: meta.pillarBeforeScreenshot } : {}),
    ...(meta.pillarAfterScreenshot.length > 0 ? { pillarAfterScreenshot: meta.pillarAfterScreenshot } : {}),
    ...(meta.archivedTaskScreenshots.length > 0 ? { archivedTaskScreenshots: meta.archivedTaskScreenshots } : {}),
  } as Prisma.InputJsonValue;
}

export function wrapForPersistWithExistingMeta(norm: NormalizedSubKpis, raw: unknown): Prisma.InputJsonValue {
  return withEnvelopeMeta(wrapForPersist(norm), rawEnvelopeMeta(raw));
}

export function enablePillarScreenshots(raw: unknown): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarScreenshotsEnabled = true;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function pillarScreenshotsEnabled(raw: unknown): boolean {
  return rawEnvelopeMeta(raw).pillarScreenshotsEnabled;
}

export function getPillarScreenshots(raw: unknown, slot: TaskScreenshotSlot): TaskScreenshotMetaItem[] {
  const meta = rawEnvelopeMeta(raw);
  return slot === "before" ? meta.pillarBeforeScreenshot : meta.pillarAfterScreenshot;
}

export function getArchivedTaskScreenshots(raw: unknown): ArchivedTaskScreenshotSet[] {
  return rawEnvelopeMeta(raw).archivedTaskScreenshots;
}

export function setPillarScreenshots(
  raw: unknown,
  slot: TaskScreenshotSlot,
  screenshots: TaskScreenshotMetaItem[],
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  meta.pillarScreenshotsEnabled = true;
  if (slot === "before") meta.pillarBeforeScreenshot = screenshots;
  else meta.pillarAfterScreenshot = screenshots;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

export function removePillarScreenshot(
  raw: unknown,
  slot: TaskScreenshotSlot,
  storedFileName: string,
): Prisma.InputJsonValue {
  const meta = rawEnvelopeMeta(raw);
  const next =
    slot === "before"
      ? meta.pillarBeforeScreenshot.filter((item) => item.storedFileName !== storedFileName)
      : meta.pillarAfterScreenshot.filter((item) => item.storedFileName !== storedFileName);
  if (slot === "before") meta.pillarBeforeScreenshot = next;
  else meta.pillarAfterScreenshot = next;
  meta.pillarScreenshotsEnabled = true;
  return withEnvelopeMeta(ensureEnvelope(raw), meta);
}

/** Migrate legacy array to envelope (optional, for consistency). */
export function ensureEnvelope(raw: unknown): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  return wrapForPersistWithExistingMeta(n, raw);
}

function parseArchivedTaskScreenshotSets(raw: unknown): ArchivedTaskScreenshotSet[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry): ArchivedTaskScreenshotSet | null => {
      if (!isPlainObject(entry)) return null;
      const subTasks = Array.isArray(entry.subTasks)
        ? entry.subTasks
            .map((it): ArchivedTaskScreenshotSet["subTasks"][number] | null => {
              if (!isPlainObject(it)) return null;
              const id = typeof it.id === "string" ? it.id : "";
              const title = typeof it.title === "string" ? it.title : "";
              const beforeScreenshot = parseTaskScreenshotMetaList(it.beforeScreenshot);
              const afterScreenshot = parseTaskScreenshotMetaList(it.afterScreenshot);
              if (!id || (beforeScreenshot.length === 0 && afterScreenshot.length === 0)) return null;
              return {
                id,
                title,
                ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
                ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
              };
            })
            .filter((it): it is ArchivedTaskScreenshotSet["subTasks"][number] => it != null)
        : [];
      const pillarBeforeScreenshot = parseTaskScreenshotMetaList(entry.pillarBeforeScreenshot);
      const pillarAfterScreenshot = parseTaskScreenshotMetaList(entry.pillarAfterScreenshot);
      if (subTasks.length === 0 && pillarBeforeScreenshot.length === 0 && pillarAfterScreenshot.length === 0) {
        return null;
      }
      return {
        archivedAt: typeof entry.archivedAt === "string" ? entry.archivedAt : new Date().toISOString(),
        subTasks,
        ...(pillarBeforeScreenshot.length > 0 ? { pillarBeforeScreenshot } : {}),
        ...(pillarAfterScreenshot.length > 0 ? { pillarAfterScreenshot } : {}),
      };
    })
    .filter((entry): entry is ArchivedTaskScreenshotSet => entry != null);
}

function archiveScreenshotsForReset(raw: unknown, norm: NormalizedSubKpis): ReturnType<typeof rawEnvelopeMeta> {
  const meta = rawEnvelopeMeta(raw);
  const subTasks = collectAllSubKpiItems(norm)
    .map((it) => {
      const beforeScreenshot = it.beforeScreenshot ?? [];
      const afterScreenshot = it.afterScreenshot ?? [];
      if (beforeScreenshot.length === 0 && afterScreenshot.length === 0) return null;
      return {
        id: it.id,
        title: it.title,
        ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
        ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
      };
    })
    .filter((it): it is ArchivedTaskScreenshotSet["subTasks"][number] => it != null);
  if (subTasks.length > 0 || meta.pillarBeforeScreenshot.length > 0 || meta.pillarAfterScreenshot.length > 0) {
    meta.archivedTaskScreenshots = [
      ...meta.archivedTaskScreenshots,
      {
        archivedAt: new Date().toISOString(),
        subTasks,
        ...(meta.pillarBeforeScreenshot.length > 0 ? { pillarBeforeScreenshot: meta.pillarBeforeScreenshot } : {}),
        ...(meta.pillarAfterScreenshot.length > 0 ? { pillarAfterScreenshot: meta.pillarAfterScreenshot } : {}),
      },
    ];
    meta.pillarBeforeScreenshot = [];
    meta.pillarAfterScreenshot = [];
  }
  return meta;
}

function clearActiveScreenshots(it: SubKpiItem): SubKpiItem {
  const next = { ...it, done: false };
  delete next.beforeScreenshot;
  delete next.afterScreenshot;
  return next;
}

export function resetAllSubKpiDone(raw: unknown): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const meta = archiveScreenshotsForReset(raw, n);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(clearActiveScreenshots),
    }));
    return withEnvelopeMeta(wrapForPersist({ segmented: true, segments }), meta);
  }
  const flat = n.flat.map(clearActiveScreenshots);
  return withEnvelopeMeta(wrapForPersist({ segmented: false, flat }), meta);
}

export function setSubKpiItemDone(raw: unknown, subKpiId: string, done: boolean): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map((it) => (it.id === subKpiId ? { ...it, done } : it)),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map((it) => (it.id === subKpiId ? { ...it, done } : it));
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function subKpiAssignedAgentId(item: SubKpiItem): string | null {
  const id = item.assignedAgentId?.trim();
  return id ? id : null;
}

export function hasSubKpiAssignedTo(raw: unknown, agentId: string | null | undefined): boolean {
  const id = agentId?.trim();
  if (!id) return false;
  const items = isItProjectEnvelope(raw)
    ? itProjectAllItems(parseItProjectSubKpis(raw))
    : collectAllSubKpiItems(normalizeSubKpis(raw));
  return items.some((it) => subKpiAssignedAgentId(it) === id);
}

export function setSubKpiItemAssignee(
  raw: unknown,
  subKpiId: string,
  assignee: { id: string; name: string } | null,
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    const next = { ...it };
    if (assignee) {
      next.assignedAgentId = assignee.id;
      next.assignedAgentName = assignee.name;
    } else {
      delete next.assignedAgentId;
      delete next.assignedAgentName;
    }
    return next;
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function setSubKpiItemScreenshots(
  raw: unknown,
  subKpiId: string,
  slot: TaskScreenshotSlot,
  screenshots: TaskScreenshotMetaItem[],
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const key = slot === "before" ? "beforeScreenshot" : "afterScreenshot";
  const touch = (it: SubKpiItem): SubKpiItem =>
    it.id === subKpiId ? { ...it, [key]: screenshots } : it;
  if (n.segmented) {
    return wrapForPersistWithExistingMeta({
      segmented: true,
      segments: n.segments.map((seg) => ({ ...seg, items: seg.items.map(touch) })),
    }, raw);
  }
  return wrapForPersistWithExistingMeta({ segmented: false, flat: n.flat.map(touch) }, raw);
}

export function removeSubKpiItemScreenshot(
  raw: unknown,
  subKpiId: string,
  slot: TaskScreenshotSlot,
  storedFileName: string,
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const key = slot === "before" ? "beforeScreenshot" : "afterScreenshot";
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    const nextScreenshots = (it[key] ?? []).filter((item) => item.storedFileName !== storedFileName);
    return { ...it, [key]: nextScreenshots };
  };
  if (n.segmented) {
    return wrapForPersistWithExistingMeta({
      segmented: true,
      segments: n.segments.map((seg) => ({ ...seg, items: seg.items.map(touch) })),
    }, raw);
  }
  return wrapForPersistWithExistingMeta({ segmented: false, flat: n.flat.map(touch) }, raw);
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
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function setSubKpiItemScheduleMeta(
  raw: unknown,
  subKpiId: string,
  meta: { startDate?: string | null; dueDate?: string | null; actualDate?: string | null },
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const start =
    meta.startDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.startDate) ?? null;
  const due =
    meta.dueDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.dueDate) ?? null;
  const act =
    meta.actualDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.actualDate) ?? null;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    let next = { ...it };
    if (start !== undefined) {
      if (start) next = { ...next, startDate: start };
      else {
        delete (next as { startDate?: string }).startDate;
      }
    }
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
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function setSubKpiItemWorkMeta(
  raw: unknown,
  subKpiId: string,
  meta: {
    startDate?: string | null;
    dueDate?: string | null;
    actualDate?: string | null;
    location?: string | null;
  },
): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  const start =
    meta.startDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.startDate) ?? null;
  const due =
    meta.dueDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.dueDate) ?? null;
  const act =
    meta.actualDate === undefined ? undefined : normalizeOptionalSubKpiYmd(meta.actualDate) ?? null;
  const location =
    meta.location === undefined
      ? undefined
      : typeof meta.location === "string" && meta.location.trim()
        ? meta.location.trim().slice(0, 160)
        : null;
  const touch = (it: SubKpiItem): SubKpiItem => {
    if (it.id !== subKpiId) return it;
    let next = { ...it };
    if (start !== undefined) {
      if (start) next = { ...next, startDate: start };
      else delete (next as { startDate?: string }).startDate;
    }
    if (due !== undefined) {
      if (due) next = { ...next, dueDate: due };
      else delete (next as { dueDate?: string }).dueDate;
    }
    if (act !== undefined) {
      if (act) next = { ...next, actualDate: act };
      else delete (next as { actualDate?: string }).actualDate;
    }
    if (location !== undefined) {
      if (location) next = { ...next, location };
      else delete (next as { location?: string }).location;
    }
    return next;
  };
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map(touch),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map(touch);
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

export function markEverySubKpiDone(raw: unknown, done: boolean): Prisma.InputJsonValue {
  const n = normalizeSubKpis(raw);
  if (n.segmented) {
    const segments = n.segments.map((seg) => ({
      ...seg,
      items: seg.items.map((it) => ({ ...it, done })),
    }));
    return wrapForPersistWithExistingMeta({ segmented: true, segments }, raw);
  }
  const flat = n.flat.map((it) => ({ ...it, done }));
  return wrapForPersistWithExistingMeta({ segmented: false, flat }, raw);
}

function subKpiFromStructuredItem(it: Record<string, unknown>): SubKpiItem | null {
  const title = typeof it.title === "string" ? it.title.trim() : "";
  if (!title) return null;
  const id = typeof it.id === "string" && it.id.trim() ? it.id.trim() : crypto.randomUUID();
  const assignedAgentId = typeof it.assignedAgentId === "string" ? it.assignedAgentId.trim() : "";
  const assignedAgentName = typeof it.assignedAgentName === "string" ? it.assignedAgentName.trim() : "";
  const beforeScreenshot = parseTaskScreenshotMetaList(it.beforeScreenshot);
  const afterScreenshot = parseTaskScreenshotMetaList(it.afterScreenshot);
  const screenshotsEnabled = it.screenshotsEnabled === true || beforeScreenshot.length > 0 || afterScreenshot.length > 0;
  const location = typeof it.location === "string" ? it.location.trim() : "";
  const startDate = normalizeOptionalSubKpiYmd(it.startDate);
  const dueDate = normalizeOptionalSubKpiYmd(it.dueDate);
  const actualDate = normalizeOptionalSubKpiYmd(it.actualDate);
  return {
    id,
    title,
    done: Boolean(it.done),
    ...(assignedAgentId ? { assignedAgentId } : {}),
    ...(assignedAgentName ? { assignedAgentName } : {}),
    ...(screenshotsEnabled ? { screenshotsEnabled: true } : {}),
    ...(beforeScreenshot.length > 0 ? { beforeScreenshot } : {}),
    ...(afterScreenshot.length > 0 ? { afterScreenshot } : {}),
    ...(location ? { location } : {}),
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(actualDate ? { actualDate } : {}),
  };
}

export type ItProjectSubKpiDraft = { title: string; startDate: string; endDate: string };

/** Build flat checklist for IT Project Implementation (no segments, no task-level dates). */
export function buildItProjectSubKpis(
  items: ItProjectSubKpiDraft[],
): { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string } {
  const flat: SubKpiItem[] = [];
  for (const item of items) {
    const title = item.title.trim();
    const startDate = normalizeOptionalSubKpiYmd(item.startDate);
    const endDate = normalizeOptionalSubKpiYmd(item.endDate);
    if (!title) continue;
    if (!startDate || !endDate) {
      return { ok: false, error: "Each sub-task needs a start date and end date." };
    }
    if (endDate < startDate) {
      return { ok: false, error: `Sub-task "${title}": end date must be on or after start date.` };
    }
    flat.push({ id: crypto.randomUUID(), title, done: false, startDate, dueDate: endDate });
  }
  if (flat.length === 0) {
    return { ok: false, error: "Add at least one sub-task with start and end dates." };
  }
  return { ok: true, norm: { segmented: false, flat } };
}

/** Exported for client-side save validation (must match segmented KPI rules). */
export const MIN_SEGMENTED_SUBKPIS_FOR_CREATE = 3;
const MIN_SEGMENTED_SUBKPIS = MIN_SEGMENTED_SUBKPIS_FOR_CREATE;

type SubKpiCreateDraft = string | {
  title?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  endDate?: string | null;
  screenshotsEnabled?: boolean | null;
};

function subKpiFromCreateDraft(input: SubKpiCreateDraft): SubKpiItem | null {
  const rawTitle = typeof input === "string" ? input : input.title;
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) return null;
  const startDate = typeof input === "string" ? null : normalizeOptionalSubKpiYmd(input.startDate);
  const dueDate = typeof input === "string" ? null : normalizeOptionalSubKpiYmd(input.dueDate ?? input.endDate);
  const screenshotsEnabled = typeof input === "string" ? false : input.screenshotsEnabled === true;
  return {
    id: crypto.randomUUID(),
    title,
    done: false,
    ...(screenshotsEnabled ? { screenshotsEnabled: true } : {}),
    ...(startDate ? { startDate } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
}

export function validateSegmentStructureForPersist(
  segmented: boolean,
  flatInput: SubKpiCreateDraft[],
  segmentsInput: Array<{ label: string; items: SubKpiCreateDraft[] }> | undefined,
): { ok: true; norm: NormalizedSubKpis } | { ok: false; error: string } {
  if (!segmented) {
    const flat = flatInput
      .map(subKpiFromCreateDraft)
      .filter((item): item is SubKpiItem => item != null);
    if (flat.length === 0) {
      return { ok: false, error: "At least one sub-task is required." };
    }
    return { ok: true, norm: { segmented: false, flat } };
  }

  const total =
    segmentsInput?.reduce(
      (acc, seg) => acc + seg.items.map(subKpiFromCreateDraft).filter(Boolean).length,
      0,
    ) ?? 0;
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
      .map(subKpiFromCreateDraft)
      .filter((item): item is SubKpiItem => item != null);
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
