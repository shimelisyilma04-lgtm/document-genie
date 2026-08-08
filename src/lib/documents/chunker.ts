/**
 * Structure-aware chunking.
 *
 * Extractors emit `TextBlock`s that keep page numbers and headings. The chunker
 * groups them into retrieval-sized chunks without losing that structure, so the
 * AI can cite "page 4 — Termination".
 */

export type TextBlock = {
  text: string;
  page?: number | undefined;
  heading?: string | undefined;
};


export type Chunk = {
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  heading: string | null;
  tokenEstimate: number;
};

const TARGET_CHARS = 1400;
const MAX_CHARS = 2200;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function chunkBlocks(blocks: TextBlock[]): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferLength = 0;
  let page: number | null = null;
  let heading: string | null = null;

  const flush = () => {
    const content = buffer.join("\n").trim();
    buffer = [];
    bufferLength = 0;
    if (content.length < 2) return;
    chunks.push({
      chunkIndex: chunks.length,
      content,
      pageNumber: page,
      heading,
      tokenEstimate: estimateTokens(content),
    });
  };

  for (const block of blocks) {
    const text = block.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) continue;

    const blockPage = block.page ?? null;
    const blockHeading = block.heading ?? null;

    if (buffer.length && (blockPage !== page || bufferLength + text.length > MAX_CHARS)) {
      flush();
    }
    if (!buffer.length) {
      page = blockPage;
      heading = blockHeading;
    } else if (!heading && blockHeading) {
      heading = blockHeading;
    }

    if (text.length > MAX_CHARS) {
      for (const piece of splitLongText(text)) {
        if (buffer.length) flush();
        page = blockPage;
        heading = blockHeading;
        buffer.push(piece);
        bufferLength = piece.length;
        flush();
      }
      continue;
    }

    buffer.push(text);
    bufferLength += text.length + 1;
    if (bufferLength >= TARGET_CHARS) flush();
  }
  flush();

  return chunks;
}

function splitLongText(text: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > TARGET_CHARS && current) {
      out.push(current.trim());
      current = "";
    }
    if (sentence.length > MAX_CHARS) {
      for (let i = 0; i < sentence.length; i += TARGET_CHARS) {
        out.push(sentence.slice(i, i + TARGET_CHARS));
      }
      continue;
    }
    current += (current ? " " : "") + sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}'-]+/gu);
  return matches ? matches.length : 0;
}
