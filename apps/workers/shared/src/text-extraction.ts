/**
 * Shared document text-extraction helpers.
 *
 * Single source of truth for turning an uploaded document buffer into plain
 * text + RAG chunks. Consumed by BOTH:
 *  - apps/workers/ingestion-worker (TextExtractionProcessor), and
 *  - apps/ai-worker (ingestion-workers.ts queue consumers).
 *
 * Lives in @intelliflow/worker-shared — the lean lib both already depend on —
 * so the logic is shared without the heavy ai-worker barrel (LangChain etc.)
 * leaking into ingestion-worker, and without a circular dependency.
 *
 * pdf-parse / mammoth are imported dynamically so the native parsers load only
 * when a pdf/docx is actually processed.
 *
 * @module @intelliflow/worker-shared/text-extraction
 */

/**
 * Fetch a document from a storage URL into a Buffer.
 * Throws a descriptive error on a non-2xx response.
 */
export async function fetchDocument(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Remove `<tag …>…</tag>` blocks (script/style) from HTML, INCLUDING their text
 * content, using linear index scanning rather than a backtracking regex.
 *
 * Why not regex: a lazy `[\s\S]*?` with an end-of-input alternation is flagged
 * by SonarQube S5852 (super-linear backtracking / ReDoS). This indexOf-based
 * scan is strictly O(n).
 *
 * Robustness:
 *  - An UNCLOSED `<script>…EOF` (no `</script>`) strips through end-of-input, so
 *    the script body can never leak as extracted text.
 *  - `<scriptx>` is left intact (matched only at a real tag boundary).
 */
function stripTagBlocks(input: string, tag: string): string {
  const lower = input.toLowerCase();
  const openLead = `<${tag}`;
  const closeLead = `</${tag}`;
  const boundary = new Set(['>', '/', ' ', '\t', '\n', '\r', '\f']);

  let out = '';
  let cursor = 0;

  while (cursor < input.length) {
    const open = lower.indexOf(openLead, cursor);
    if (open === -1) {
      out += input.slice(cursor);
      break;
    }

    const charAfterName = lower[open + openLead.length];
    // Not a real tag boundary (e.g. `<scriptx`) — keep `<` and rescan after it.
    if (charAfterName !== undefined && !boundary.has(charAfterName)) {
      out += input.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    // Text before the opening tag is preserved.
    out += input.slice(cursor, open);

    const openTagEnd = input.indexOf('>', open + openLead.length);
    if (openTagEnd === -1) {
      // Malformed open tag with no '>' — drop the remainder.
      break;
    }

    const close = lower.indexOf(closeLead, openTagEnd + 1);
    if (close === -1) {
      // Unclosed block — drop everything through end-of-input.
      break;
    }

    const closeTagEnd = input.indexOf('>', close + closeLead.length);
    if (closeTagEnd === -1) {
      break;
    }

    // Skip the whole `<tag …>…</tag …>` block.
    cursor = closeTagEnd + 1;
  }

  return out;
}

/**
 * Convert raw HTML to plain text: drop script/style blocks (content included),
 * strip remaining tags, and collapse whitespace.
 */
export function htmlToText(html: string): string {
  const withoutBlocks = stripTagBlocks(stripTagBlocks(html, 'script'), 'style');
  return withoutBlocks
    .replaceAll(/<[^>]{0,10000}>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Extract plain text (and best-effort metadata) from a document buffer by
 * format. Unknown formats fall back to a UTF-8 read.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  format: string
): Promise<{ text: string; metadata?: Record<string, unknown> }> {
  switch (format) {
    case 'pdf': {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const textResult = await parser.getText();
      let pageCount: number | undefined;
      try {
        const info = await parser.getInfo();
        pageCount = info.total;
      } catch {
        // getInfo is best-effort
      }
      return { text: textResult.text, metadata: { pages: pageCount } };
    }
    case 'docx': {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value };
    }
    case 'txt':
    case 'md':
    case 'rtf':
      return { text: buffer.toString('utf-8') };
    case 'html':
      return { text: htmlToText(buffer.toString('utf-8')) };
    default:
      // Fall back to plain-text read for unknown formats
      return { text: buffer.toString('utf-8') };
  }
}

/**
 * Split normalized text into overlapping word chunks for RAG indexing.
 */
export function createChunks(text: string, chunkSize = 512, overlap = 64): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length + 1 > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      const overlapWords = Math.ceil(overlap / 5);
      currentChunk = currentChunk.slice(-overlapWords);
      currentLength = currentChunk.join(' ').length;
    }
    currentChunk.push(word);
    currentLength += word.length + 1;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  return chunks;
}
