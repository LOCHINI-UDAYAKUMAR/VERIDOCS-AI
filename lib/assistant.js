/**
 * Module 14: AI Verification Assistant.
 * Spec allows a local LLM or optional OpenAI API call. This session has no
 * API keys configured, so the assistant is implemented as a deterministic
 * natural-language generator over the same structured signals every other
 * module already computed — same UX, zero external dependency. If you add
 * an OPENAI_API_KEY / ANTHROPIC_API_KEY env var later, swap the return of
 * `explainDocument()` for a real chat completion call using this text as
 * the prompt context.
 */

export function explainDocument(doc) {
  const lines = [];
  const forgeryFlags = safeParse(doc.forgeryFlags) || [];
  const metadataFlags = safeParse(doc.metadataFlags) || [];
  const trustScore = doc.trustScore ?? 0;

  lines.push(
    trustScore >= 80
      ? `This document scored ${trustScore}/100 and is classified as VERIFIED.`
      : trustScore >= 50
      ? `This document scored ${trustScore}/100 and was flagged for manual review.`
      : `This document scored ${trustScore}/100 and was REJECTED by automated checks.`
  );

  const reasons = [];
  if (doc.blockchainVerified === false) {
    reasons.push('The current file content does not match the hash sealed on the integrity ledger at upload time — the file may have been altered afterward.');
  }
  if (typeof doc.ocrConfidence === 'number' && doc.ocrConfidence < 60) {
    reasons.push(`OCR extraction confidence was low (${Math.round(doc.ocrConfidence)}%), meaning key fields could not be read reliably.`);
  }
  if (typeof doc.forgeryScore === 'number' && doc.forgeryScore < 70) {
    reasons.push(`Structural forgery analysis found signs of tampering (score ${doc.forgeryScore}/100, lower is more suspicious).`);
  }
  for (const f of forgeryFlags) reasons.push(f);
  for (const f of metadataFlags) reasons.push(f);
  if (doc.duplicateScore >= 85) {
    reasons.push(`This document is ${doc.duplicateScore}% textually similar to another document already on file (${doc.matchedFilename || 'unknown'}), suggesting it may be a modified duplicate.`);
  }

  if (reasons.length === 0) {
    lines.push('No significant risk signals were found across blockchain integrity, OCR confidence, forgery analysis, metadata, or duplicate checks.');
  } else {
    lines.push('Contributing factors:');
    reasons.slice(0, 6).forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  return lines.join('\n');
}

function safeParse(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
