import fs from 'fs';
import path from 'path';

/**
 * Pure-JS inference for the TF-IDF + Logistic Regression classifier
 * trained in training/train_classifier.py (scikit-learn -> exported JSON).
 * Reimplements sklearn's default TfidfVectorizer preprocessing (lowercase,
 * \w{2,} tokenization, unigrams+bigrams, L2-normalized TF-IDF) and a
 * standard multinomial logistic regression forward pass (softmax over
 * linear logits) so no Python/native dependency is needed at request time.
 */

let cached = null;

function loadModel() {
  if (cached) return cached;
  const p = path.join(process.cwd(), 'models', 'classifier.json');
  cached = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return cached;
}

function tokenize(text) {
  return (text || '').toLowerCase().match(/\w{2,}/g) || [];
}

function ngrams(tokens, ranges) {
  const [minN, maxN] = ranges;
  const out = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      out.push(tokens.slice(i, i + n).join(' '));
    }
  }
  return out;
}

function tfidfVector(text, model) {
  const tokens = tokenize(text);
  const grams = ngrams(tokens, model.ngram_range);
  const counts = new Map();
  for (const g of grams) {
    if (Object.prototype.hasOwnProperty.call(model.vocabulary, g)) {
      counts.set(g, (counts.get(g) || 0) + 1);
    }
  }

  const nFeatures = model.idf.length;
  const vec = new Float64Array(nFeatures);
  for (const [term, count] of counts.entries()) {
    const idx = model.vocabulary[term];
    vec[idx] = count * model.idf[idx];
  }

  // L2 normalize (sklearn TfidfVectorizer default norm='l2')
  let normSq = 0;
  for (let i = 0; i < nFeatures; i++) normSq += vec[i] * vec[i];
  const norm = Math.sqrt(normSq) || 1;
  for (let i = 0; i < nFeatures; i++) vec[i] /= norm;

  return vec;
}

function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function classifyDocumentML(ocrText) {
  const model = loadModel();
  const x = tfidfVector(ocrText, model);

  const logits = model.coef.map((rowCoef, classIdx) => {
    let dot = model.intercept[classIdx];
    for (let i = 0; i < rowCoef.length; i++) {
      if (x[i] !== 0) dot += rowCoef[i] * x[i];
    }
    return dot;
  });

  const probs = softmax(logits);
  let bestIdx = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[bestIdx]) bestIdx = i;

  return {
    documentType: model.classes[bestIdx],
    confidence: Math.round(probs[bestIdx] * 100),
  };
}

export function getClassifierMetrics() {
  return loadModel().metrics;
}
