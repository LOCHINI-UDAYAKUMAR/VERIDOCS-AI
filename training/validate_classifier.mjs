import { classifyDocumentML } from '../lib/classifyModel.js';
import fs from 'fs';

const validationSet = JSON.parse(fs.readFileSync(new URL('./validation_set.json', import.meta.url)));

let matches = 0;
for (const [text, sklearnPred] of validationSet) {
  const jsResult = classifyDocumentML(text);
  const ok = jsResult.documentType === sklearnPred;
  if (ok) matches++;
  else console.log(`MISMATCH: sklearn="${sklearnPred}" js="${jsResult.documentType}" (${jsResult.confidence}%) text="${text.slice(0, 60)}..."`);
}

console.log(`\n${matches}/${validationSet.length} predictions match sklearn exactly.`);
if (matches !== validationSet.length) process.exit(1);
