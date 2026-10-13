const $ = (id) => document.getElementById(id);
const form = $("review-form"), fileInput = $("file"), dropzone = $("dropzone"), submit = $("submit");
let selectedFile = null, fullReview = null;
const desktop = window.paperReviewer;
let hasKey = false;
async function unwrap(promise) {
  const result = await promise;
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
if (desktop) {
  $("save-pdf").hidden=false;
  $("desktop-controls").hidden = false;
  dropzone.hidden = true;
  $("select-pdf").addEventListener("click", async () => {
    try { const file=await unwrap(desktop.selectPdf()); if(file){selectedFile=file;$("filename").textContent=`Selected file: ${file.name}`;$("error").hidden=true;} }
    catch(error){showError(error.message);}
  });
  unwrap(desktop.hasStoredApiKey()).then(stored=>{
    hasKey=stored;$("remember-key").checked=stored;
    $("key-status").textContent=stored?"저장된 API Key를 사용합니다. 변경하려면 새 Key를 입력하세요.":"API Key는 이 앱의 main process에서만 관리합니다.";
  }).catch(error=>showError(error.message));
  $("delete-key").addEventListener("click",async()=>{
    try { await unwrap(desktop.deleteStoredApiKey()); hasKey=false;$("api-key").value="";$("remember-key").checked=false;$("key-status").textContent="저장된 API Key를 삭제했습니다."; }
    catch(error){showError(error.message);}
  });
  $("clear-data").addEventListener("click",async()=>{
    try { await unwrap(desktop.clearReviewData());fullReview=null;$("save-pdf").disabled=true;$("results").hidden=true;$("status").textContent="작업 데이터를 삭제했습니다."; }
    catch(error){showError(error.message);}
  });
  const unsubscribe=desktop.onProgress(handleEvent);
  window.addEventListener("beforeunload",()=>{unsubscribe();$("api-key").value="";});
  $("download-full").textContent="JSON 저장";
}
const stages = { pdf: "PDF 읽기", index: "논문 인덱스 생성", summary: "논문 요약", review: "Critical Review", advocate: "Author Advocate", debate: "Debate", final: "Final Evaluation" };
function showError(message) { $("error").textContent = message; $("error").hidden = false; }
function selectFile(file) {
  if (submit.disabled) return;
  $("error").hidden = true;
  if (!file || !/\.pdf$/i.test(file.name)) {
    selectedFile = null; fileInput.value = ""; $("filename").textContent = "선택된 파일 없음";
    showError("PDF 파일만 업로드할 수 있습니다."); return;
  }
  if (file.size > 20 * 1024 * 1024) { showError("PDF 파일은 20 MB 이하로 업로드해 주세요."); selectedFile = null; fileInput.value = ""; $("filename").textContent = "선택된 파일 없음"; return; }
  selectedFile = file; $("filename").textContent = `Selected file: ${file.name}`;
}
fileInput.addEventListener("change", () => selectFile(fileInput.files[0]));
for (const event of ["dragenter", "dragover"]) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
for (const event of ["dragleave", "drop"]) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); });
dropzone.addEventListener("drop", (e) => selectFile(e.dataTransfer.files[0]));

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function renderValue(value) {
  if (Array.isArray(value)) {
    if (!value.length) return element("p", "없음 / None");
    const ul = element("ul");
    value.forEach((item) => { const li = element("li"); li.append(renderValue(item)); ul.append(li); });
    return ul;
  }
  if (value && typeof value === "object") {
    const container = element("div");
    for (const [key, item] of Object.entries(value)) {
      const field = element("div", undefined, "report-field");
      field.append(element("h4", key), renderValue(item)); container.append(field);
    }
    return container;
  }
  return element("p", value ?? "");
}
function renderDebate(debate) {
  const container = element("div");
  if (!debate.debates.length) container.append(element("p", debate.overallDebateSummary));
  for (const item of debate.debates) {
    const card = element("article", undefined, "debate-card");
    card.append(element("h3", item.issue), element("p", item.category));
    item.rounds.forEach((round, i) => {
      const turn = element("div", undefined, "turn");
      turn.append(element("strong", i === 2 ? "Reviewer Final Response" : round.speaker), element("p", round.statement));
      if (round.evidence.length) turn.append(element("p", round.evidence.join("\n"), "evidence"));
      card.append(turn);
    });
    card.append(element("p", `Resolution: ${item.resolution}`, "resolution"), element("p", item.resolutionReason), element("p", `Remaining Concern: ${item.remainingConcern}`));
    container.append(card);
  }
  return container;
}
function renderResult(result) {
  fullReview = result;
  if(desktop)$("save-pdf").disabled=false;
  const final = result.finalReview;
  $("paper-title").textContent = final.paperTitle;
  $("verdict").textContent = final.finalVerdict;
  $("overall").textContent = `${final.scores.overall} / 10`;
  $("confidence").textContent = `${final.metaReviewerConfidence.score} / 10`;
  $("final-cards").replaceChildren();
  const cards = [
    ["overallAssessment", "Overall Assessment"], ["keyStrengths", "Key Strengths"], ["keyWeaknesses", "Key Weaknesses"],
    ["remainingConcerns", "Remaining Concerns"], ["criticalBlockingIssues", "Critical Blocking Issues"],
    ["mostImportantContribution", "Most Important Contribution"], ["mostImportantWeakness", "Most Important Weakness"],
    ["requiredImprovements", "Required Improvements"], ["optionalImprovements", "Optional Improvements"], ["verdictReason", "Final Verdict Reason"],
  ];
  for (const [key, title] of cards) {
    const card = element("article", undefined, "result-card");
    card.append(element("h3", title), renderValue(final[key])); $("final-cards").append(card);
  }
  $("agent-reports").replaceChildren();
  for (const [key, title] of [["analysis", "Summary"], ["review", "Critical Reviewer"], ["advocate", "Advocate"], ["debate", "Debate"], ["finalReview", "Final Review"]]) {
    const details = element("details"), body = element("div", undefined, "report-body");
    body.append(key === "debate" ? renderDebate(result[key]) : renderValue(result[key]));
    details.append(element("summary", title), body); $("agent-reports").append(details);
  }
  $("results").hidden = false;
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}
function handleEvent(event) {
  if (event.type === "progress") {
    if(desktop)hasKey=true;
    const li = document.querySelector(`[data-stage="${event.stage}"]`);
    if (!li) return;
    li.className = event.state;
    li.querySelector(".step-state").textContent = event.state === "failed" ? "실패" : event.state === "done" ? "완료" : "진행 중";
    if (event.state === "failed") li.querySelector(".step-dot").textContent = "✕";
    if (event.state === "done") li.querySelector(".step-dot").textContent = "✓";
    $("status").textContent = `${stages[event.stage]} ${event.state === "done" ? "완료" : "진행 중…"}`;
  } else if (event.type === "error") { throw new Error(event.message); }
  else if (event.type === "result") { renderResult(event.result); $("status").textContent = "모든 검토가 완료되었습니다."; }
}
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedFile) { showError("PDF 파일을 선택해 주세요."); return; }
  if (desktop && !$("api-key").value.trim() && !hasKey) {showError("OpenAI API Key를 입력해 주세요.");return;}
  submit.disabled = true; fileInput.disabled = true; $("language").disabled = true;
  $("error").hidden = true; $("results").hidden = true; fullReview = null;
  $("save-pdf").disabled=true;
  document.querySelectorAll("#progress li").forEach((li, i) => { li.className = ""; li.querySelector(".step-dot").textContent = String(i + 1).padStart(2, "0"); li.querySelector(".step-state").textContent = "대기"; });
  $("status").textContent = "PDF 업로드 중…";
  try {
    if (desktop) {
      $("status").textContent="리뷰 시작 중…";
      $("select-pdf").disabled=true;$("delete-key").disabled=true;$("clear-data").disabled=true;
      const promise=desktop.startReview({apiKey:$("api-key").value,remember:$("remember-key").checked,language:$("language").value});
      $("api-key").value="";
      const result=await unwrap(promise);
      hasKey=true;
      renderResult(result);$("status").textContent="모든 검토가 완료되었습니다.";
      return;
    }
    const data = new FormData(); data.append("file", selectedFile); data.append("language", $("language").value);
    const response = await fetch("/api/review", { method: "POST", body: data });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || "리뷰 요청에 실패했습니다."); }
    if (!response.body) throw new Error("서버 응답을 읽지 못했습니다.");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let pending = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = pending.split("\n"); pending = lines.pop();
        for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line));
        if (done) break;
      }
      if (pending.trim()) handleEvent(JSON.parse(pending));
      if (!fullReview) throw new Error("리뷰 연결이 종료되었습니다. 다시 시도해 주세요.");
    } finally { await reader.cancel().catch(() => {}); }
  } catch (error) {
    showError(error instanceof TypeError ? "서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요." : error.message);
    $("status").textContent = "검토가 중단되었습니다. 오류를 확인하고 다시 시도해 주세요.";
  } finally {
    submit.disabled = false; fileInput.disabled = false; $("language").disabled = false;
    if(desktop){$("api-key").value="";$("select-pdf").disabled=false;$("delete-key").disabled=false;$("clear-data").disabled=false;}
  }
});
function download(value, filename) {
  if (!value) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json;charset=utf-8" }));
  const anchor = element("a"); anchor.href = url; anchor.download = filename;
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function saveDesktop(kind){try{if(await unwrap(desktop.saveResult(kind)))$("status").textContent="리뷰 JSON을 저장했습니다.";}catch(error){showError(error.message);}}
$("download-final").addEventListener("click", () => desktop ? saveDesktop("final") : download(fullReview?.finalReview, "finalReview.json"));
$("download-full").addEventListener("click", () => desktop ? saveDesktop("full") : download(fullReview, "fullReview.json"));
$("save-pdf").addEventListener("click",async()=>{
  if(!desktop||!fullReview)return;
  $("save-pdf").disabled=true;$("error").hidden=true;
  try{if(await unwrap(desktop.savePdfReport()))$("status").textContent=fullReview.language==="en"?"PDF report saved successfully.":"PDF 보고서를 저장했습니다.";}
  catch(error){showError(error.message);}
  finally{$("save-pdf").disabled=!fullReview;}
});
