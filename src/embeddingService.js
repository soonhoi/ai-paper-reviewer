import OpenAI from "openai";

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
export const EMBEDDING_BATCH_SIZE = 32;

export function validateVector(vector, dimension) {
  if (!Array.isArray(vector) || !vector.length || vector.some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
      (dimension !== undefined && vector.length !== dimension) || !vector.some((n) => n !== 0)) {
    throw new Error("Embedding vector 오류: NaN, 빈/영 벡터 또는 길이 불일치입니다.");
  }
}

export async function embedTexts(texts, { model = EMBEDDING_MODEL, batchSize = EMBEDDING_BATCH_SIZE, openai } = {}) {
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== "string" || !t.trim())) throw new Error("Embedding 입력 오류: 텍스트 배열이 필요합니다.");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 32) throw new Error("Embedding batchSize는 1~32 정수여야 합니다.");
  if (!texts.length) return [];
  try {
    const client = openai || new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const vectors = [];
    for (let offset = 0; offset < texts.length; offset += batchSize) {
      const batch = texts.slice(offset, offset + batchSize);
      const response = await client.embeddings.create({ model, input: batch, encoding_format: "float" });
      if (!Array.isArray(response.data) || response.data.length !== batch.length) throw new Error("Embedding 응답 개수가 일치하지 않습니다.");
      const ordered = [...response.data].sort((a, b) => a.index - b.index);
      ordered.forEach((item, index) => {
        if (item.index !== index) throw new Error("Embedding 응답 index가 잘못되었습니다.");
        validateVector(item.embedding, vectors[0]?.length);
        vectors.push(item.embedding);
      });
    }
    return vectors;
  } catch (error) { throw new Error(`OpenAI Embeddings API 실패: ${error.message}`, { cause: error }); }
}

export async function embedChunks(chunks, options) {
  const vectors = await embedTexts(chunks.map((chunk) => chunk.text), options);
  return chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] }));
}
