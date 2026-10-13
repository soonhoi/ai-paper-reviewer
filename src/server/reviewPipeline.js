import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { readPDF } from "../pdfReader.js";
import { buildPaperIndex } from "../vectorStore.js";
import { summarizePaper } from "../summaryAgent.js";
import { reviewPaper } from "../reviewerAgent.js";
import { advocatePaper } from "../advocateAgent.js";
import { runDebate } from "../debateManager.js";
import { metaReviewPaper } from "../metaReviewerAgent.js";
import { getLanguageInstruction } from "../utils/language.js";

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export class UploadError extends Error {}

export async function validateUpload(file, language) {
  if (!["ko", "en"].includes(language)) throw new UploadError("리뷰 언어는 한국어 또는 English를 선택해 주세요.");
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) throw new UploadError("PDF 파일을 선택해 주세요.");
  if (!/\.pdf$/i.test(file.name || "") || (file.type && !["application/pdf", "application/octet-stream"].includes(file.type))) {
    throw new UploadError("PDF 파일만 업로드할 수 있습니다.");
  }
  if (file.size > MAX_PDF_BYTES) throw new UploadError("PDF 파일은 20 MB 이하로 업로드해 주세요.");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_PDF_BYTES || !buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new UploadError("올바른 PDF 파일을 업로드해 주세요.");
  return buffer;
}

export function publicReviewError(error, language = "ko") {
  if (error instanceof UploadError) return error.message;
  const english = language === "en";
  if (/PDF|텍스트를 추출/.test(error.message)) return english ? "Could not extract paper text. Please upload a readable, unencrypted PDF." : "논문 텍스트를 읽지 못했습니다. 텍스트가 포함된 암호화되지 않은 PDF를 업로드해 주세요.";
  if (/Embedding|Embeddings/.test(error.message)) return english ? "Paper indexing failed. Please try again later." : "논문 인덱스를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  if (/JSON|검증/.test(error.message)) return english ? "The AI returned an invalid result. Please try again." : "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.";
  if (/API/.test(error.message)) return english ? "The AI service could not complete the review. Please try again later." : "AI 서비스 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  return english ? "Paper review failed. Please try again later." : "논문 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function runReviewJob({ buffer, sourcePath, openai, filename, language = "ko", onProgress = () => {},
  workRoot = process.env.REVIEW_WORK_ROOT || resolve("work"), keepUpload = process.env.KEEP_UPLOADS !== "false" },
  services = { readPDF, buildPaperIndex, summarizePaper, reviewPaper, advocatePaper, runDebate, metaReviewPaper }) {
  getLanguageInstruction(language);
  const jobId = randomUUID();
  const directory = join(workRoot, jobId);
  await mkdir(directory, { recursive: true });
  const pdfPath = sourcePath || join(directory, "paper.pdf");
  const save = async (name, value) => {
    try { await writeFile(join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
    catch (error) { throw new Error(`파일 저장 실패 (${name}): ${error.message}`, { cause: error }); }
  };
  const step = async (stage, task) => {
    onProgress({ type: "progress", jobId, stage, state: "running" });
    try {
      const result = await task();
      onProgress({ type: "progress", jobId, stage, state: "done" });
      return result;
    } catch (error) {
      onProgress({ type: "progress", jobId, stage, state: "failed" });
      throw error;
    }
  };
  try {
    if (!sourcePath) await writeFile(pdfPath, buffer);
    const paper = await step("pdf", async () => {
      const result = await services.readPDF(pdfPath);
      if (!result.text?.trim()) throw new Error("PDF에서 텍스트를 추출하지 못했습니다.");
      return result;
    });
    const paperIndex = await step("index", () => services.buildPaperIndex(paper.text, pdfPath, { indexPath: join(directory, "paperIndex.json"), openai }));
    const options = { language, paperIndex, openai };
    const analysis = await step("summary", async () => {
      const result = await services.summarizePaper(paper.text, { language, openai }); await save("analysis.json", result); return result;
    });
    const review = await step("review", async () => {
      const result = await services.reviewPaper(paper.text, analysis, options); await save("review.json", result); return result;
    });
    const advocate = await step("advocate", async () => {
      const result = await services.advocatePaper(paper.text, analysis, review, options); await save("advocate.json", result); return result;
    });
    const debate = await step("debate", async () => {
      const result = await services.runDebate(paper.text, analysis, review, advocate, options); await save("debate.json", result); return result;
    });
    const finalReview = await step("final", async () => {
      const result = await services.metaReviewPaper(paper.text, analysis, review, advocate, debate, options); await save("finalReview.json", result); return result;
    });
    const fullReview = { paper: { filename, pages: paper.pages, jobId }, language, analysis, review, advocate, debate, finalReview };
    await save("fullReview.json", fullReview);
    return fullReview;
  } finally {
    if (!sourcePath && !keepUpload) await unlink(pdfPath).catch(() => {});
  }
}
