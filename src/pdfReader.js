import fs from "fs";
import { PDFParse } from "pdf-parse";

export async function readPDF(filePath) {
  const buffer = fs.readFileSync(filePath);

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const result = await parser.getText();

    return {
      pages: result.total,
      text: result.text,
    };
  } finally {
    await parser.destroy();
  }
}