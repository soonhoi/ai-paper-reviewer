import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkText, CHUNK_SIZE, CHUNK_OVERLAP, CHUNK_MIN_SIZE, CHUNKER_VERSION } from "./chunker.js";
import { embedChunks, EMBEDDING_MODEL, validateVector } from "./embeddingService.js";

export function validatePaperIndex(index) {
  if (!index || typeof index.embeddingModel !== "string" || !index.embeddingModel.trim() || !Array.isArray(index.chunks) ||
      !index.chunks.length || index.chunkCount !== index.chunks.length) throw new Error("Paper Index 구조 오류");
  const ids = new Set();
  for (const chunk of index.chunks) {
    if (typeof chunk.id !== "string" || !chunk.id || ids.has(chunk.id) || typeof chunk.text !== "string" || !chunk.text.trim() ||
        !Number.isInteger(chunk.startChar) || !Number.isInteger(chunk.endChar) || chunk.startChar < 0 || chunk.endChar <= chunk.startChar ||
        chunk.text.length !== chunk.endChar - chunk.startChar) throw new Error("Paper Index chunk 오류");
    ids.add(chunk.id);
    validateVector(chunk.embedding, index.chunks[0].embedding?.length);
  }
  return index;
}

export async function buildPaperIndex(paperText, paperPath, { indexPath = new URL("../output/paperIndex.json", import.meta.url), model = EMBEDDING_MODEL, openai } = {}) {
  const chunks = chunkText(paperText);
  const textHash = createHash("sha256").update(paperText, "utf8").digest("hex");
  const config = { size: CHUNK_SIZE, overlap: CHUNK_OVERLAP, minSize: CHUNK_MIN_SIZE, version: CHUNKER_VERSION };
  const paper = basename(paperPath);
  let cached;
  try { cached = JSON.parse(await readFile(indexPath, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw new Error(`Paper Index 읽기 실패: ${error.message}`, { cause: error });
  }
  if (cached && cached.textHash === textHash && cached.paper === paper && cached.embeddingModel === model && JSON.stringify(cached.chunking) === JSON.stringify(config)) {
    try {
      validatePaperIndex(cached);
      if (cached.chunks.length !== chunks.length || !chunks.every((chunk, i) => Object.keys(chunk).every((key) => cached.chunks[i][key] === chunk[key]))) throw new Error("cache chunk 불일치");
      console.log("Paper index cache found.\nUsing existing embeddings.\n기존 Paper Index 사용");
      return cached;
    } catch { console.log("Paper index cache invalid. 새 index 생성"); }
  }
  console.log("\n================================\n      BUILDING PAPER INDEX\n================================");
  console.log(`Chunks: ${chunks.length}\nEmbedding model: ${model}`);
  const index = { paper, embeddingModel: model, textHash, chunking: config, chunkCount: chunks.length, chunks: await embedChunks(chunks, { model, openai }) };
  validatePaperIndex(index);
  const path = indexPath instanceof URL ? fileURLToPath(indexPath) : indexPath;
  const temp = `${path}.${process.pid}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw new Error(`Paper Index 저장 실패: ${error.message}`, { cause: error });
  }
  console.log(`Index saved:\n${path}`);
  return index;
}
