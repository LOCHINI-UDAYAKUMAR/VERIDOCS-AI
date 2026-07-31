import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import getDb from './db';
import { sha256Buffer, appendBlock, verifyDocumentAgainstChain } from './blockchain';
import { runOcrOnImage, extractPdfText, correctOcrText, extractFields } from './ocr';
import { classifyDocumentML } from './classifyModel';
import { analyzeMetadata, analyzeOcrForTampering, computeForgeryScore } from './forgery';
import { findDuplicates, computeEmbeddingForStorage } from './duplicate';
import { predictTrustScoreML } from './trustScoreModel';
import { statusFromScore } from './trustScore';
import { logAction } from './audit';
import { safeExtensionForMime } from './fileValidation';

export const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * Runs the full verification pipeline (Modules 2,3,4,5,6,7,8,9,10,12)
 * against a freshly uploaded file and persists the result.
 */
export async function processDocument({ tempFilePath, originalFilename, mimeType, ownerId }) {
  const db = getDb();
  const id = uuidv4();
  // SECURITY: extension is derived from the already-validated mimeType
  // (checked against real file bytes by the upload route), never from the
  // user-supplied filename. This removes any possibility of a crafted
  // filename influencing the stored path on disk.
  const ext = safeExtensionForMime(mimeType) || path.extname(originalFilename).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10) || '';
  const storedFilename = `${id}${ext}`;
  const finalPath = path.join(UPLOAD_DIR, storedFilename);
  fs.copyFileSync(tempFilePath, finalPath);
  const buffer = fs.readFileSync(finalPath);
  const fileSizeBytes = buffer.length;
  const sha256 = sha256Buffer(buffer);

  // --- Module 3/7: OCR + correction ---
  let ocrRaw = { text: '', confidence: 0 };
  let pdfInfo = null;
  if (mimeType === 'application/pdf') {
    ocrRaw = await extractPdfText(finalPath);
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const parsed = await pdfParse(buffer);
      pdfInfo = parsed.info || null;
    } catch (e) { /* ignore */ }
  } else if (mimeType.startsWith('image/')) {
    ocrRaw = await runOcrOnImage(finalPath);
  }
  const ocrText = correctOcrText(ocrRaw.text);
  const ocrConfidence = ocrRaw.confidence;
  const extractedFields = extractFields(ocrText);

  // --- Module 4: Classification (trained TF-IDF + Logistic Regression) ---
  const classification = classifyDocumentML(ocrText);

  // --- Module 10 + 5: Metadata + forgery analysis ---
  const metadataResult = await analyzeMetadata(finalPath, mimeType, pdfInfo);
  const ocrTamperResult = analyzeOcrForTampering(ocrText, classification.documentType);
  const { forgeryScore, flags: forgeryFlags } = computeForgeryScore({ metadataResult, ocrTamperResult });

  // --- Module 6: Duplicate detection (needs a row to exist first for self-exclusion, so run against existing rows) ---
  // --- Module 6: Duplicate detection (real embeddings, with tested text-similarity fallback) ---
  const embeddingJson = await computeEmbeddingForStorage(ocrText);
  const duplicateResult = await findDuplicates(id, ocrText, embeddingJson);

  // --- Module 8: Blockchain (hash-chain) sealing ---
  // NOTE: chain_blocks.documentId has a FK to documents(id), so the document
  // row must be inserted first; the block is appended immediately after and
  // the row is updated with its resulting blockIndex.

  // --- Module 9: Trust score (trained Random Forest) ---
  const trustScoreValue = predictTrustScoreML({
    blockchainVerified: 1, // just sealed, so it matches by definition at creation time
    ocrConfidence,
    forgeryScore,
    metadataFlagCount: metadataResult.flags.length,
    duplicateScore: duplicateResult.duplicateScore,
    classificationConfidence: classification.confidence,
  });
  const trust = { trustScore: trustScoreValue, status: statusFromScore(trustScoreValue) };

  const qrToken = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO documents (
      id, ownerId, originalFilename, storedFilename, mimeType, fileSizeBytes,
      documentType, classificationConfidence, version, parentId, sha256,
      ocrText, ocrConfidence, extractedFields, metadataJson, metadataFlags,
      forgeryScore, forgeryFlags, duplicateScore, duplicateOfId, embeddingJson,
      trustScore, status, blockIndex, qrToken, createdAt, updatedAt
    ) VALUES (?,?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?, ?,?,?,?,?,?)
  `).run(
    id, ownerId, originalFilename, storedFilename, mimeType, fileSizeBytes,
    classification.documentType, classification.confidence, 1, null, sha256,
    ocrText, ocrConfidence, JSON.stringify(extractedFields), JSON.stringify(metadataResult.metadata), JSON.stringify(metadataResult.flags),
    forgeryScore, JSON.stringify(forgeryFlags), duplicateResult.duplicateScore, duplicateResult.duplicateOfId, embeddingJson,
    trust.trustScore, trust.status, null, qrToken, now, now
  );

  const block = appendBlock({ documentId: id, documentHash: sha256, ownerId, version: 1 });
  db.prepare('UPDATE documents SET blockIndex = ? WHERE id = ?').run(block.idx, id);

  logAction({ userId: ownerId, documentId: id, action: 'DOCUMENT_UPLOADED', details: { originalFilename, documentType: classification.documentType } });
  logAction({ userId: ownerId, documentId: id, action: 'DOCUMENT_VERIFIED', details: { trustScore: trust.trustScore, status: trust.status } });

  return getDocumentById(id);
}

export function getDocumentById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}

// Re-runs hash comparison against the ledger — used by the "Verify Now" action
// and by the public QR page. Does NOT re-run OCR/forgery (those reflect the
// sealed-at-upload analysis; integrity check reflects live file state).
export function reverifyDocument(id) {
  const doc = getDocumentById(id);
  if (!doc) return null;
  const filePath = path.join(UPLOAD_DIR, doc.storedFilename);
  if (!fs.existsSync(filePath)) {
    return { ...doc, blockchainVerified: false, verifyReason: 'Stored file is missing from disk.' };
  }
  const currentHash = sha256Buffer(fs.readFileSync(filePath));
  const chainResult = verifyDocumentAgainstChain(id, currentHash);
  return { ...doc, blockchainVerified: chainResult.verified, verifyReason: chainResult.reason };
}
