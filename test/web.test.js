import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateUpload, runReviewJob, publicReviewError } from "../src/server/reviewPipeline.js";
import { getLanguageInstruction } from "../src/utils/language.js";
import { summarizePaper } from "../src/summaryAgent.js";

test("PDF uploads, language and safe error messages", async () => {
  await assert.rejects(validateUpload(null,"ko"), /PDF/);
  await assert.rejects(validateUpload(new File(["test"],"test.txt"),"ko"), /PDF/);
  await assert.rejects(validateUpload(new File(["test"],"test.pdf"),"ko"), /PDF/);
  const pdf = new File(["%PDF-1.7\ntest"],"test.pdf",{type:"application/pdf"});
  assert.ok((await validateUpload(pdf,"en")).length);
  await assert.rejects(validateUpload(pdf,"xx"));
  assert.throws(()=>getLanguageInstruction("xx"));
  assert.match(getLanguageInstruction("en"), /English/);
  assert.ok(!publicReviewError(new Error("API failed SECRET_STACK"),"en").includes("SECRET_STACK"));
});

test("concurrent jobs isolate files and pass language to every agent", async () => {
  const workRoot = await mkdtemp(join(tmpdir(),"paper-web-"));
  const languages = [];
  const events = [];
  const services = {
    readPDF:async()=>({text:"paper text",pages:1}),
    buildPaperIndex:async(_text,_path,{indexPath})=> { assert.ok(indexPath.startsWith(workRoot)); return {test:true}; },
    summarizePaper:async(_text,options)=>{languages.push(options.language);return {title:options.language};},
    reviewPaper:async(_text,_analysis,options)=>{languages.push(options.language);assert.ok(options.paperIndex);return {};},
    advocatePaper:async(_text,_analysis,_review,options)=>{languages.push(options.language);return {};},
    runDebate:async(_text,_analysis,_review,_advocate,options)=>{languages.push(options.language);return {};},
    metaReviewPaper:async(_text,_analysis,_review,_advocate,_debate,options)=>{languages.push(options.language);return {paperTitle:options.language};},
  };
  try {
    const [ko,en] = await Promise.all(["ko","en"].map(language=>runReviewJob({buffer:Buffer.from("%PDF-test"),filename:"paper.pdf",language,workRoot,keepUpload:false,onProgress:event=>events.push(event)},services)));
    assert.notEqual(ko.paper.jobId,en.paper.jobId);
    assert.equal(languages.filter(x=>x==="ko").length,5);
    assert.equal(languages.filter(x=>x==="en").length,5);
    assert.equal(events.length,28);
    for (const result of [ko,en]) {
      const files = await readdir(join(workRoot,result.paper.jobId));
      assert.ok(!files.includes("paper.pdf"));
      assert.deepEqual(JSON.parse(await readFile(join(workRoot,result.paper.jobId,"fullReview.json"),"utf8")),result);
    }
  } finally { await rm(workRoot,{recursive:true,force:true}); }
});

test("Summary request honors selected English language", async () => {
  const oldFetch = globalThis.fetch, oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY="test-only";
  const sample = Object.fromEntries(["title","problem","objective","keyIdea","method","experiments","results","relatedWorkDifference","contributions","limitations","oneSentenceSummary"].map(key=>[key,["contributions","limitations"].includes(key)?["test"]:"test"]));
  globalThis.fetch=async(_url,options)=>{
    assert.match(JSON.parse(options.body).instructions,/OUTPUT LANGUAGE OVERRIDE: Write all natural-language analysis in English/);
    return new Response(JSON.stringify({id:"resp_test",object:"response",status:"completed",output:[{type:"message",role:"assistant",content:[{type:"output_text",text:JSON.stringify(sample),annotations:[]}]}]}),{status:200,headers:{"content-type":"application/json"}});
  };
  try { assert.deepEqual(await summarizePaper("paper",{language:"en"}),sample); }
  finally { globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey; }
});
