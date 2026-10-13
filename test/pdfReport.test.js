import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generatePdfReport, savePdfReport, safeReportFilename } from "../electron/pdfReport.js";
import { finalReview } from "./metaFixtures.js";
import { PDFParse } from "pdf-parse";

test("PDF report in Korean and English, long pagination, no keys, no resolved transcript",async()=>{
  await mkdir("output/pdf",{recursive:true});
  for(const language of ["ko","en"]){
    const phrase=language==="ko"?"논문의 핵심 기여는 유의미하지만 실험적 검증이 더 필요합니다.":"The contribution is meaningful but further experimental validation is required.";
    const final={...finalReview,paperTitle:language==="ko"?"근거 기반 논문 평가": "Evidence-based paper evaluation",overallAssessment:phrase,
      keyStrengths:Array.from({length:18},(_,i)=>`${i+1}: ${phrase.repeat(3)}`),keyWeaknesses:[phrase],criticalBlockingIssues:[],
      verdictReason:phrase.repeat(80)+" END_OF_VERDICT",remainingConcerns:[phrase],requiredImprovements:[phrase],optionalImprovements:[]};
    const secret="sk-report_secret_12345678901234567890";
    const data={language,apiKey:secret,finalReview:final,review:{overallAssessment:phrase},advocate:{overallDefense:`${phrase} ${secret}`},debate:{debates:[
      {issue:"RESOLVED_MUST_NOT_APPEAR",resolution:"RESOLVED",remainingConcern:"none"},
      {issue:"Scalability",resolution:"UNRESOLVED",remainingConcern:phrase},
    ]}};
    const bytes=await generatePdfReport(data);
    await writeFile(`output/pdf/report-${language}.pdf`,bytes);
    const parser=new PDFParse({data:bytes});
    try{
      const result=await parser.getText();
      assert.ok(result.total>3);
      assert.ok(result.text.includes("END_OF_VERDICT"));
      assert.ok(result.text.includes(language==="ko"?"없음":"None"));
      assert.ok(!result.text.includes(secret));assert.ok(!result.text.includes("RESOLVED_MUST_NOT_APPEAR"));
      assert.ok(result.text.includes("WEAK_ACCEPT"));assert.ok(result.text.includes("Page 1"));
      assert.ok(result.pages.every(page=>page.text.includes("AI Paper Reviewer")&&page.text.includes("Page ")));
      assert.equal(result.total,5);
      if(language==="ko")assert.ok(result.text.includes("종합 평가"));
      assert.ok(!bytes.includes(Buffer.from(secret)));
    }finally{await parser.destroy();}
  }
});
test("cancelled save does not generate or write, safe filenames, missing font is clear",async()=>{
  const result=await savePdfReport({fullReview:{finalReview},showSaveDialog:async()=>({canceled:true}),generate:async()=>{throw Error("must not generate");},write:async()=>{throw Error("must not write");}});
  assert.equal(result,false);
  await assert.rejects(savePdfReport({fullReview:{finalReview},showSaveDialog:async()=>({canceled:false,filePath:"unused.pdf"}),generate:async()=>{throw new Error("internal renderer error");}}),error=>error.code==="REPORT_FAILED");
  assert.ok(!/[<>:"/\\|?*]/.test(safeReportFilename('a<>:"/\\|?*title')));
  await assert.rejects(generatePdfReport({language:"ko",finalReview},{fontPaths:[]}),error=>error.code==="REPORT_FONT");
});
test("save writes an actual PDF and preserves existing file on write failure",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"paper-report-")),filePath=join(directory,"review.pdf");
  const fullReview={language:"en",finalReview};
  const showSaveDialog=async options=>{assert.deepEqual(options.filters,[{name:"PDF Document",extensions:["pdf"]}]);return{canceled:false,filePath};};
  try{
    assert.equal(await savePdfReport({fullReview,showSaveDialog}),true);
    const previous=await readFile(filePath);assert.ok(previous.subarray(0,5).equals(Buffer.from("%PDF-")));
    await assert.rejects(savePdfReport({fullReview,showSaveDialog,write:async()=>{throw new Error("disk failure");}}),error=>error.code==="REPORT_WRITE");
    assert.deepEqual(await readFile(filePath),previous);
  }finally{await rm(directory,{recursive:true,force:true});}
});
