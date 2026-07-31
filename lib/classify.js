/**
 * SUPERSEDED: the pipeline now uses the trained TF-IDF + Logistic
 * Regression model in lib/classifyModel.js (see training/train_classifier.py).
 * This heuristic version is kept as a dependency-free fallback / reference
 * implementation and is no longer called by lib/pipeline.js.
 *
 * Module 4: Document Classification.
 * A production system would use a fine-tuned CNN/ViT image classifier.
 * Here we use a transparent, auditable keyword+structure scoring model
 * over the OCR text, which is fast, needs no GPU/training data, and is
 * easy to extend — but should be swapped for a trained vision model
 * before real production use (see README).
 */

const CATEGORY_KEYWORDS = {
  Certificate: ['certificate', 'certify', 'has successfully completed', 'awarded', 'diploma', 'convocation'],
  Resume: ['resume', 'curriculum vitae', 'work experience', 'skills', 'objective', 'career summary'],
  Contract: ['agreement', 'party of the first part', 'terms and conditions', 'hereby agree', 'contract', 'signed by both parties'],
  'ID Card': ['identity card', 'id no', 'date of birth', 'blood group', 'employee id'],
  Passport: ['passport', 'nationality', 'passport no', 'place of birth', 'date of issue', 'date of expiry'],
  'Driving License': ['driving licence', 'driving license', 'dl no', 'vehicle class', 'transport authority'],
  'Offer Letter': ['offer letter', 'pleased to offer', 'compensation', 'joining date', 'ctc'],
  'Experience Letter': ['experience letter', 'relieving', 'worked with us', 'last working day', 'to whomsoever it may concern'],
};

export function classifyDocument(ocrText) {
  const text = (ocrText || '').toLowerCase();
  let best = { type: 'Unclassified', score: 0 };
  const scores = {};

  for (const [type, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let hits = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) hits += 1;
    }
    const score = keywords.length ? hits / keywords.length : 0;
    scores[type] = score;
    if (score > best.score) best = { type, score };
  }

  // Confidence heuristic: separation between best and second-best score,
  // scaled so a clean single-category match reads high, ambiguous text reads low.
  const sorted = Object.values(scores).sort((a, b) => b - a);
  const second = sorted[1] || 0;
  const separation = best.score - second;
  let confidence = Math.round((best.score * 60 + separation * 40) * 100);
  confidence = Math.max(5, Math.min(99, confidence));

  if (best.score === 0) {
    return { documentType: 'Unclassified', confidence: 10 };
  }

  return { documentType: best.type, confidence };
}
