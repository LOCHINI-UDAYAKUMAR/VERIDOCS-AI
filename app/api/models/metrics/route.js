import { NextResponse } from 'next/server';
import { getUserFromRequest } from '../../../../lib/auth';
import { getTrustModelMetrics } from '../../../../lib/trustScoreModel';
import { getClassifierMetrics } from '../../../../lib/classifyModel';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let forgeryModelStatus = { status: 'not_deployed', reason: 'Forgery detection uses rule-based heuristics (metadata + OCR structural analysis). A trained CNN/ELA model was attempted but did not reach meaningful accuracy on synthetic data — see training/train_forgery_detector.py and README for details.' };
  const forgeryPath = path.join(process.cwd(), 'models', 'forgery_detector.json');
  if (fs.existsSync(forgeryPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(forgeryPath, 'utf-8')).metrics;
      forgeryModelStatus = { status: 'trained_not_deployed', ...meta, reason: 'Trained on synthetic tampered images but accuracy did not meaningfully exceed random baseline on this synthetic data; not wired into the live pipeline.' };
    } catch (e) { /* ignore */ }
  }

  return NextResponse.json({
    trustScoreModel: {
      type: 'Random Forest Regressor (40 trees, max depth 7)',
      trainedOn: 'Synthetic labeled data (8,000 samples) + real human labels when available',
      ...getTrustModelMetrics(),
    },
    classifierModel: {
      type: 'TF-IDF (unigrams+bigrams) + Logistic Regression — OCR trained on real Tesseract output',
      trainedOn: 'Synthetic documents rendered to images and OCR\'d with real Tesseract binary',
      ...getClassifierMetrics(),
    },
    forgeryModel: forgeryModelStatus,
    duplicateDetection: {
      type: 'Real sentence embeddings (all-MiniLM-L6-v2 via @xenova/transformers) with text-similarity fallback',
      note: 'Embedding model downloads from Hugging Face on first use. Falls back to Dice-coefficient text similarity if unavailable.',
    },
  });
}
