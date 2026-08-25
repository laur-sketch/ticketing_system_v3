export const FAQ_SETTING_KEY = "faq";
export const MAX_FAQ_ITEMS = 40;
export const MAX_FAQ_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FAQ_TITLE = 160;
export const MAX_FAQ_DESCRIPTION = 600;

export const FAQ_PRESENTATION_ACCEPT =
  ".pdf,.ppt,.pptx,.odp,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.oasis.opendocument.presentation";

export type FaqItemKind = "presentation" | "video";

export type FaqFileMeta = {
  storedFileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type FaqItem = {
  id: string;
  kind: FaqItemKind;
  title: string;
  description: string;
  url: string;
  file: FaqFileMeta | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FaqCatalog = {
  version: 1;
  items: FaqItem[];
};

const STORED_FILE_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;

export function isFaqStoredFileName(name: string): boolean {
  return STORED_FILE_RE.test(name);
}

export function emptyFaqCatalog(): FaqCatalog {
  return { version: 1, items: [] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeFile(raw: unknown): FaqFileMeta | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const storedFileName = String(rec.storedFileName ?? "").trim();
  if (!isFaqStoredFileName(storedFileName)) return null;
  const size = Number(rec.size);
  return {
    storedFileName,
    originalName: String(rec.originalName ?? storedFileName).slice(0, 200) || storedFileName,
    mimeType: String(rec.mimeType ?? "application/octet-stream").slice(0, 120),
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    uploadedAt: String(rec.uploadedAt ?? new Date().toISOString()),
  };
}

function normalizeItem(raw: unknown, index: number): FaqItem | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const kind: FaqItemKind = rec.kind === "video" ? "video" : "presentation";
  const id = String(rec.id ?? "").trim();
  if (!id) return null;
  const title = String(rec.title ?? "").trim().slice(0, MAX_FAQ_TITLE);
  const description = String(rec.description ?? "").trim().slice(0, MAX_FAQ_DESCRIPTION);
  const url = String(rec.url ?? "").trim().slice(0, 2000);
  const file = normalizeFile(rec.file);
  const sortOrderRaw = Number(rec.sortOrder);
  const sortOrder = Number.isFinite(sortOrderRaw) ? sortOrderRaw : index;
  if (kind === "video" && !url) return null;
  if (kind === "presentation" && !url && !file) return null;
  return {
    id,
    kind,
    title: title || (kind === "video" ? "Video" : "Presentation"),
    description,
    url,
    file,
    sortOrder,
    createdAt: String(rec.createdAt ?? new Date().toISOString()),
    updatedAt: String(rec.updatedAt ?? new Date().toISOString()),
  };
}

export function parseFaqCatalog(raw: unknown): FaqCatalog {
  const rec = asRecord(raw);
  const itemsRaw = Array.isArray(rec?.items) ? rec.items : Array.isArray(raw) ? raw : [];
  const items = itemsRaw
    .map((item, index) => normalizeItem(item, index))
    .filter((item): item is FaqItem => item != null)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .slice(0, MAX_FAQ_ITEMS)
    .map((item, index) => ({ ...item, sortOrder: index }));
  return { version: 1, items };
}

export function isAllowedHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function presentationFileHref(item: FaqItem): string | null {
  if (!item.file) return null;
  return `/api/faq/files/${encodeURIComponent(item.file.storedFileName)}`;
}

export function youtubeEmbedSrc(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let id = "";
    if (host === "youtu.be") {
      id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (parsed.pathname.startsWith("/embed/")) {
        id = parsed.pathname.split("/")[2] ?? "";
      } else if (parsed.pathname.startsWith("/shorts/")) {
        id = parsed.pathname.split("/")[2] ?? "";
      } else {
        id = parsed.searchParams.get("v") ?? "";
      }
    }
    id = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
    if (!id) return null;
    return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    return null;
  }
}

export function vimeoEmbedSrc(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let id = "";
    if (host === "player.vimeo.com") {
      id = parsed.pathname.split("/").filter(Boolean)[1] ?? "";
    } else if (host === "vimeo.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      id = parts.find((part) => /^\d+$/.test(part)) ?? "";
    }
    if (!/^\d{6,12}$/.test(id)) return null;
    return `https://player.vimeo.com/video/${id}`;
  } catch {
    return null;
  }
}

export function googleSlidesEmbedSrc(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "docs.google.com") return null;
    const match = parsed.pathname.match(/^\/presentation\/d\/([^/]+)/);
    const id = match?.[1]?.trim();
    if (!id) return null;
    return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/embed?start=false&loop=false&delayms=3000`;
  } catch {
    return null;
  }
}

export function isDirectVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function isPresentationMime(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  if (
    mime === "application/pdf" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.oasis.opendocument.presentation"
  ) {
    return true;
  }
  return /\.(pdf|ppt|pptx|odp)$/i.test(name);
}

export function guessFaqPresentationExt(mimeType: string, fileName: string): string {
  const fromName = fileName.match(/\.(pdf|ppt|pptx|odp)$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("opendocument.presentation")) return ".odp";
  if (mime.includes("presentationml")) return ".pptx";
  if (mime.includes("ms-powerpoint")) return ".ppt";
  return ".bin";
}

export function resolveFaqPresentationMime(file: File): string {
  const t = (file.type || "").trim();
  if (t) return t;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (name.endsWith(".odp")) return "application/vnd.oasis.opendocument.presentation";
  return "application/octet-stream";
}
