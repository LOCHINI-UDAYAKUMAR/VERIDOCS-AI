// Exports every document a human has labeled (via the "Confirm genuine" /
// "Flag fraudulent" buttons on the document detail page, or POST
// /api/documents/[id]/label) into a JSON file of real feature vectors +
// real outcomes — the actual real-world training data the synthetic
// dataset in training/train_trust_score.py is a stand-in for.
//
// Usage:
//   node training/export_labeled_data.mjs
//
// Then merge training/real_labels.json into training/train_trust_score.py
// (see the README section "Training the models" for how) and retrain.
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'data', 'veridocs.sqlite');
if (!fs.existsSync(dbPath)) {
  console.error('No database found at data/veridocs.sqlite — run the app and label some documents first.');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
const rows = db.prepare(`
  SELECT id, originalFilename, ocrConfidence, forgeryScore, duplicateScore,
         classificationConfidence, metadataFlags, trustScore, humanLabel, humanLabeledAt
  FROM documents
  WHERE humanLabel IS NOT NULL
  ORDER BY humanLabeledAt DESC
`).all();

if (rows.length === 0) {
  console.log('No labeled documents yet.');
  console.log('Label some via the document detail page ("Confirm genuine" / "Flag fraudulent" buttons,');
  console.log('visible to Admin/Auditor accounts) and re-run this script.');
  process.exit(0);
}

const exported = rows.map((r) => {
  let metadataFlagCount = 0;
  try { metadataFlagCount = (JSON.parse(r.metadataFlags) || []).length; } catch (e) {}

  return {
    // Feature vector — same shape computeTrustScore()/predictTrustScoreML() consume
    blockchainVerified: 1, // true at the time these were sealed; re-verify if you want live state instead
    ocrConfidence: r.ocrConfidence,
    forgeryScore: r.forgeryScore,
    metadataFlagCount,
    duplicateScore: r.duplicateScore,
    classificationConfidence: r.classificationConfidence,
    // Real ground truth, not the synthetic label-generating function
    label: r.humanLabel, // 'genuine' | 'fraudulent'
    // For traceability
    documentId: r.id,
    filename: r.originalFilename,
    labeledAt: r.humanLabeledAt,
  };
});

const outPath = path.join(process.cwd(), 'training', 'real_labels.json');
fs.writeFileSync(outPath, JSON.stringify(exported, null, 2));

const genuine = exported.filter((e) => e.label === 'genuine').length;
const fraudulent = exported.filter((e) => e.label === 'fraudulent').length;
console.log(`Exported ${exported.length} labeled documents (${genuine} genuine, ${fraudulent} fraudulent) to training/real_labels.json`);
if (exported.length < 50) {
  console.log('\nNote: this is a small sample. Real-data retraining becomes meaningful once you have');
  console.log('at least a few hundred labeled examples spanning both outcomes — treat this export as');
  console.log('a growing dataset to accumulate over time, not a one-shot replacement for the synthetic data.');
}
