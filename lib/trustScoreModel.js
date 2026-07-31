import fs from 'fs';
import path from 'path';

/**
 * Pure-JS inference for the Random Forest trained in
 * training/train_trust_score.py (scikit-learn -> exported tree JSON).
 * No native/Python dependency at request time — this just walks the
 * exported decision trees and averages their leaf outputs, which is
 * exactly what sklearn's RandomForestRegressor.predict() does internally.
 */

let cached = null;

function loadModel() {
  if (cached) return cached;
  const p = path.join(process.cwd(), 'models', 'trust_score_forest.json');
  cached = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return cached;
}

function evalTree(node, x) {
  if (node.v !== undefined) return node.v; // leaf
  return x[node.f] <= node.t ? evalTree(node.l, x) : evalTree(node.r, x);
}

export function predictTrustScoreML(featuresObj) {
  const model = loadModel();
  const x = model.features.map((f) => Number(featuresObj[f]) || 0);
  const preds = model.trees.map((tree) => evalTree(tree, x));
  const mean = preds.reduce((a, b) => a + b, 0) / preds.length;
  return Math.round(Math.max(0, Math.min(100, mean)));
}

export function getTrustModelMetrics() {
  return loadModel().metrics;
}
