/**
 * SUPERSEDED: the pipeline now uses the trained Random Forest model in
 * lib/trustScoreModel.js (see training/train_trust_score.py). The
 * computeTrustScore() rubric below is kept as a dependency-free fallback /
 * reference implementation and is no longer called by lib/pipeline.js.
 * statusFromScore() below IS still used (by both the ML path and this one).
 *
 * Module 9: Trust Score Engine.
 * Spec calls for a trained Random Forest / XGBoost model over the signals
 * below. Without labeled training data, a hand-tuned weighted rubric over
 * the *same* input features is the honest equivalent — the weights are
 * the "learned" parameters an ML model would otherwise discover, and this
 * function is written so those weights can be swapped for `model.predict()`
 * later without touching any caller.
 */

const WEIGHTS = {
  blockchainVerified: 0.25,
  ocrConfidence: 0.15,
  forgeryScore: 0.30,
  metadataClean: 0.10,
  duplicateCheck: 0.15,
  classificationConfidence: 0.05,
};

export function statusFromScore(trustScore) {
  if (trustScore >= 80) return 'Verified';
  if (trustScore >= 50) return 'Needs Review';
  return 'Rejected';
}

export function computeTrustScore({
  blockchainVerified,
  ocrConfidence, // 0-100
  forgeryScore, // 0-100, 100 = clean
  metadataFlagCount,
  duplicateScore, // 0-100, 100 = exact duplicate (bad)
  classificationConfidence, // 0-100
}) {
  const blockchainComponent = blockchainVerified ? 100 : 0;
  const metadataComponent = Math.max(0, 100 - metadataFlagCount * 20);
  const duplicateComponent = duplicateScore >= 85 ? 0 : 100 - duplicateScore * 0.3;

  const weighted =
    blockchainComponent * WEIGHTS.blockchainVerified +
    ocrConfidence * WEIGHTS.ocrConfidence +
    forgeryScore * WEIGHTS.forgeryScore +
    metadataComponent * WEIGHTS.metadataClean +
    duplicateComponent * WEIGHTS.duplicateCheck +
    classificationConfidence * WEIGHTS.classificationConfidence;

  const trustScore = Math.round(Math.max(0, Math.min(100, weighted)));
  const status = statusFromScore(trustScore);

  return {
    trustScore,
    status,
    breakdown: {
      blockchainComponent,
      ocrConfidence,
      forgeryScore,
      metadataComponent,
      duplicateComponent,
      classificationConfidence,
    },
  };
}
