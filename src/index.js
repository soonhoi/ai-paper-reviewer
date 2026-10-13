import "dotenv/config";
import { buildPaperIndex } from "./vectorStore.js";
import { runRetrievalTest } from "./retrievalTest.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readPDF } from "./pdfReader.js";
import { summarizePaper } from "./summaryAgent.js";
import { reviewPaper } from "./reviewerAgent.js";
import { advocatePaper } from "./advocateAgent.js";
import { runDebate } from "./debateManager.js";
import { metaReviewPaper } from "./metaReviewerAgent.js";

const sections = [
  ["title", "논문 제목"], ["problem", "연구 배경과 문제 정의"],
  ["objective", "연구 목적"], ["keyIdea", "핵심 아이디어"],
  ["method", "제안 방법"], ["experiments", "실험 방법"],
  ["results", "주요 결과"], ["relatedWorkDifference", "기존 연구와의 차이"],
  ["contributions", "핵심 기여"], ["limitations", "한계"],
  ["oneSentenceSummary", "한 문장 요약"],
];

async function main() {
  const pdfPath = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || fileURLToPath(new URL("../papers/sdf_paper_1.pdf", import.meta.url));
  console.log(`PDF 읽는 중: ${pdfPath}`);
  let paper;
  try {
    paper = await readPDF(pdfPath);
    if (!paper.text?.trim()) throw new Error("PDF에서 텍스트를 추출하지 못했습니다.");
  } catch (error) {
    throw new Error(`PDF 읽기 실패: ${error.message}`, { cause: error });
  }
  console.log(`PDF 읽기 완료 (${paper.pages}페이지)\n`);
  const paperIndex = await buildPaperIndex(paper.text, pdfPath);
  await runRetrievalTest(paperIndex);
  if (process.argv.includes("--retrieval-only")) return;
  console.log("논문 분석 중...");
  const analysis = await summarizePaper(paper.text);
  console.log("\n================================");
  console.log("         논문 분석 결과");
  console.log("================================");
  for (const [key, label] of sections) {
    console.log(`\n[${label}]`);
    const value = analysis[key];
    console.log(Array.isArray(value) ? value.map((item, index) => `${index + 1}. ${item}`).join("\n") : value);
  }
  const outputDir = new URL("../output/", import.meta.url);
  const outputFile = new URL("analysis.json", outputDir);
  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputFile, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new Error(`파일 저장 실패: ${error.message}`, { cause: error });
  }
  console.log(`\n분석 결과 저장 완료: ${fileURLToPath(outputFile)}`);

  console.log("\nCritical Reviewer Agent 검토 중...");
  const review = await reviewPaper(paper.text, analysis, { paperIndex });
  const reviewFile = new URL("review.json", outputDir);
  try {
    await writeFile(reviewFile, `${JSON.stringify(review, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new Error(`Reviewer 파일 저장 실패: ${error.message}`, { cause: error });
  }
  console.log(`검토 결과 저장 완료: ${fileURLToPath(reviewFile)}`);
  console.log("\n================================");
  console.log("     Critical Reviewer 결과");
  console.log("================================");
  console.log(`\n[Overall Assessment]\n${review.overallAssessment}`);
  for (const [key, label] of [
    ["novelty", "Novelty"],
    ["technicalSoundness", "Technical Soundness"],
    ["experimentalQuality", "Experimental Quality"],
    ["reviewerConfidence", "Reviewer Confidence"],
  ]) {
    console.log(`\n[${label}] ${review[key].score}/10\n${review[key].reason}`);
  }
  for (const [key, label] of [
    ["strengths", "Strengths"], ["weaknesses", "Weaknesses"], ["criticalIssues", "Critical Issues"],
  ]) {
    console.log(`\n[${label}]`);
    console.log(review[key].length
      ? review[key].map((item, index) => `${index + 1}. ${item}`).join("\n")
      : "발견된 항목 없음 (근거의 한계는 Overall Assessment 참조)");
  }
  console.log("\nAdvocate Agent 검토 중...");
  const defense = await advocatePaper(paper.text, analysis, review, { paperIndex });
  const advocateFile = new URL("advocate.json", outputDir);
  try {
    await writeFile(advocateFile, `${JSON.stringify(defense, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new Error(`Advocate 파일 저장 실패: ${error.message}`, { cause: error });
  }
  console.log(`옹호 검토 결과 저장 완료: ${fileURLToPath(advocateFile)}`);
  console.log(`\n[Overall Defense]\n${defense.overallDefense}`);
  console.log(`\n[Defense Confidence] ${defense.defenseConfidence.score}/10\n${defense.defenseConfidence.reason}`);
  for (const response of defense.responses) {
    console.log(`\n[${response.responseType}] ${response.reviewerIssue}\n${response.advocateResponse}`);
    console.log(`근거: ${response.evidence.join("; ") || "논문에서 명확히 확인되지 않음"}`);
    console.log(`남은 우려: ${response.remainingConcern}`);
  }
  console.log("\nDebate Manager 토론 중 (최대 3라운드)...");
  const debate = await runDebate(paper.text, analysis, review, defense, { paperIndex });
  const debateFile = new URL("debate.json", outputDir);
  try {
    await writeFile(debateFile, `${JSON.stringify(debate, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new Error(`Debate 파일 저장 실패: ${error.message}`, { cause: error });
  }
  console.log(`토론 결과 저장 완료: ${fileURLToPath(debateFile)}`);
  console.log(`\n전체 debate issue 수: ${debate.debates.length}`);
  console.log(`RESOLVED: ${debate.resolvedIssues.length}`);
  console.log(`PARTIALLY_RESOLVED: ${debate.partiallyResolvedIssues.length}`);
  console.log(`UNRESOLVED: ${debate.unresolvedIssues.length}`);
  console.log("\n[Unresolved Issues]");
  console.log(debate.unresolvedIssues.map((issue, index) => `${index + 1}. ${issue}`).join("\n") || "없음");
  console.log(`\n[Overall Debate Summary]\n${debate.overallDebateSummary}`);
  console.log("\nMeta-Reviewer Agent 최종 평가 중...");
  const finalReview = await metaReviewPaper(paper.text, analysis, review, defense, debate, { paperIndex });
  const finalFile = new URL("finalReview.json", outputDir);
  try {
    await writeFile(finalFile, `${JSON.stringify(finalReview, null, 2)}\n`, "utf8");
  } catch (error) {
    throw new Error(`Meta-Reviewer 파일 저장 실패: ${error.message}`, { cause: error });
  }
  console.log("\n================================\n          최종 학술 평가\n================================");
  console.log(`\nPaper:\n${finalReview.paperTitle}`);
  console.log(`\nVerdict:\n${finalReview.finalVerdict}`);
  console.log(`\nOverall Score:\n${finalReview.scores.overall}/10`);
  console.log(`\nMeta-Reviewer Confidence:\n${finalReview.metaReviewerConfidence.score}/10`);
  for (const [key, label] of [["keyStrengths", "Key Strengths"], ["keyWeaknesses", "Key Weaknesses"],
    ["remainingConcerns", "Remaining Concerns"], ["criticalBlockingIssues", "Critical Blocking Issues"]]) {
    console.log(`\n${label}:`);
    console.log(finalReview[key].map((item) => `- ${item}`).join("\n") || "- 없음");
  }
  console.log(`\nFinal Assessment:\n${finalReview.verdictReason}`);
  console.log("\n생성된 파일:");
  for (const name of ["paperIndex.json", "retrievalTest.json", "analysis.json", "review.json", "advocate.json", "debate.json", "finalReview.json"]) {
    console.log(`- output/${name}`);
  }
}

main().catch((error) => {
  console.error(`\n오류: ${error.message}`);
  process.exitCode = 1;
});
