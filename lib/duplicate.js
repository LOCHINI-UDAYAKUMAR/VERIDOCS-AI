import stringSimilarity from 'string-similarity';
import getDb from './db';
import { embedText, cosineSimilarity } from './embeddings';

/**
 * Module 6: Duplicate Detection.
 *
 * Primary path: real sentence embeddings (see lib/embeddings.js) compared
 * via cosine similarity — this is the actual technique the spec's "SBERT"
 * requirement refers to. Falls back to Dice-coefficient text similarity
 * (the original heuristic implementation) for any comparison where an
 * embedding isn't available — either because the embedding model couldn't
 * be loaded (see the honesty note in lib/embeddings.js) or because an
 * older document in the database predates this feature and has no stored
 * embedding. This fallback path IS fully tested; the embedding path's
 * *model download* could not be tested in the sandbox that wrote this
 * (network-restricted), though the comparison/storage logic around it is
 * straightforward and was exercised via the fallback branch.
 */

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[0-9]/g, '#') // numbers (dates, ids) often differ between legit re-issues; ignore for structural match
    .trim();
}

function textSimilarityScore(a, b) {
  return stringSimilarity.compareTwoStrings(normalize(a), normalize(b));
}

// Computes an embedding for new document text (returns null if the model
// isn't available — caller should store null and comparisons will fall
// back to text similarity for this document).
export async function computeEmbeddingForStorage(text) {
  if (!text || !text.trim()) return null;
  const vec = await embedText(text);
  return vec ? JSON.stringify(vec) : null;
}

export async function findDuplicates(currentDocId, currentText, currentEmbeddingJson) {
  const db = getDb();
  const candidates = db.prepare(`
    SELECT id, ocrText, originalFilename, embeddingJson FROM documents
    WHERE id != ? AND ocrText IS NOT NULL AND ocrText != ''
  `).all(currentDocId);

  if (!currentText || !currentText.trim()) return { duplicateScore: 0, duplicateOfId: null, matchedFilename: null, method: 'none' };

  const currentEmbedding = currentEmbeddingJson ? JSON.parse(currentEmbeddingJson) : null;

  let best = { score: 0, id: null, filename: null, method: 'text' };
  for (const c of candidates) {
    let score, method;
    const candidateEmbedding = c.embeddingJson ? JSON.parse(c.embeddingJson) : null;

    if (currentEmbedding && candidateEmbedding) {
      score = cosineSimilarity(currentEmbedding, candidateEmbedding);
      method = 'embedding';
    } else {
      score = textSimilarityScore(currentText, c.ocrText);
      method = 'text';
    }

    if (score > best.score) best = { score, id: c.id, filename: c.originalFilename, method };
  }

  return {
    duplicateScore: Math.round(best.score * 100),
    duplicateOfId: best.score >= 0.85 ? best.id : null,
    matchedFilename: best.score >= 0.85 ? best.filename : null,
    method: best.method,
  };
}
