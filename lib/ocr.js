import Tesseract from 'tesseract.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Module 3 (OCR Engine) + Module 7 (OCR Error Correction).
 * Real Tesseract OCR runs against uploaded images. For PDFs we use pdf-parse
 * to pull the embedded text layer (works for text-based PDFs; scanned PDFs
 * would need a PDF->image rasterization step before OCR, noted in README).
 *
 * `langPath` is pointed at a locally bundled trained-data file
 * (./tessdata/eng.traineddata.gz) instead of tesseract.js's default
 * jsdelivr CDN. This makes OCR work fully offline / behind restrictive
 * firewalls after the initial `npm install`. The decompressed cache is
 * written to the OS temp dir so the bundled tessdata folder can stay
 * read-only.
 */

const TESSDATA_PATH = path.join(process.cwd(), 'tessdata');
const TESSDATA_CACHE = path.join(os.tmpdir(), 'veridocs-tessdata-cache');
if (!fs.existsSync(TESSDATA_CACHE)) fs.mkdirSync(TESSDATA_CACHE, { recursive: true });

export async function runOcrOnImage(filePath) {
  const { data } = await Tesseract.recognize(filePath, 'eng', {
    langPath: TESSDATA_PATH,
    gzip: true,
    cachePath: TESSDATA_CACHE,
    logger: () => {} // silence progress logs on server
  });
  return {
    text: data.text || '',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0
  };
}

export async function extractPdfText(filePath) {
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = fs.readFileSync(filePath);
  try {
    const result = await pdfParse(buffer);
    return { text: result.text || '', confidence: result.text && result.text.trim().length > 20 ? 90 : 20 };
  } catch (e) {
    return { text: '', confidence: 0 };
  }
}

// Simple correction pass for common OCR confusions (Module 7 style, lexicon-free).
const CHAR_FIXES = [
  [/\b0(?=[A-Z]{2,})/g, 'O'],
  [/\bl(?=[A-Z]{2,})/g, 'I'],
  [/CERT1F1CATE/gi, 'CERTIFICATE'],
  [/[|]{1}/g, 'I'],
];

export function correctOcrText(text) {
  let corrected = text;
  for (const [pattern, replacement] of CHAR_FIXES) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
}

// Lightweight field extraction via regex/heuristics — a pragmatic stand-in
// for a trained NER model (spec calls for extracting name/cert#/dates/etc).
export function extractFields(text) {
  const fields = {};

  const nameMatch = text.match(/(?:name|student name|candidate)\s*[:\-]\s*([A-Za-z .]{2,60})/i);
  if (nameMatch) fields.name = nameMatch[1].trim();

  const certMatch = text.match(/(?:certificate\s*(?:no\.?|number|#)|cert\s*id)\s*[:\-]?\s*([A-Za-z0-9\-\/]{3,30})/i);
  if (certMatch) fields.certificateNumber = certMatch[1].trim();

  const dateMatches = text.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/gi);
  if (dateMatches) fields.datesFound = [...new Set(dateMatches)].slice(0, 5);

  const institutionMatch = text.match(/(?:institution|university|college|school)\s*[:\-]\s*([^\n]{2,80})/i);
  if (institutionMatch) fields.institution = institutionMatch[1].trim();

  const idMatch = text.match(/\b([A-Z]{1,3}[0-9]{5,12})\b/);
  if (idMatch) fields.idNumberDetected = idMatch[1];

  return fields;
}
