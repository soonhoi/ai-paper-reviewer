import test from "node:test";
import assert from "node:assert/strict";
import { parseFinalReview, metaReviewPaper } from "../src/metaReviewerAgent.js";
import { parseDebate } from "../src/debateManager.js";
import { finalReview } from "./metaFixtures.js";

test("scores, verdicts and blocking override are validated", () => {
  assert.deepEqual(parseFinalReview(JSON.stringify(finalReview)), finalReview);
  for (const key of Object.keys(finalReview.scores)) {
    for (const value of [0,11,1.5,"7"]) {
      assert.throws(() => parseFinalReview(JSON.stringify({...finalReview,scores:{...finalReview.scores,[key]:value}})), /score/);
    }
  }
  assert.throws(() => parseFinalReview("invalid"), /JSON/);
  assert.throws(() => parseFinalReview(JSON.stringify({...finalReview, finalVerdict:"INVALID"})), /finalVerdict/);
  assert.throws(() => parseFinalReview(JSON.stringify({...finalReview, finalVerdict:"ACCEPT"})), /일치/);
  assert.throws(() => parseFinalReview(JSON.stringify({...finalReview, finalVerdict:"REJECT"})), /일치/);
  assert.equal(parseFinalReview(JSON.stringify({...finalReview, finalVerdict:"REJECT",criticalBlockingIssues:["core error"]})).finalVerdict,"REJECT");
  assert.throws(() => parseFinalReview(JSON.stringify({...finalReview,metaReviewerConfidence:{score:0,reason:"test"}})), /score/);
});

test("debate validation checks rounds, status lists and empty upstream inputs", async () => {
  const item = {issue:"test",category:"criticalIssues",rounds:["REVIEWER","ADVOCATE","REVIEWER"].map(speaker=>({speaker,statement:"test",evidence:[]})),resolution:"UNRESOLVED",resolutionReason:"test",remainingConcern:"test",confidence:5};
  const debate = {debates:[item],resolvedIssues:[],partiallyResolvedIssues:[],unresolvedIssues:["test"],overallDebateSummary:"test"};
  assert.deepEqual(parseDebate(JSON.stringify(debate)),debate);
  assert.throws(()=>parseDebate(JSON.stringify({...debate,unresolvedIssues:[]})),/일치/);
  assert.throws(()=>parseDebate(JSON.stringify({...debate,debates:[{...item,rounds:[]}]})),/라운드/);
  await assert.rejects(metaReviewPaper("paper",{}, {}, {}, {}),/이전 Agent 결과 오류/);
});
