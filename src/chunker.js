export const CHUNK_SIZE = 2200;
export const CHUNK_OVERLAP = 300;
export const CHUNK_MIN_SIZE = 1500;
export const CHUNKER_VERSION = 1;

export function chunkText(text, { size = CHUNK_SIZE, overlap = CHUNK_OVERLAP, minSize = Math.min(CHUNK_MIN_SIZE, size) } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Chunking 실패: 텍스트가 비어 있습니다.");
  if (![size, overlap, minSize].every(Number.isInteger) || size < 2 || overlap < 0 || overlap >= minSize || minSize > size) {
    throw new Error("Chunking 실패: chunk size/overlap 설정이 잘못되었습니다.");
  }
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(start + minSize, end);
      const paragraphs = [...window.matchAll(/\r?\n\s*\r?\n/g)];
      const sentences = [...window.matchAll(/[.!?。！？](?:\s+|$)/g)];
      const boundary = paragraphs.at(-1) || sentences.at(-1);
      if (boundary) end = start + minSize + boundary.index + boundary[0].length;
      else {
        const space = window.search(/\s+\S*$/);
        if (space >= 0) end = start + minSize + space + 1;
      }
    }
    if (text.slice(start, end).trim()) chunks.push({ id: `chunk-${String(chunks.length + 1).padStart(4, "0")}`, text: text.slice(start, end), startChar: start, endChar: end });
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks;
}
