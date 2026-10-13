import "dotenv/config";
import { validateUpload, runReviewJob, publicReviewError, UploadError, MAX_PDF_BYTES } from "../../server/reviewPipeline.js";

export const prerender = false;

async function readForm(request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new UploadError("PDF 파일을 업로드해 주세요.");
  const limit = MAX_PDF_BYTES + 1024 * 1024;
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("PDF 파일을 선택해 주세요.");
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new UploadError("PDF 파일은 20 MB 이하로 업로드해 주세요."); }
    chunks.push(value);
  }
  try { return await new Response(new Blob(chunks), { headers: { "content-type": request.headers.get("content-type") } }).formData(); }
  catch { throw new UploadError("업로드 요청 형식이 올바르지 않습니다."); }
}

export async function POST({ request }) {
  let language = "ko", file, buffer;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 403 });
  try {
    const form = await readForm(request);
    language = form.get("language") || "ko";
    file = form.get("file");
    buffer = await validateUpload(file, language);
  } catch (error) {
    return Response.json({ error: publicReviewError(error, language) }, { status: 400 });
  }
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); };
      runReviewJob({ buffer, filename: file.name, language, onProgress: send })
        .then((result) => send({ type: "result", result }))
        .catch((error) => {
          console.error("[Paper review failed]", error);
          send({ type: "error", message: publicReviewError(error, language) });
        })
        .finally(() => { if (!closed) { closed = true; controller.close(); } });
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
