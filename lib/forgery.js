import exifr from 'exifr';
import fs from 'fs';

/**
 * Module 5 (Forgery Detection) + Module 10 (Metadata Analysis).
 *
 * A production system runs CNN-based Error Level Analysis, signature
 * matching models, and seal-template matching. Those require trained
 * weights and labeled forgery datasets that don't exist in this session,
 * so this module implements the *structural* forgery signals that are
 * genuinely computable without a model:
 *
 *  - Metadata timeline inconsistency (modified-before-created, editing
 *    software fingerprints like Photoshop/GIMP in PDF/EXIF producer tags)
 *  - OCR text irregularities that correlate with tampering (broken
 *    alignment, suspicious repeated whitespace/overlay artifacts,
 *    mixed/garbled character runs)
 *  - Missing expected structural elements (signature/seal keyword absence
 *    on documents whose type normally requires them)
 *
 * Each signal contributes to a 0-100 forgeryScore (higher = more likely
 * forged) with human-readable flags so an auditor can see *why*.
 */

const EDITING_SOFTWARE_MARKERS = ['photoshop', 'gimp', 'illustrator', 'snapseed', 'pixlr', 'canva', 'paint.net'];

export async function analyzeMetadata(filePath, mimeType, pdfInfo) {
  const flags = [];
  let suspicionPoints = 0;
  let createdAt = null;
  let modifiedAt = null;
  let software = null;

  try {
    if (mimeType.startsWith('image/')) {
      const exif = await exifr.parse(filePath).catch(() => null);
      if (exif) {
        createdAt = exif.CreateDate || exif.DateTimeOriginal || null;
        modifiedAt = exif.ModifyDate || null;
        software = exif.Software || null;
      }
    } else if (mimeType === 'application/pdf' && pdfInfo) {
      createdAt = pdfInfo.CreationDate || null;
      modifiedAt = pdfInfo.ModDate || null;
      software = pdfInfo.Producer || pdfInfo.Creator || null;
    }
  } catch (e) {
    // metadata missing or unreadable — not itself suspicious, just noted
  }

  if (software && EDITING_SOFTWARE_MARKERS.some((m) => software.toLowerCase().includes(m))) {
    flags.push(`File metadata shows it was processed with an image/PDF editor (${software}).`);
    suspicionPoints += 30;
  }

  if (createdAt && modifiedAt) {
    const c = new Date(createdAt).getTime();
    const m = new Date(modifiedAt).getTime();
    if (!isNaN(c) && !isNaN(m) && m > c) {
      const diffDays = (m - c) / (1000 * 60 * 60 * 24);
      if (diffDays > 1) {
        flags.push(`Document was modified ${Math.round(diffDays)} day(s) after its original creation date.`);
        suspicionPoints += Math.min(25, Math.round(diffDays));
      }
    }
  }

  if (!createdAt && !modifiedAt) {
    flags.push('No embedded creation/modification metadata found (stripped or never present).');
    suspicionPoints += 5;
  }

  return {
    metadata: { createdAt, modifiedAt, software },
    flags,
    suspicionPoints: Math.min(50, suspicionPoints),
  };
}

export function analyzeOcrForTampering(ocrText, documentType) {
  const flags = [];
  let suspicionPoints = 0;
  const text = ocrText || '';

  // Excessive irregular whitespace/line-break patterns often appear where
  // a field (name, date, grade) has been pasted over the original.
  const irregularGaps = (text.match(/[ ]{4,}/g) || []).length;
  if (irregularGaps > 3) {
    flags.push(`Unusual clustering of irregular whitespace (${irregularGaps} instances) — often produced when a field is digitally overlaid.`);
    suspicionPoints += Math.min(20, irregularGaps * 2);
  }

  // Garbled/mixed-case character runs can indicate a pasted image region
  // that OCR'd poorly against the surrounding clean text.
  const garbledRuns = (text.match(/[A-Za-z]*[0-9][A-Za-z]+[0-9][A-Za-z0-9]*/g) || []).length;
  if (garbledRuns > 5) {
    flags.push(`High rate of mixed alphanumeric noise in extracted text (${garbledRuns} runs), consistent with a low-quality pasted region.`);
    suspicionPoints += Math.min(15, garbledRuns);
  }

  const requiresSignature = ['Certificate', 'Contract', 'Offer Letter', 'Experience Letter'].includes(documentType);
  const hasSignatureMention = /signature|signed|authorized signatory/i.test(text);
  if (requiresSignature && !hasSignatureMention) {
    flags.push('Document type normally includes a signature block, but none was detected in the extracted text/layout.');
    suspicionPoints += 10;
  }

  const requiresSeal = ['Certificate', 'ID Card', 'Passport'].includes(documentType);
  const hasSealMention = /seal|stamp|official seal/i.test(text);
  if (requiresSeal && !hasSealMention) {
    flags.push('Document type normally carries an official seal/stamp reference, but none was detected.');
    suspicionPoints += 8;
  }

  return { flags, suspicionPoints: Math.min(40, suspicionPoints) };
}

export function computeForgeryScore({ metadataResult, ocrTamperResult }) {
  const rawSuspicion = metadataResult.suspicionPoints + ocrTamperResult.suspicionPoints;
  const forgeryScore = Math.max(0, 100 - Math.min(100, rawSuspicion) * 1.4); // 100 = clean, 0 = highly suspicious
  // Only the OCR/structural flags go here — metadata flags are already
  // surfaced separately via metadataResult.flags (stored in doc.metadataFlags)
  // to avoid showing the same finding twice in the UI.
  return {
    forgeryScore: Math.round(Math.max(0, Math.min(100, forgeryScore))),
    flags: ocrTamperResult.flags,
  };
}
