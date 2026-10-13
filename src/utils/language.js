export function getLanguageInstruction(language = "ko") {
  if (!["ko", "en"].includes(language)) throw new Error("language must be ko or en");
  return language === "en"
    ? `OUTPUT LANGUAGE OVERRIDE: Write all natural-language analysis in English. This overrides any earlier Korean-language or Korean fallback instructions. Use "Not clearly confirmed in the paper" for unavailable information and "Insufficient evidence" for evidence gaps. Keep JSON keys, enum values, chunk IDs and faithfully copied source claims unchanged. Preserve the paper's original title.`
    : `OUTPUT LANGUAGE: Write all natural-language analysis in Korean. Keep important technical terms in English when appropriate. Keep JSON keys, enum values, chunk IDs, copied source claims and the original paper title unchanged.`;
}
