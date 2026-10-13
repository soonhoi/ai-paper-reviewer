import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseReview, reviewPaper } from "../src/reviewerAgent.js";
import { finalReview } from "./metaFixtures.js";

const ratings = ["novelty", "technicalSoundness", "experimentalQuality", "clarity", "practicalSignificance", "reviewerConfidence"];
const lists = ["strengths", "weaknesses", "unsupportedClaims", "missingExperiments", "questionsForAuthors", "criticalIssues"];
const review = {
  overallAssessment: "검증용 평가",
  ...Object.fromEntries(ratings.map((key) => [key, { score: 7, reason: "검증용 근거" }])),
  ...Object.fromEntries(lists.map((key) => [key, []])),
  summaryDisagreements: [],
};
const analysis = Object.fromEntries([
  "title", "problem", "objective", "keyIdea", "method", "experiments", "results", "relatedWorkDifference",
  "contributions", "limitations", "oneSentenceSummary",
].map((key) => [key, ["contributions", "limitations"].includes(key) ? ["검증용"] : "검증용"]));

function reply(text, status = "completed", content) {
  return new Response(JSON.stringify({
    id: "resp_test", object: "response", status,
    output: [{ type: "message", role: "assistant", content: content || [{ type: "output_text", text, annotations: [] }] }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("review structure, scores, and disagreements are validated", () => {
  assert.deepEqual(parseReview(JSON.stringify(review)), review);
  for (const field of ratings) {
    for (const score of [0, 11, 1.5, "7"]) {
      assert.throws(() => parseReview(JSON.stringify({ ...review, [field]: { score, reason: "근거" } })), /1~10/);
    }
    for (const score of [1, 10]) {
      assert.equal(parseReview(JSON.stringify({ ...review, [field]: { score, reason: "근거" } }))[field].score, score);
    }
  }
  assert.throws(() => parseReview("invalid"), /JSON/);
  assert.throws(() => parseReview(JSON.stringify({ ...review, strengths: "invalid" })), /strengths/);
  assert.throws(() => parseReview(JSON.stringify({ ...review, summaryDisagreements: [{ summaryClaim: "x" }] })), /summaryDisagreements/);
});

test("review request includes both sources and handles API, parsing, and response failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.deepEqual(JSON.parse(request.input[0].content), { paperText: "original paper", structuredAnalysis: analysis });
      assert.equal(request.text.format.schema.properties.novelty.properties.score.maximum, 10);
      return reply(JSON.stringify(review));
    };
    assert.deepEqual(await reviewPaper("original paper", analysis), review);
    globalThis.fetch = async () => reply("invalid");
    await assert.rejects(reviewPaper("paper", analysis), /JSON 파싱/);
    globalThis.fetch = async () => reply("", "incomplete");
    await assert.rejects(reviewPaper("paper", analysis), /완료되지/);
    globalThis.fetch = async () => reply("", "completed", [{ type: "refusal", refusal: "test refusal" }]);
    await assert.rejects(reviewPaper("paper", analysis), /test refusal/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "test API failure" } }), {
      status: 400, headers: { "content-type": "application/json" },
    });
    await assert.rejects(reviewPaper("paper", analysis), /API 호출 실패/);
    await assert.rejects(reviewPaper("paper", {}), /입력 오류/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("pipeline preserves save order and reports review/debate save failures", () => {
  for (const failSave of [null, "review.json", "debate.json", "finalReview.json"]) {
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const analysis = ${JSON.stringify(analysis)};
      const review = ${JSON.stringify(review)};
      const finalReview = ${JSON.stringify(finalReview)};
      const defense = { overallDefense:'test', responses:[], strongestContributions:[], reviewerPointsAccepted:[], reviewerPointsChallenged:[], additionalStrengths:[], authorPerspective:'test', defenseConfidence:{score:5,reason:'test'} };
      const events = [];
      process.env.OPENAI_API_KEY = 'test-only';
      globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        if (String(_url).includes('/embeddings')) return new Response(JSON.stringify({data:request.input.map((text,index)=>({index,embedding:[1,1]}))}),{status:200,headers:{'content-type':'application/json'}});
        const isReview = request.text.format.name === 'paper_review';
        const isAdvocate = request.text.format.name === 'paper_advocate';
        const isMeta = request.text.format.name === 'paper_final_review';
        if (isReview || isAdvocate || isMeta) {
          const input = JSON.parse(request.input[0].content);
          assert.equal(input.paperText, undefined);
          assert.ok(input.evidenceContext.evidence.includes('[EVIDENCE chunk-'));
          assert.ok(request.instructions.includes('RAG'));
        }
        if (isMeta) assert.ok(events.includes('debate.json'));
        if (isAdvocate) assert.ok(events.includes('review.json'));
        if (isReview) {
          assert.ok(events.includes('analysis.json'));
          assert.ok(JSON.parse(request.input[0].content).evidenceContext.evidence.length > 0);
          assert.equal(JSON.parse(request.input[0].content).paperText, undefined);
        }
        events.push(isMeta ? 'meta API' : isAdvocate ? 'advocate API' : isReview ? 'review API' : 'summary API');
        return new Response(JSON.stringify({ id:'resp_test', object:'response', status:'completed', output:[
          {type:'message', role:'assistant', content:[{type:'output_text', text:JSON.stringify(isMeta ? finalReview : isAdvocate ? defense : isReview ? review : analysis), annotations:[]}]}
        ]}), {status:200, headers:{'content-type':'application/json'}});
      };
      fs.promises.mkdir = async (_path, options) => assert.equal(options.recursive, true);
      fs.promises.readFile = async () => { const error = new Error('missing'); error.code='ENOENT'; throw error; };
      fs.promises.rename = async () => {};
      fs.promises.writeFile = async (path, content, encoding) => {
        assert.equal(encoding, 'utf8');
        assert.ok(content.includes('\\n  "'));
        const name = typeof path === 'string' ? path.replaceAll('\\\\','/').split('/').at(-1) : path.pathname.split('/').at(-1);
        if (name.includes('paperIndex.json') || name === 'retrievalTest.json') return;
        if (name === ${JSON.stringify(failSave)}) throw new Error('test disk failure');
        if (name === 'debate.json') assert.deepEqual(JSON.parse(content).debates, []);
        else assert.deepEqual(JSON.parse(content), name === 'finalReview.json' ? finalReview : name === 'advocate.json' ? defense : name === 'review.json' ? review : analysis);
        events.push(name);
      };
      syncBuiltinESMExports();
      await import('./src/index.js');
      process.on('beforeExit', () => assert.deepEqual(events, ${JSON.stringify(failSave === "review.json"
        ? ["summary API", "analysis.json", "review API"]
        : failSave === "debate.json" ? ["summary API", "analysis.json", "review API", "review.json", "advocate API", "advocate.json"]
        : failSave === "finalReview.json" ? ["summary API", "analysis.json", "review API", "review.json", "advocate API", "advocate.json", "debate.json", "meta API"]
        : ["summary API", "analysis.json", "review API", "review.json", "advocate API", "advocate.json", "debate.json", "meta API", "finalReview.json"])}));
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: new URL("../", import.meta.url), encoding: "utf8",
    });
    assert.equal(result.status, failSave ? 1 : 0, result.stderr);
    assert.match(failSave ? result.stderr : result.stdout,
      failSave === "review.json" ? /Reviewer 파일 저장 실패/ : failSave === "debate.json" ? /Debate 파일 저장 실패/ : failSave === "finalReview.json" ? /Meta-Reviewer 파일 저장 실패/ : /Final Assessment/);
  }
});
