/**
 * Client-safe document constants shared by the upload UI and the server.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_UPLOAD = 5;

export type DocumentKind = "pdf" | "docx" | "text" | "image";

type AcceptedType = {
  mime: string[];
  extensions: string[];
  kind: DocumentKind;
  label: string;
};

export const ACCEPTED_TYPES: AcceptedType[] = [
  { mime: ["application/pdf"], extensions: [".pdf"], kind: "pdf", label: "PDF" },
  {
    mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    extensions: [".docx"],
    kind: "docx",
    label: "Word (DOCX)",
  },
  {
    mime: ["text/plain", "text/markdown", "text/csv", "application/json"],
    extensions: [".txt", ".md", ".csv", ".json"],
    kind: "text",
    label: "Text",
  },
  {
    mime: ["image/png", "image/jpeg", "image/webp"],
    extensions: [".png", ".jpg", ".jpeg", ".webp"],
    kind: "image",
    label: "Scan / Image",
  },
];

export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.flatMap((t) => [...t.mime, ...t.extensions]).join(",");

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

export function detectKind(fileName: string, mimeType: string): DocumentKind | null {
  const ext = extensionOf(fileName);
  const match = ACCEPTED_TYPES.find(
    (t) => t.mime.includes(mimeType.toLowerCase()) || t.extensions.includes(ext),
  );
  return match?.kind ?? null;
}

export function validateFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_FILE_BYTES)}.`;
  }
  if (!detectKind(file.name, file.type)) {
    return `"${file.name}" is not a supported file type. Use PDF, DOCX, TXT/MD/CSV or PNG/JPG/WEBP.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "document";
}
