import test from "node:test";
import assert from "node:assert/strict";
import { runDebate } from "../src/debateManager.js";

const analysis = Object.fromEntries([
  "title", "problem", "objective", "keyIdea", "method", "experiments", "results", "relatedWorkDifference",
  "contributions", "limitations", "oneSentenceSummary",
].map((key) => [key, ["contributions", "limitations"].includes(key) ? ["test"] : "test"]));
const review = {
  overallAssessment: "test",
  ...Object.fromEntries(["novelty", "technicalSoundness", "experimentalQuality", "clarity", "practicalSignificance", "reviewerConfidence"].map((key) => [key, { score: 7, reason: "test" }])),
  strengths: [], weaknesses: ["same concern"], unsupportedClaims: [], missingExperiments: [],
  questionsForAuthors: [], criticalIssues: ["same concern"], summaryDisagreements: [],
};
const advocate = {
  overallDefense: "test", responses: [{ reviewerIssue: "same concern", responseType: "ACCEPTED", advocateResponse: "test", evidence: [], remainingConcern: "test" }],
  strongestContributions: [], reviewerPointsAccepted: [], reviewerPointsChallenged: [], additionalStrengths: [],
  authorPerspective: "test", defenseConfidence: { score: 5, reason: "test" },
};
const first = { issues: [{ sourceIds: ["source-1"], issue: "same concern", category: "criticalIssues", statement: "initial concern", evidence: [] }] };
const second = { responses: [{ id: "issue-1", statement: "cannot defend", evidence: [] }] };
const final = { responses: [{ id: "issue-1", statement: "concern remains", evidence: [], resolution: "UNRESOLVED",
  resolutionReason: "insufficient evidence", remainingConcern: "new experiment needed", confidence: 4 }], overallDebateSummary: "unresolved" };

function reply(value) {
  return new Response(JSON.stringify({ id: "resp_test", object: "response", status: "completed", output: [
    { type: "message", role: "assistant", content: [{ type: "output_text", text: typeof value === "string" ? value : JSON.stringify(value), annotations: [] }] },
  ] }), { status: 200, headers: { "content-type": "application/json" } });
}

test("sequential three-round debate deduplicates sources and passes prior turns", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only";
  try {
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      const input = JSON.parse(request.input[0].content);
      assert.equal(input.paperText, undefined);
      assert.ok(input.evidenceContext.evidence.includes('[EVIDENCE chunk-0001'));
      assert.equal(input.candidates.length, 1);
      assert.equal(request.text.format.name, `debate_round_${calls + 1}`);
      if (calls > 0) assert.equal(input.debates[0].rounds.length, calls);
      return reply([first, second, final][calls++]);
    };
    const responseFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => String(url).includes('/embeddings')
      ? new Response(JSON.stringify({data:[{index:0,embedding:[1,0]}]}),{status:200,headers:{'content-type':'application/json'}})
      : responseFetch(url, options);
    const paperIndex = {embeddingModel:'test',chunkCount:1,chunks:[{id:'chunk-0001',text:'evidence',startChar:0,endChar:8,embedding:[1,0]}]};
    const result = await runDebate("original paper", analysis, review, advocate, {paperIndex});
    assert.equal(calls, 3);
    assert.deepEqual(result.debates[0].rounds.map((turn) => turn.speaker), ["REVIEWER", "ADVOCATE", "REVIEWER"]);
    assert.deepEqual(result.unresolvedIssues, ["same concern"]);
    assert.deepEqual(result.resolvedIssues, []);

    for (const malformed of ["invalid", { issues: [] }, { issues: [first.issues[0], first.issues[0]] }]) {
      globalThis.fetch = async () => reply(malformed);
      await assert.rejects(runDebate("paper", analysis, review, advocate), /JSON 파싱\/검증/);
    }
    for (const invalidFinal of [
      { ...final, responses: [] },
      { ...final, responses: [{ ...final.responses[0], confidence: 11 }] },
      { ...final, responses: [{ ...final.responses[0], resolution: "INVALID" }] },
      { ...final, responses: [{ ...final.responses[0], resolution: "RESOLVED" }] },
    ]) {
      calls = 0;
      globalThis.fetch = async () => reply([first, second, invalidFinal][calls++]);
      await assert.rejects(runDebate("paper", analysis, review, advocate), /JSON 파싱\/검증/);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "test error" } }), {
      status: 400, headers: { "content-type": "application/json" },
    });
    await assert.rejects(runDebate("paper", analysis, review, advocate), /API 호출 실패/);
    await assert.rejects(runDebate("paper", analysis, {}, advocate), /입력 구조 오류/);
    await assert.rejects(runDebate("paper", analysis, review, {}), /입력 구조 오류/);
    const emptyReview = { ...review, weaknesses: [], criticalIssues: [] };
    globalThis.fetch = async () => { throw new Error("must not call API"); };
    const empty = await runDebate("paper", analysis, emptyReview, { ...advocate, responses: [] });
    assert.deepEqual(empty.debates, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
