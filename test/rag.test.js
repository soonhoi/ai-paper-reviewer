import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkText } from "../src/chunker.js";
import { embedTexts } from "../src/embeddingService.js";
import { buildPaperIndex } from "../src/vectorStore.js";
import { cosineSimilarity, retrieveEvidence, formatEvidence } from "../src/evidenceRetriever.js";

test("chunk offsets, overlap, boundaries and vector edge cases", () => {
  const text = ("Paragraph sentence. ".repeat(100) + "\n\n").repeat(5);
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  chunks.forEach((chunk,i) => {
    assert.equal(chunk.text,text.slice(chunk.startChar,chunk.endChar));
    assert.ok(chunk.text.length <= 2200);
    if (i) assert.equal(chunks[i-1].endChar-chunk.startChar,300);
  });
  assert.equal(chunks.at(-1).endChar,text.length);
  assert.throws(()=>chunkText(""));
  assert.throws(()=>chunkText("abc",{size:2,overlap:3}));
  assert.equal(cosineSimilarity([1,0],[1,0]),1);
  assert.equal(cosineSimilarity([1,0],[0,1]),0);
  assert.equal(cosineSimilarity([1,0],[-1,0]),-1);
  for (const vector of [[NaN,1],[0,0],[1]]) assert.throws(()=>cosineSimilarity([1,0],vector));
});

test("batched embeddings, UTF-8 index cache, invalidation and retrieval", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  const directory = await mkdtemp(join(tmpdir(),"paper-rag-"));
  const indexPath = join(directory,"paperIndex.json");
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: request.input.map((text,index)=>({index,embedding:text.includes('baseline') ? [1,0] : [0,1]})).reverse() }),{status:200,headers:{'content-type':'application/json'}});
  };
  try {
    assert.deepEqual(await embedTexts(["baseline","other"],{batchSize:1}),[[1,0],[0,1]]);
    const source = "baseline ".repeat(400)+"\n\n"+"limitations ".repeat(400);
    const index = await buildPaperIndex(source,"sample.pdf",{indexPath});
    assert.equal(JSON.parse(await readFile(indexPath,"utf8")).chunkCount,index.chunkCount);
    const before = calls;
    const cached = await buildPaperIndex(source,"sample.pdf",{indexPath});
    assert.equal(calls,before);
    assert.deepEqual(cached,index);
    const results = await retrieveEvidence("baseline",cached,{topK:2});
    assert.equal(results.length,2);
    assert.equal(results[0].score,1);
    assert.match(formatEvidence(results),/\[EVIDENCE chunk-/);
    const after = calls;
    await retrieveEvidence("baseline",cached);
    assert.equal(calls,after);
    await buildPaperIndex(source+" changed","sample.pdf",{indexPath});
    assert.ok(calls>after);
    globalThis.fetch = async ()=>new Response(JSON.stringify({error:{message:"test error"}}),{status:400,headers:{'content-type':'application/json'}});
    await assert.rejects(embedTexts(["text"]),/Embeddings API 실패/);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=originalKey;
    await rm(directory,{recursive:true,force:true});
  }
});
