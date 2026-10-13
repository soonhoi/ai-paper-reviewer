function validateStartOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some(k=>!["apiKey","remember","language"].includes(k)) ||
      typeof options.apiKey !== "string" || options.apiKey.length>1024 || typeof options.remember !== "boolean" || !["ko","en"].includes(options.language)) {
    throw new Error("리뷰 옵션이 잘못되었습니다.");
  }
}
function messageFor(error) {
  if(error.code==="REPORT_FONT")return "한글 또는 특수문자를 지원하는 Unicode 폰트를 찾지 못했습니다. Windows 한국어 폰트를 확인해 주세요.";
  if(error.code?.startsWith("REPORT_"))return "PDF 보고서 생성 중 오류가 발생했습니다.";
  let cause = error;
  const visited = new Set();
  while (cause && !visited.has(cause)) {
    visited.add(cause);
    if (cause.status === 401) return "OpenAI API Key 인증에 실패했습니다. Key를 확인해 주세요.";
    cause = cause.cause;
  }
  // Return only fixed strings; never serialize an SDK error or request payload.
  if (/Key를 입력/.test(error.message)) return "OpenAI API Key를 입력해 주세요.";
  if (/Key 형식/.test(error.message)) return "OpenAI API Key 형식을 확인해 주세요.";
  if (/저장된 API Key/.test(error.message)) return "저장된 API Key를 읽지 못했습니다. 삭제 후 다시 입력해 주세요.";
  if (/암호화/.test(error.message)) return "암호화 저장소를 사용할 수 없습니다. 저장 옵션을 해제하고 다시 시도해 주세요.";
  if (/PDF/.test(error.message)) return "올바른 PDF 파일을 선택해 주세요. 텍스트가 포함된 20 MB 이하 PDF가 필요합니다.";
  if (/JSON|검증/.test(error.message)) return "AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.";
  if (/옵션|요청/.test(error.message)) return "요청 형식이 올바르지 않습니다.";
  if (/이미 리뷰|리뷰 중/.test(error.message)) return "리뷰가 진행 중입니다. 완료 후 다시 시도해 주세요.";
  if (/저장할 리뷰/.test(error.message)) return "저장할 리뷰 결과가 없습니다.";
  return "리뷰를 완료하지 못했습니다. OpenAI 연결과 API 사용 한도를 확인한 후 다시 시도해 주세요.";
}
exports.validateStartOptions = validateStartOptions;
exports.messageFor = messageFor;
