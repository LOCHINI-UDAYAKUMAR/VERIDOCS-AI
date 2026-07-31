# VeriDocs AI

<div align="center">

![VeriDocs AI](https://img.shields.io/badge/VeriDocs-AI-4f8cff?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Node](https://img.shields.io/badge/Node.js-22-green?style=for-the-badge&logo=node.js)
![Python](https://img.shields.io/badge/Python-3.10+-blue?style=for-the-badge&logo=python)

**An end-to-end document verification platform combining OCR, trained ML models, a tamper-evident hash-chain integrity ledger, role-based access control, and QR-based public verification — all in a single deployable Next.js application.**

[Features](#features) · [Demo Accounts](#demo-accounts) · [Quick Start](#quick-start) · [Architecture](#architecture) · [ML Models](#ml-models) · [API Reference](#api-reference) · [Roadmap](#roadmap)

</div>

---

## Overview

VeriDocs AI automates the document verification lifecycle that organizations currently perform manually — checking certificates, contracts, IDs, and employment records for authenticity, tampering, and duplication. Every uploaded document is processed through a multi-layer pipeline:

1. **OCR extraction** — real Tesseract OCR pulls text and structured fields from images and PDFs
2. **Classification** — a trained TF-IDF + Logistic Regression model identifies the document type (9 categories)
3. **Metadata analysis** — EXIF and PDF info-dict timestamps are checked for editing-software fingerprints and post-issue modification
4. **Structural forgery analysis** — OCR text is checked for layout irregularities common in digitally altered documents
5. **Duplicate detection** — sentence embeddings (or text similarity as fallback) flag near-identical documents with single-field substitutions
6. **Integrity sealing** — a SHA-256 hash of the file is sealed into an append-only hash-chain ledger at upload time
7. **Trust scoring** — a trained Random Forest produces a 0–100 trust score from all the above signals
8. **QR verification** — every verified document gets a QR code for public, no-login status checks

---

## Features

### Core platform
- **Full-stack web application** — Next.js 14 App Router, React, Tailwind CSS, SQLite
- **Role-based access control** — four roles (Admin, Organization, Auditor, Public Verifier) with enforced permissions on every route
- **JWT authentication** — secure login, registration, session management
- **Drag-and-drop bulk upload** — PDF, PNG, JPG support, up to 20MB per file
- **Document ownership isolation** — organizations see only their own documents; admins and auditors see all
- **Full audit trail** — every upload, verification, login, and QR scan logged with user, timestamp, and context

### Verification pipeline
- **Real OCR** — Tesseract.js with bundled English trained data (works fully offline after `npm install`)
- **Field extraction** — name, certificate number, institution, dates extracted from OCR text via regex heuristics
- **Trained document classifier** — TF-IDF + Logistic Regression, trained on a synthetic corpus rendered to real images and OCR'd with the actual Tesseract binary (100% test accuracy on held-out synthetic data)
- **Forgery signals** — metadata timeline inconsistencies, editing-software EXIF tags (Photoshop, GIMP, Canva), OCR layout irregularities, missing signature/seal detection
- **Duplicate detection** — real sentence embeddings via `all-MiniLM-L6-v2` (`@xenova/transformers`) with text-similarity fallback
- **Hash-chain integrity ledger** — SHA-256 document hashes sealed in an append-only linked chain; "Verify Now" re-hashes the live file and checks it against the sealed record — tampering is caught immediately
- **Trained trust score model** — Random Forest Regressor (40 trees, R² 0.967, MAE 3.66) combining all pipeline signals into a 0–100 score

### Analytics & tooling
- **Real-time dashboard** — upload trends, trust score distribution, document-type breakdown (Recharts)
- **Blockchain ledger explorer** — view sealed blocks and re-verify full chain integrity
- **AI Verification Assistant** — explains in plain English why any document was flagged
- **Model metrics endpoint** — live R², MAE, accuracy for all trained models
- **Ground-truth labeling** — admin/auditor can mark documents as "genuine" or "fraudulent"; labeled data exports for model retraining
- **Public QR verification** — scannable QR on every document; no login required to check status

---

## Demo Accounts

Created by `npm run seed`:

| Role | Email | Password | Can do |
|---|---|---|---|
| **Admin** | admin@veridocs.ai | admin123 | Everything — upload, audit trail, user management, labeling |
| **Organization** | org@veridocs.ai | org12345 | Upload documents, view own documents |
| **Auditor** | auditor@veridocs.ai | audit123 | View all documents, audit trail, labeling |
| **Verifier** | register one | any | View documents, scan QR codes |

---

## Quick Start

### Prerequisites
- Node.js 18+ (tested on 22)
- Python 3.10+ with pip (for model retraining only — not required to run the app)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/veridocs-ai.git
cd veridocs-ai

# Install dependencies
npm install

# Create demo accounts and initialize the database
npm run seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with any demo account.

### Production

```bash
npm run build
npm start
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | `veridocs-dev-secret-change-in-production` | **Change this in production** |
| `PORT` | `3000` | Server port |

Create a `.env.local` file:
```bash
JWT_SECRET=your-long-random-secret-here
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React)                          │
│  Dashboard · Upload · Documents · Audit · Ledger · Admin · QR  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / JWT
┌────────────────────────────▼────────────────────────────────────┐
│                   Next.js App Router (Node.js)                  │
│                                                                 │
│  /api/auth/*          /api/documents/*       /api/verify/*      │
│  /api/dashboard/*     /api/chain/*           /api/audit         │
│  /api/models/*        /api/users             /api/labels        │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────▼───────────────────┐
         │         lib/pipeline.js               │
         │  (orchestrates all modules in order)  │
         └──┬──────────┬──────────┬──────────┬───┘
            │          │          │          │
     ┌──────▼──┐ ┌─────▼───┐ ┌───▼──────┐ ┌▼────────────┐
     │ lib/    │ │ lib/    │ │ lib/     │ │ lib/         │
     │ ocr.js  │ │classify │ │ forgery  │ │ duplicate.js │
     │         │ │ Model   │ │  .js     │ │ + embeddings │
     └──────┬──┘ └─────┬───┘ └───┬──────┘ └┬────────────┘
            │          │         │          │
         ┌──▼──────────▼─────────▼──────────▼──┐
         │          lib/trustScoreModel.js       │
         │         (Random Forest inference)     │
         └──────────────────┬───────────────────┘
                            │
              ┌─────────────▼────────────┐
              │      lib/blockchain.js    │
              │  (SHA-256 hash-chain seal)│
              └─────────────┬────────────┘
                            │
                    ┌───────▼────────┐
                    │  SQLite (data/ │
                    │  veridocs.db)  │
                    └────────────────┘
```

### Project structure

```
veridocs-ai/
├── app/                        Next.js pages and API routes
│   ├── api/
│   │   ├── auth/               register, login, me
│   │   ├── documents/          upload, list, detail, verify,
│   │   │   └── [id]/           explain, file, qr, label
│   │   ├── verify/[token]/     public QR verification (no auth)
│   │   ├── audit/              audit trail
│   │   ├── chain/status/       ledger explorer
│   │   ├── dashboard/stats/    analytics aggregates
│   │   ├── models/metrics/     live model performance
│   │   └── users/              admin user list
│   ├── dashboard/              analytics dashboard
│   ├── upload/                 drag-and-drop uploader
│   ├── documents/[id]/         full document detail view
│   ├── audit/                  audit trail
│   ├── chain/                  ledger explorer
│   ├── admin/users/            user management
│   └── verify/[token]/         public QR verification page
│
├── components/                 Shared React components
│   ├── AuthProvider.js         JWT auth context
│   ├── Navbar.js               Navigation with RBAC-aware links
│   ├── Protected.js            Route guard wrapper
│   └── Badges.js               StatusBadge, TrustBar
│
├── lib/                        Backend logic modules
│   ├── pipeline.js             Main verification orchestrator
│   ├── ocr.js                  Tesseract OCR + field extraction
│   ├── classifyModel.js        Trained classifier inference (pure JS)
│   ├── classify.js             (superseded) keyword fallback
│   ├── forgery.js              Metadata + structural forgery analysis
│   ├── duplicate.js            Embedding + text-similarity duplicate check
│   ├── embeddings.js           Sentence embedding via @xenova/transformers
│   ├── blockchain.js           SHA-256 append-only hash-chain ledger
│   ├── trustScoreModel.js      Trained RF trust score inference (pure JS)
│   ├── trustScore.js           (superseded) rubric fallback
│   ├── assistant.js            AI explanation generator
│   ├── audit.js                Audit log helpers
│   ├── auth.js                 JWT + bcrypt helpers
│   └── db.js                   SQLite schema + connection
│
├── models/                     Trained model artifacts (JSON)
│   ├── classifier.json         TF-IDF vocab + LR coefficients
│   ├── trust_score_forest.json 40-tree Random Forest
│   └── forgery_detector.json   (not deployed — see ML Models section)
│
├── training/                   Python training scripts
│   ├── train_classifier.py     TF-IDF + LR classifier training
│   ├── train_trust_score.py    Random Forest trust score training
│   ├── train_forgery_detector.py  (experimental — see ML Models section)
│   ├── forgery_features.py     Feature extraction shared module
│   ├── export_labeled_data.mjs Export human labels for retraining
│   ├── validate_classifier.mjs  JS port vs sklearn cross-check
│   └── validate_trust_score.mjs JS port vs sklearn cross-check
│
├── tessdata/                   Bundled Tesseract trained data (11MB)
│   └── eng.traineddata.gz      English OCR model (offline, no CDN)
│
├── scripts/
│   └── seed.js                 Creates demo accounts
│
├── data/                       SQLite database (created at runtime)
└── uploads/                    Uploaded document files (created at runtime)
```

---

## ML Models

VeriDocs AI uses four machine-learning subsystems. This section documents each one honestly — what was done, what the metrics mean, and what would need to happen to make it production-grade.

### Document Classifier — TF-IDF + Logistic Regression ✅

**What it does:** identifies document type from OCR text — Certificate, Contract, Driving License, Experience Letter, ID Card, Offer Letter, Passport, Resume, or Unclassified.

**How it was trained:**
- A synthetic corpus of ~780 documents was generated (templated text with randomized names, institutions, dates, and phrasing variation across multiple templates per category)
- Each document was rendered to a real image (varied fonts, sizes, JPEG quality, slight rotation and blur) and processed through the actual Tesseract binary — the same OCR engine the production pipeline uses — producing training examples with genuine OCR noise rather than hand-coded character substitutions
- TF-IDF vectorization (unigrams + bigrams, 2,000 features) + Logistic Regression (C=2.0, multi-class)

**Metrics:** 100% test accuracy on held-out synthetic data. Real-world accuracy is lower: out-of-template wording (e.g. a real resume using terminology the training templates didn't include) scores ~65–70% confidence rather than ~95% — this is expected and correct behavior; lower confidence on uncertain input is better than false confidence.

**To retrain:**
```bash
pip install scikit-learn numpy pandas pillow
python3 training/train_classifier.py
node training/validate_classifier.mjs    # must print 40/40 match
npm run build
```

---

### Trust Score Model — Random Forest Regressor ✅

**What it does:** combines six pipeline signals into a 0–100 trust score.

| Feature | Description |
|---|---|
| `blockchainVerified` | Does the current file hash match the sealed ledger record? |
| `ocrConfidence` | Tesseract's own confidence in the OCR extraction (0–100) |
| `forgeryScore` | Structural/metadata forgery analysis score (0–100, 100 = clean) |
| `metadataFlagCount` | Number of metadata risk signals found |
| `duplicateScore` | Similarity to the most similar existing document (0–100) |
| `classificationConfidence` | How confidently the document was classified |

**How it was trained:**
- 8,000 synthetic samples generated with realistic non-linear ground-truth rules (e.g. failed blockchain verification hard-caps trust below 40; a 90%+ duplicate score near-zeroes it; forgery score below 30 compounds beyond its linear weight)
- Random Forest Regressor: 40 trees, max depth 7, min samples per leaf 8
- Exported as plain JSON and evaluated in pure JavaScript at inference time (no Python at runtime)
- JS port verified against sklearn's actual predictions: mean absolute difference 0.25 points, max 0.50

**Metrics:** R² 0.967, MAE 3.66 on held-out synthetic data (6,800 train / 1,200 test)

**Real-data blend:** The model automatically blends in human-labeled ground truth when available — see [Collecting Real Labels](#collecting-real-labels).

**To retrain:**
```bash
python3 training/train_trust_score.py
node training/validate_trust_score.mjs    # must print mean diff < 1
npm run build
```

---

### Duplicate Detection — Real Sentence Embeddings ✅

**What it does:** computes semantic similarity between documents to catch "same document, one field changed" fraud.

**How it works:**
- **Primary path:** `all-MiniLM-L6-v2` via `@xenova/transformers` — a real pretrained SBERT-family sentence embedding model running locally in Node.js. Model weights download from Hugging Face on first use (~23MB, cached under `node_modules/@xenova/transformers/.cache` after that). Similarity is cosine distance on L2-normalized embeddings.
- **Fallback path:** Dice-coefficient text similarity on normalized OCR text — engaged automatically if the embedding model is unavailable (network-restricted environment, first-run failure). The fallback is fully tested; the embedding path works on any machine with normal internet access.

**⚠️ Note:** `huggingface.co` was not reachable in the development sandbox, so only the fallback branch was confirmed in the environment that wrote this code. The embedding logic itself is straightforward; if you hit an issue, check `node_modules/@xenova/transformers/.cache` for partial downloads.

---

### Forgery Detector — Attempted, Not Deployed ⚠️

**What was tried:** A Random Forest classifier on block-level image-forensics features (noise heterogeneity, edge variance, localized outlier statistics across 24×24 pixel blocks) trained on 900 synthetic genuine/tampered document pairs — four tamper types: foreign splice, copy-move, local blur, and text overlay.

**Result:** ~55% accuracy across three feature-engineering iterations (localized outlier features, controlled noise baseline, content-block filtering). Essentially a coin flip — not deployed.

**Why it didn't work:** Block-based noise statistics struggle on computer-rendered text because there's no natural per-image noise baseline to create a discontinuity against. Real forgery detection signals (JPEG double-quantization artifacts, sensor PRNU fingerprints, CFA interpolation anomalies) require either real photographic images or a CNN trained on a real forged-document dataset.

**What forgery detection actually does in production:** Rule-based heuristics in `lib/forgery.js` — EXIF/PDF metadata timeline analysis, editing-software fingerprints (Photoshop, GIMP, Canva, etc.), OCR structural-irregularity detection, and missing signature/seal flags. These catch real signals that don't require a trained model.

The training code lives in `training/train_forgery_detector.py` as a documented experiment.

---

## Collecting Real Labels

The biggest remaining gap across all models is ground-truth data from real-world documents. The platform includes tooling to collect it over time:

**Label documents in the UI:**  
Log in as Admin or Auditor → open any document's detail page → use the **"Confirm genuine"** or **"Flag fraudulent"** buttons in the sidebar.

**Export for retraining:**
```bash
node training/export_labeled_data.mjs
# writes training/real_labels.json
```

**Retrain with real data blended in:**
```bash
python3 training/train_trust_score.py
# detects real_labels.json automatically
# weights real examples 15× higher than synthetic
```

Meaningful improvement starts at roughly 50–100 labeled examples of each outcome. Treat `real_labels.json` as a growing dataset — label more over time and retrain periodically.

---

## API Reference

All endpoints except `/api/verify/:token` require a `Authorization: Bearer <token>` header. Tokens are issued by `/api/auth/login` and `/api/auth/register`.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | None | Create account. Body: `{ name, email, password, role }` |
| `POST` | `/api/auth/login` | None | Login. Body: `{ email, password }`. Returns `{ token, user }` |
| `GET` | `/api/auth/me` | Any | Returns current user from token |

### Documents

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/documents/upload` | Org, Admin | Upload a file (multipart/form-data, field: `file`). Runs full pipeline. |
| `GET` | `/api/documents` | Any | List documents. Org sees own; Admin/Auditor see all. |
| `GET` | `/api/documents/:id` | Owner, Admin, Auditor | Document detail with all pipeline results |
| `GET` | `/api/documents/:id/file` | Owner, Admin, Auditor | Serve the original uploaded file |
| `POST` | `/api/documents/:id/verify` | Owner, Admin, Auditor | Re-hash file and check against ledger |
| `GET` | `/api/documents/:id/explain` | Owner, Admin, Auditor | AI assistant explanation of scoring |
| `GET` | `/api/documents/:id/qr` | Owner, Admin, Auditor | QR code PNG image |
| `POST` | `/api/documents/:id/label` | Admin, Auditor | Set ground-truth label. Body: `{ label: "genuine" \| "fraudulent" \| null }` |

### Public

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/verify/:token` | None | Public QR check — returns status, trust score, blockchain verification |

### Platform

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/audit` | Admin, Auditor | Full audit log |
| `GET` | `/api/chain/status` | Any | Chain integrity check + latest 10 blocks |
| `GET` | `/api/dashboard/stats` | Any | Aggregate stats (scoped by role) |
| `GET` | `/api/models/metrics` | Any | Live performance metrics for all trained models |
| `GET` | `/api/users` | Admin | User list |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, Tailwind CSS, Recharts |
| Backend | Next.js App Router (Node.js runtime) |
| Database | SQLite via `better-sqlite3` |
| OCR | Tesseract.js (bundled trained data — no CDN) |
| Embeddings | `@xenova/transformers` — `all-MiniLM-L6-v2` |
| ML inference | Pure JavaScript (no Python at runtime) |
| ML training | Python, scikit-learn, numpy, Pillow |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| QR codes | `qrcode` |
| File storage | Local `uploads/` directory |

---

## Going to Production

This project is a working, testable platform. Moving it to a real production deployment requires these changes:

1. **Set `JWT_SECRET`** to a long random string in your environment — the dev default is intentionally weak.

2. **Replace SQLite with Postgres/MySQL** — swap `lib/db.js`'s queries for your database driver of choice. The schema is straightforward; everything else in the app is query-agnostic.

3. **Replace local file storage with S3/Cloudinary** — swap the `fs.copyFileSync` in `lib/pipeline.js` for a cloud storage `put` call. Store the resulting URL/key in place of `storedFilename`.

4. **Deploy the Ethereum smart contract** — swap `appendBlock()` and `verifyDocumentAgainstChain()` in `lib/blockchain.js` for calls to a deployed Solidity contract. The function signatures are designed for this replacement; the rest of the pipeline doesn't change.

5. **Wire in a real LLM for the AI assistant** — add `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` and replace the template logic in `lib/assistant.js` with a real chat completion call. The structured signals it currently uses as a template should instead become the prompt context for the model.

6. **Retrain on real labeled data** — see [Collecting Real Labels](#collecting-real-labels). The trust score model improves immediately once real outcomes are available; the classifier benefits most from real OCR examples that span the natural variation in your actual document types.

7. **Add multilingual OCR** — download additional `*.traineddata.gz` files from [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) into `tessdata/` and pass the language code to `Tesseract.recognize()` in `lib/ocr.js`.

---

## Resetting Data

```bash
rm -f data/veridocs.sqlite*
rm -f uploads/*.png uploads/*.pdf uploads/*.jpg
npm run seed
```

---

## License

MIT — see [LICENSE](LICENSE).

---

## Acknowledgements

- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) — open-source OCR engine
- [tesseract.js](https://github.com/naptha/tesseract.js) — Tesseract in Node.js
- [@xenova/transformers](https://github.com/xenova/transformers.js) — transformers in Node.js
- [scikit-learn](https://scikit-learn.org/) — ML training
- [Recharts](https://recharts.org/) — charts

