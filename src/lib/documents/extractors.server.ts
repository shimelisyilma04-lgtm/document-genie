/**
 * Modular text-extraction / OCR service.
 *
 * Each supported document kind has an `Extractor`. Adding a new parser or OCR
 * provider means adding one entry to `EXTRACTORS` — the processing pipeline in
 * `documents.functions.ts` does not change.
 *
 * Server-only.
 */

import { strFromU8, unzipSync } from "fflate";

import { detectKind, type DocumentKind } from "./constants";
import type { TextBlock } from "./chunker";
import { getAiProvider, VISION_MODEL } from "../ai/provider.server";

export type ExtractionResult = {
  blocks: TextBlock[];
  pageCount: number | null;
  extractor: string;
  /** Tokens billed to the user when an AI-based extractor (OCR) was used. */
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
};

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export type Extractor = {
  id: string;
  kind: DocumentKind;
  extract(file: { bytes: Uint8Array; name: string; mimeType: string }): Promise<ExtractionResult>;
};

/* ---------------------------------- PDF ---------------------------------- */

const pdfExtractor: Extractor = {
  id: "unpdf-text-layer",
  kind: "pdf",
  async extract({ bytes }) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    let pages: string[] = [];
    let totalPages = 0;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const result = await extractText(pdf, { mergePages: false });
      totalPages = result.totalPages;
      pages = Array.isArray(result.text) ? result.text : [String(result.text)];
    } catch (error) {
      console.error("PDF extraction failed", error);
      throw new ExtractionError("This PDF could not be read. It may be corrupted or password protected.");
    }

    const blocks: TextBlock[] = [];
    pages.forEach((pageText, index) => {
      const normalized = (pageText ?? "").replace(/\r/g, "").trim();
      if (!normalized) return;
      for (const section of splitIntoSections(normalized)) {
        blocks.push({ text: section.text, page: index + 1, heading: section.heading });
      }
    });

    const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
    if (totalChars < 24) {
      throw new ExtractionError(
        "No selectable text was found in this PDF — it looks like a scan. Upload the pages as images (PNG/JPG) so OCR can read them.",
      );
    }

    return { blocks, pageCount: totalPages || pages.length, extractor: pdfExtractor.id };
  },
};

/* ---------------------------------- DOCX --------------------------------- */

const docxExtractor: Extractor = {
  id: "docx-ooxml",
  kind: "docx",
  async extract({ bytes }) {
    let documentXml: string;
    try {
      const files = unzipSync(new Uint8Array(bytes));
      const entry = files["word/document.xml"];
      if (!entry) throw new Error("word/document.xml missing");
      documentXml = strFromU8(entry);
    } catch (error) {
      console.error("DOCX extraction failed", error);
      throw new ExtractionError("This Word file could not be read. Try re-saving it as .docx and upload again.");
    }

    const paragraphs = documentXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const blocks: TextBlock[] = [];
    let currentHeading: string | undefined;

    for (const paragraph of paragraphs) {
      const runs = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
      const text = decodeXml(
        runs.map((run) => run.replace(/<[^>]+>/g, "")).join(""),
      ).replace(/\s+/g, " ").trim();
      if (!text) continue;

      const styleMatch = paragraph.match(/<w:pStyle w:val="([^"]+)"/);
      const style = styleMatch?.[1] ?? "";
      const isHeading = /heading|title|subtitle/i.test(style);

      if (isHeading) {
        currentHeading = text;
        blocks.push({ text, heading: text });
      } else {
        blocks.push({ text, heading: currentHeading });
      }
    }

    if (!blocks.length) {
      throw new ExtractionError("This Word file contains no readable text.");
    }
    return { blocks, pageCount: null, extractor: docxExtractor.id };
  },
};

/* ---------------------------------- TEXT --------------------------------- */

const textExtractor: Extractor = {
  id: "plain-text",
  kind: "text",
  async extract({ bytes }) {
    const content = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\r/g, "");
    if (!content.trim()) throw new ExtractionError("This file is empty.");
    const blocks = splitIntoSections(content).map((section) => ({
      text: section.text,
      heading: section.heading,
    }));
    return { blocks, pageCount: null, extractor: textExtractor.id };
  },
};

/* ------------------------------ IMAGE / OCR ------------------------------ */

const OCR_PROMPT = `You are an OCR engine. Transcribe every piece of text in this image exactly as it appears.
Rules:
- Preserve reading order, line breaks, lists and table rows.
- Prefix a detected section title with "## " on its own line.
- Do not summarise, translate, explain or add commentary.
- If the image contains no legible text, reply with exactly: NO_TEXT_FOUND`;

const imageOcrExtractor: Extractor = {
  id: "lovable-ai-vision-ocr",
  kind: "image",
  async extract({ bytes, mimeType }) {
    const provider = getAiProvider();
    const dataUrl = `data:${mimeType || "image/png"};base64,${toBase64(bytes)}`;

    const result = await provider.chat({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const text = result.text.trim();
    if (!text || text === "NO_TEXT_FOUND") {
      throw new ExtractionError("No readable text was found in this image.");
    }

    const blocks = splitIntoSections(text).map((section) => ({
      text: section.text,
      page: 1,
      heading: section.heading,
    }));

    return {
      blocks,
      pageCount: 1,
      extractor: imageOcrExtractor.id,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      model: result.model,
    };
  },
};

/* -------------------------------- registry ------------------------------- */

const EXTRACTORS: Extractor[] = [pdfExtractor, docxExtractor, textExtractor, imageOcrExtractor];

export function resolveExtractor(fileName: string, mimeType: string): Extractor {
  const kind = detectKind(fileName, mimeType);
  const extractor = kind ? EXTRACTORS.find((e) => e.kind === kind) : undefined;
  if (!extractor) {
    throw new ExtractionError("This file type is not supported.");
  }
  return extractor;
}

/* -------------------------------- helpers -------------------------------- */

/** Splits raw text into paragraph blocks, tracking markdown-ish headings. */
function splitIntoSections(input: string): { text: string; heading?: string }[] {
  const lines = input.split("\n");
  const out: { text: string; heading?: string }[] = [];
  let heading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text) out.push({ text, heading });
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (isHeadingLine(line)) {
      flush();
      heading = line.replace(/^#+\s*/, "").trim();
      out.push({ text: heading, heading });
      continue;
    }
    buffer.push(line);
  }
  flush();
  return out.length ? out : [{ text: input.trim() }];
}

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^#{1,4}\s+\S/.test(trimmed)) return true;
  if (trimmed.length > 80) return false;
  // ALL CAPS or numbered clause headings such as "4.2 Termination"
  if (/^[A-Z0-9][A-Z0-9 ,.&'()/-]{3,79}$/.test(trimmed) && /[A-Z]{3,}/.test(trimmed)) return true;
  if (/^(\d+(\.\d+)*)[.)]?\s+[A-Z][^.]{2,70}$/.test(trimmed)) return true;
  return false;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
