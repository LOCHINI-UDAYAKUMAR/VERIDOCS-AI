import { predictTrustScoreML } from '../lib/trustScoreModel.js';
import fs from 'fs';

const validationSet = JSON.parse(fs.readFileSync(new URL('./trust_validation_set.json', import.meta.url)));

let totalDiff = 0;
let maxDiff = 0;
for (const row of validationSet) {
  const { sklearn_pred, ...features } = row;
  const jsPred = predictTrustScoreML(features);
  const diff = Math.abs(jsPred - sklearn_pred);
  totalDiff += diff;
  maxDiff = Math.max(maxDiff, diff);
  if (diff > 1) {
    console.log(`DIFF ${diff.toFixed(2)}: sklearn=${sklearn_pred.toFixed(2)} js=${jsPred} features=${JSON.stringify(features)}`);
  }
}

console.log(`\nMean abs diff: ${(totalDiff / validationSet.length).toFixed(4)}, max diff: ${maxDiff.toFixed(2)} (rounding accounts for <1)`);
if (maxDiff > 1.5) process.exit(1);
