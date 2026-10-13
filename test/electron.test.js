import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createApiKeyStore, validateApiKey } from "../electron/apiKeyStore.js";
import { validateStartOptions, messageFor } from "../electron/security.js";
import { embedTexts } from "../src/embeddingService.js";
import { runReviewJob } from "../src/server/reviewPipeline.js";
import { buildPaperIndex } from "../src/vectorStore.js";
import { summarizePaper } from "../src/summaryAgent.js";
import { reviewPaper } from "../src/reviewerAgent.js";
import { advocatePaper } from "../src/advocateAgent.js";
import { runDebate } from "../src/debateManager.js";
import { metaReviewPaper } from "../src/metaReviewerAgent.js";
import { finalReview } from "./metaFixtures.js";

// Unit-test provider; production uses Electron safeStorage, never this provider.
const encryptionKey=randomBytes(32);
const safeStorage={
  isAsyncEncryptionAvailable:async()=>true,
  encryptStringAsync:async(text)=>{const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",encryptionKey,iv);const data=Buffer.concat([cipher.update(text,"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);},
  decryptStringAsync:async(buffer)=>{const decipher=createDecipheriv("aes-256-gcm",encryptionKey,buffer.subarray(0,12));decipher.setAuthTag(buffer.subarray(12,28));return{result:Buffer.concat([decipher.update(buffer.subarray(28)),decipher.final()]).toString("utf8"),shouldReEncrypt:false};},
};
const key="sk-test_12345678901234567890";
test("key encryption persistence, restart, deletion and memory-only use",async()=>{
  const userData=await mkdtemp(join(tmpdir(),"paper-key-"));
  try{
    assert.throws(()=>validateApiKey(""),/입력/);assert.throws(()=>validateApiKey("bad"),/형식/);
    const first=createApiKeyStore({safeStorage,userData});
    await assert.rejects(first.useKey("",false),/입력/);
    await first.useKey(key,true);
    assert.equal(await first.hasStoredApiKey(),true);
    assert.ok(!(await readFile(join(userData,"api-key.dat"))).includes(Buffer.from(key)));
    const restarted=createApiKeyStore({safeStorage,userData});
    assert.equal(await restarted.useKey("",true),key);
    await restarted.deleteStoredApiKey();assert.equal(await restarted.hasStoredApiKey(),false);
    await assert.rejects(restarted.useKey("",true),/입력/);
    await restarted.useKey(key,false);assert.equal(await restarted.hasStoredApiKey(),false);
    const noCrypto=createApiKeyStore({safeStorage:{...safeStorage,isAsyncEncryptionAvailable:async()=>false},userData});
    await assert.rejects(noCrypto.useKey(key,true),/암호화/);
  }finally{await rm(userData,{recursive:true,force:true});}
});
test("IPC options and auth error redaction",()=>{
  validateStartOptions({apiKey:key,remember:true,language:"ko"});
  for(const invalid of [{},{apiKey:key,remember:true,language:"xx"},{apiKey:key,remember:true,language:"en",path:"C:/secret"}])assert.throws(()=>validateStartOptions(invalid));
  const error=new Error(`API failure ${key}`,{cause:{status:401,request:{key}}});
  assert.match(messageFor(error),/인증/);assert.ok(!messageFor(error).includes(key));
  assert.ok(!messageFor(new Error(`PDF failed ${key}`)).includes(key));
});
test("desktop source PDF is not copied or removed; one client is injected throughout",async()=>{
  const root=await mkdtemp(join(tmpdir(),"paper-desktop-")),sourcePath=join(root,"source.pdf");
  await writeFile(sourcePath,"%PDF-test");
  const openai={embeddings:{create:async()=>({data:[{index:0,embedding:[1,0]}]})}};
  assert.deepEqual(await embedTexts(["test"],{openai}),[[1,0]]);
  const seen=[];
  const service=(name)=>async(...args)=>{const options=args.at(-1);assert.equal(options.openai,openai);seen.push(name);return name==="summary"?{title:"test"}:{};};
  const services={readPDF:async()=>({text:"test",pages:1}),buildPaperIndex:service("index"),summarizePaper:service("summary"),reviewPaper:service("review"),advocatePaper:service("advocate"),runDebate:service("debate"),metaReviewPaper:service("final")};
  try{
    const result=await runReviewJob({sourcePath,filename:"source.pdf",language:"en",openai,workRoot:join(root,"work"),keepUpload:false},services);
    assert.equal(await readFile(sourcePath,"utf8"),"%PDF-test");
    await assert.rejects(readFile(join(root,"work",result.paper.jobId,"paper.pdf")));
    assert.deepEqual(seen,["index","summary","review","advocate","debate","final"]);
    assert.ok(!JSON.stringify(result).includes(key));
  }finally{await rm(root,{recursive:true,force:true});}
});

test("real Agent pipeline works with an injected client in both languages",async()=>{
  const root=await mkdtemp(join(tmpdir(),"paper-injected-"));
  const analysis=Object.fromEntries(["title","problem","objective","keyIdea","method","experiments","results","relatedWorkDifference","contributions","limitations","oneSentenceSummary"].map(k=>[k,["contributions","limitations"].includes(k)?["test"]:"test"]));
  const review={overallAssessment:"test",...Object.fromEntries(["novelty","technicalSoundness","experimentalQuality","clarity","practicalSignificance","reviewerConfidence"].map(k=>[k,{score:7,reason:"test"}])),strengths:[],weaknesses:[],unsupportedClaims:[],missingExperiments:[],questionsForAuthors:[],criticalIssues:[],summaryDisagreements:[]};
  const advocate={overallDefense:"test",responses:[],strongestContributions:[],reviewerPointsAccepted:[],reviewerPointsChallenged:[],additionalStrengths:[],authorPerspective:"test",defenseConfidence:{score:7,reason:"test"}};
  const answers={paper_analysis:analysis,paper_review:review,paper_advocate:advocate,paper_final_review:finalReview};
  try{
    for(const language of ["ko","en"]){
      let calls=0;
      const openai={embeddings:{create:async({input})=>({data:input.map((_,index)=>({index,embedding:[1,0]}))})},responses:{create:async request=>{
        assert.match(request.instructions,language==="en"?/Write all natural-language analysis in English/:/Write all natural-language analysis in Korean/);
        assert.ok(!JSON.stringify(request).includes(key));calls++;
        return{status:"completed",output_text:JSON.stringify(answers[request.text.format.name]),output:[]};
      }}};
      const services={readPDF:async()=>({text:"A test paper discusses method and experimental evidence.",pages:1}),buildPaperIndex,summarizePaper,reviewPaper,advocatePaper,runDebate,metaReviewPaper};
      const result=await runReviewJob({buffer:Buffer.from("%PDF-test"),filename:"paper.pdf",language,openai,workRoot:root},services);
      assert.equal(calls,4);assert.equal(result.language,language);
      assert.deepEqual(result.finalReview,finalReview);
      assert.ok(!JSON.stringify(result).includes(key));
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
