// Main entry is CommonJS so the sandboxed preload can also remain CommonJS.
const { app, BrowserWindow, dialog, ipcMain, protocol, safeStorage, session } = require("electron");
const { join, resolve, relative, extname, basename, isAbsolute } = require("node:path");
const { pathToFileURL } = require("node:url");
const { readFile, writeFile, mkdir, rm, stat, open, readdir } = require("node:fs/promises");
const { validateStartOptions, messageFor } = require("./security.js");
const { savePdfReport, PdfReportError } = require("./pdfReport.js");

app.setName("AI Paper Reviewer");
if(process.argv.includes("--smoke-test")) {
  const root=resolve(process.cwd(),".electron-test");
  require("node:fs").mkdirSync(root,{recursive:true});
  app.setPath("userData",root);
}
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, selectedPath = null, busy = false, lastResult = null, keyStore;
const jobIds = new Set();
const origin = "app://reviewer";
const stageNames = { pdf:"PDF_READING", index:"INDEXING", summary:"SUMMARIZING", review:"REVIEWING", advocate:"ADVOCATING", debate:"DEBATING", final:"FINAL_REVIEW" };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";

function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame ||
      !event.senderFrame.url.startsWith(`${origin}/`)) throw new Error("허용되지 않은 요청입니다.");
}
function handler(channel, task) {
  ipcMain.handle(channel, async (event, payload) => {
    try { trusted(event); return { ok: true, value: await task(payload) }; }
    catch (error) {
      // Never log the raw SDK error, payload, cause, or credentials.
      console.error(`[${channel}] failed`);
      if(error instanceof PdfReportError)console.error(`[PDF report] ${error.code}: ${error.message}`);
      return { ok: false, error: messageFor(error) };
    }
  });
}
async function clearReviewData() {
  if (busy) throw new Error("리뷰 중에는 작업 데이터를 삭제할 수 없습니다.");
  const root = resolve(app.getPath("userData"), "work");
  const entries = await readdir(root, { withFileTypes: true }).catch(error => { if(error.code === "ENOENT") return []; throw error; });
  for(const entry of entries) if(entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name)) jobIds.add(entry.name);
  for (const id of jobIds) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("잘못된 작업 ID");
    const target = resolve(root, id), rel = relative(root,target);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("작업 경로 검증 실패");
    await rm(target, { recursive: true, force: true });
  }
  jobIds.clear(); lastResult = null;
}
async function setup() {
  // A desktop user's credential must never come from a developer .env.
  delete process.env.OPENAI_API_KEY;
  const { createApiKeyStore } = await import(pathToFileURL(join(__dirname,"apiKeyStore.js")).href);
  const { runReviewJob, MAX_PDF_BYTES } = await import(pathToFileURL(join(__dirname,"../src/server/reviewPipeline.js")).href);
  const { default: OpenAI } = await import("openai");
  keyStore = createApiKeyStore({ safeStorage, userData: app.getPath("userData") });
  const uiRoot = resolve(__dirname,"../dist-desktop");
  protocol.handle("app", async (request) => {
    try {
      const url = new URL(request.url);
      if (url.host !== "reviewer" || request.method !== "GET") return new Response("Forbidden",{status:403});
      const path = resolve(uiRoot, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
      const rel = relative(uiRoot,path);
      if (!rel || rel.startsWith("..") || isAbsolute(rel)) return new Response("Forbidden",{status:403});
      const content = await readFile(path);
      const mime = {".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".woff2":"font/woff2"}[extname(path)] || "application/octet-stream";
      return new Response(content, {headers:{"Content-Type":`${mime}; charset=utf-8`,"Content-Security-Policy":CSP,"X-Content-Type-Options":"nosniff"}});
    } catch { return new Response("Not found",{status:404}); }
  });
  handler("paper:select", async (payload) => {
    if (payload !== undefined || busy) throw new Error("현재 PDF 선택을 변경할 수 없습니다.");
    const result = await dialog.showOpenDialog(window,{properties:["openFile"],filters:[{name:"PDF Documents",extensions:["pdf"]}]});
    if (result.canceled) return null;
    const path = result.filePaths[0];
    if (!path || extname(path).toLowerCase() !== ".pdf") throw new Error("PDF 파일만 선택할 수 있습니다.");
    const info = await stat(path);
    if (!info.isFile() || info.size > MAX_PDF_BYTES) throw new Error("PDF 파일은 20 MB 이하로 선택해 주세요.");
    const file = await open(path,"r");
    try { const buffer = Buffer.alloc(1024); const {bytesRead}=await file.read(buffer,0,1024,0); if(!buffer.subarray(0,bytesRead).includes(Buffer.from("%PDF-"))) throw new Error("올바른 PDF 파일을 선택해 주세요."); }
    finally { await file.close(); }
    selectedPath = path;
    return { name:basename(path),size:info.size };
  });
  handler("key:has", async (payload) => { if(payload!==undefined)throw new Error("잘못된 옵션");return keyStore.hasStoredApiKey(); });
  handler("key:delete", async (payload) => { if(payload!==undefined || busy)throw new Error("리뷰 중에는 Key를 삭제할 수 없습니다.");await keyStore.deleteStoredApiKey();return true; });
  handler("paper:start", async (options) => {
    if (busy) throw new Error("이미 리뷰가 진행 중입니다.");
    validateStartOptions(options);
    if (!selectedPath) throw new Error("PDF 파일을 선택해 주세요.");
    busy=true;
    try {
      const info=await stat(selectedPath);
      if(!info.isFile()||info.size>MAX_PDF_BYTES)throw new Error("PDF 파일은 20 MB 이하로 선택해 주세요.");
      const key = await keyStore.useKey(options.apiKey,options.remember);
      options.apiKey = "";
      const openai = new OpenAI({apiKey:key,timeout:120000,maxRetries:1});
      lastResult = null;
      const result = await runReviewJob({sourcePath:selectedPath,filename:basename(selectedPath),language:options.language,openai,
        workRoot:join(app.getPath("userData"),"work"),onProgress:event=>{
          jobIds.add(event.jobId);
          if(!window.isDestroyed())window.webContents.send("paper:progress",{...event,phase:stageNames[event.stage]});
        }});
      lastResult=result;
      if(!window.isDestroyed())window.webContents.send("paper:progress",{stage:"final",state:"done",phase:"DONE"});
      return result;
    } finally { options.apiKey="";busy=false; }
  });
  handler("paper:save", async (kind) => {
    if(!["full","final"].includes(kind) || !lastResult || busy)throw new Error("저장할 리뷰 결과가 없습니다.");
    const result=await dialog.showSaveDialog(window,{defaultPath:kind==="full"?"fullReview.json":"finalReview.json",filters:[{name:"JSON",extensions:["json"]}]});
    if(result.canceled)return false;
    await writeFile(result.filePath,JSON.stringify(kind==="full"?lastResult:lastResult.finalReview,null,2)+"\n","utf8");return true;
  });
  handler("paper:clear", async (payload) => {if(payload!==undefined)throw new Error("잘못된 옵션");await clearReviewData();return true;});
  handler("paper:pdf-report", async (payload) => {
    if(payload!==undefined)throw new Error("잘못된 요청");
    if(!lastResult||busy)throw new Error("저장할 리뷰 결과가 없습니다.");
    return savePdfReport({fullReview:lastResult,showSaveDialog:options=>dialog.showSaveDialog(window,options)});
  });
  window = new BrowserWindow({width:1220,height:900,minWidth:700,minHeight:650,show:false,title:"AI Paper Reviewer",
    webPreferences:{preload:join(__dirname,"preload.js"),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  window.webContents.on("will-navigate",event=>event.preventDefault());
  window.webContents.on("will-attach-webview",event=>event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window.on("close", event=>{if(busy){event.preventDefault();dialog.showMessageBox(window,{type:"info",message:"리뷰가 진행 중입니다. 완료 후 앱을 닫아 주세요."});}});
  window.once("ready-to-show",()=>{if(!process.argv.includes("--smoke-test"))window.show();});
  await window.loadURL(`${origin}/`);
  if(process.argv.includes("--smoke-test")) {
    const smokeStore=createApiKeyStore({safeStorage,userData:join(app.getPath("userData"),"key-test")});
    const testKey="sk-smoke_12345678901234567890";
    await smokeStore.useKey(testKey,true);
    const restarted=createApiKeyStore({safeStorage,userData:join(app.getPath("userData"),"key-test")});
    const restored=await restarted.useKey("",true);
    const encrypted=await readFile(join(app.getPath("userData"),"key-test","api-key.dat"));
    const encryptedOnDisk=!encrypted.includes(Buffer.from(testKey));
    await restarted.deleteStoredApiKey();
    const deleted=!await restarted.hasStoredApiKey();
    const checks = await window.webContents.executeJavaScript(`({title:document.title,bridge:typeof window.paperReviewer?.startReview==='function',node:typeof require,keyField:!!document.getElementById('api-key'),controlsVisible:!document.getElementById('desktop-controls').hidden,password:document.getElementById('api-key').type==='password'})`);
    const storedStatus=await window.webContents.executeJavaScript(`window.paperReviewer.hasStoredApiKey()`);
    checks.statusBoolean=storedStatus.ok && typeof storedStatus.value === "boolean";
    const sample=join(process.cwd(),"papers","sdf_paper_1.pdf");
    if(await stat(sample).catch(()=>null)) {
      const {readPDF}=await import(pathToFileURL(join(__dirname,"../src/pdfReader.js")).href);
      const paper=await readPDF(sample);
      checks.pdfPages=paper.pages;
      if(!paper.text.trim())throw new Error("PDF smoke failed");
    }
    Object.assign(checks,{encryptedOnDisk,restored:restored===testKey,deleted});
    const {generatePdfReport}=require("./pdfReport.js");
    const fixture={paperTitle:"한국어 보고서 검증",scores:{overall:7},metaReviewerConfidence:{score:8},finalVerdict:"WEAK_ACCEPT",
      overallAssessment:"논문의 핵심 기여를 근거에 따라 검토했습니다.",verdictReason:"추가 실험이 필요하지만 의미 있는 기여가 있습니다.",
      keyStrengths:["명확한 방법"],keyWeaknesses:["제한된 검증"],remainingConcerns:[],criticalBlockingIssues:[],requiredImprovements:[],optionalImprovements:[],
      mostImportantContribution:{contribution:"새로운 방법",reason:"원문 근거"},mostImportantWeakness:{weakness:"검증 부족",reason:"추가 실험 필요"}};
    const report=await generatePdfReport({language:"ko",finalReview:fixture});
    await writeFile(join(app.getPath("userData"),"packaged-report.pdf"),report);
    checks.pdfReport=report.subarray(0,5).equals(Buffer.from("%PDF-"));
    checks.pdfBridge=await window.webContents.executeJavaScript(`typeof window.paperReviewer.savePdfReport==='function' && document.getElementById('save-pdf').disabled`);
    console.log("Desktop smoke check",JSON.stringify(checks));
    if(!checks.bridge||checks.node!=="undefined"||!checks.controlsVisible||!checks.password||!checks.statusBoolean||!checks.pdfReport||!checks.pdfBridge||!encryptedOnDisk||restored!==testKey||!deleted)app.exit(1);else app.exit(0);
  }
}
if(app.requestSingleInstanceLock()) {
  app.on("second-instance",()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(setup).catch(()=>{console.error("Desktop initialization failed");app.exit(1);});
} else app.quit();
app.on("window-all-closed",()=>{keyStore?.clearMemory();app.quit();});
