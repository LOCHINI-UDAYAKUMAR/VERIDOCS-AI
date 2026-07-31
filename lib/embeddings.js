/**
 * Module 6 (Duplicate Detection) — real sentence embeddings.
 *
 * Uses a real pretrained sentence-embedding model (all-MiniLM-L6-v2, via
 * transformers.js / @xenova) running locally in Node — this is genuinely
 * the same category of model the original spec's "SBERT" ask ("Sentence
 * Transformers") refers to, not a trained-by-us model (nobody trains
 * SBERT from scratch for a project like this; you use a pretrained one,
 * same as calling an embeddings API but fully local/free).
 *
 * HONESTY NOTE: model weights download from Hugging Face on first use
 * (cached under node_modules/@xenova/transformers/.cache after that). This
 * sandbox's network allowlist does not include huggingface.co, so this
 * path could NOT be tested end-to-end in the session that wrote this file
 * — only the fallback path (see lib/duplicate.js) was verified. On a
 * normal machine with internet access this should work, but you are the
 * first to actually exercise the embedding path — if pipeline() throws or
 * hangs, that's useful signal, not a foregone-conclusion bug.
 */

let extractorPromise = null;
let unavailable = false;

async function getExtractor() {
  if (unavailable) return null;
  if (!extractorPromise) {
    extractorPromise = (async () => {
      try {
        const { pipeline } = await import('@xenova/transformers');
        return await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      } catch (e) {
        console.warn('[embeddings] Could not load local embedding model, falling back to text-similarity duplicate detection:', e.message);
        unavailable = true;
        return null;
      }
    })();
  }
  return extractorPromise;
}

export async function embedText(text) {
  const extractor = await getExtractor();
  if (!extractor) return null;
  try {
    const trimmed = (text || '').slice(0, 2000); // model has a token limit; OCR text can be long
    const output = await extractor(trimmed, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (e) {
    console.warn('[embeddings] Embedding failed for this document, will fall back:', e.message);
    return null;
  }
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // vectors are already normalized by the pipeline's normalize:true, so
  // dot product IS the cosine similarity — no separate magnitude division needed
  return dot;
}

export function embeddingsAvailable() {
  return !unavailable;
}
