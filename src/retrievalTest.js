import { writeFile } from "node:fs/promises";
import { retrieveEvidenceQueries, formatEvidence } from "./evidenceRetriever.js";
export const TEST_QUERIES = [
  "What is the main contribution of this paper?", "What baselines are used in the experiments?",
  "Does the paper include an ablation study?", "What scalability experiments were performed?", "What limitations are discussed?",
];
export async function runRetrievalTest(index, { outputPath = new URL("../output/retrievalTest.json", import.meta.url) } = {}) {
  console.log("\n================================\n       EVIDENCE RETRIEVAL\n================================");
  const queries = await retrieveEvidenceQueries(TEST_QUERIES, index, { topK: 3 });
  for (const { query, results } of queries) console.log(`\nQuery:\n${query}\n\n${formatEvidence(results)}`);
  try { await writeFile(outputPath, `${JSON.stringify({ queries }, null, 2)}\n`, "utf8"); }
  catch (error) { throw new Error(`Retrieval Test 저장 실패: ${error.message}`, { cause: error }); }
  return { queries };
}
