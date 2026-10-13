import test from "node:test";
import assert from "node:assert/strict";
import { parseAdvocate, getReviewerIssues } from "../src/advocateAgent.js";

const review = { weaknesses:["weakness"], unsupportedClaims:["claim"], missingExperiments:["experiment"], criticalIssues:["critical", "weakness"] };
const defense = {
  overallDefense:"test", responses:getReviewerIssues(review).map((reviewerIssue) => ({
    reviewerIssue, responseType:"ACCEPTED", advocateResponse:"test", evidence:[], remainingConcern:"test",
  })),
  strongestContributions:[], reviewerPointsAccepted:[], reviewerPointsChallenged:[], additionalStrengths:[],
  authorPerspective:"test", defenseConfidence:{score:5,reason:"test"},
};

test("all criticism including critical issues must have exactly one response", () => {
  assert.equal(parseAdvocate(JSON.stringify(defense), review).responses.length, 4);
  assert.throws(() => parseAdvocate(JSON.stringify({...defense, responses:defense.responses.slice(0,3)}),review), /누락/);
  assert.throws(() => parseAdvocate(JSON.stringify({...defense, responses:[...defense.responses,defense.responses[0]]}),review), /중복/);
  const changed = structuredClone(defense);
  changed.responses[0].reviewerIssue = "invented criticism";
  assert.throws(() => parseAdvocate(JSON.stringify(changed),review), /원문/);
});

test("response enum, evidence, score, and JSON are validated", () => {
  for (const score of [0,11,1.5,"5"]) {
    assert.throws(() => parseAdvocate(JSON.stringify({...defense,defenseConfidence:{score,reason:"test"}}),review), /정수/);
  }
  for (const responseType of ["REBUTTED","PARTIALLY_REBUTTED","INVALID"]) {
    const changed = structuredClone(defense);
    changed.responses[0].responseType = responseType;
    assert.throws(() => parseAdvocate(JSON.stringify(changed),review));
    if (responseType !== "INVALID") {
      changed.responses[0].evidence = ["Section 2"];
      assert.equal(parseAdvocate(JSON.stringify(changed),review).responses[0].responseType,responseType);
    }
  }
  assert.throws(() => parseAdvocate("invalid",review), /JSON/);
});
