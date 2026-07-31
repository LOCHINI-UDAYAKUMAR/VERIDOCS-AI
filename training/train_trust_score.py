"""
Trains a real Random Forest Regressor for the VeriDocs AI trust score,
replacing the hand-tuned weighted rubric in lib/trustScore.js.

There's no real labeled dataset (no corpus of documents a human has already
adjudicated as trustworthy/fraudulent), so this generates a synthetic one
with realistic non-linear business rules baked into the label-generating
function (hard caps when blockchain verification fails, when duplicate
similarity is extreme, etc.) — the kind of interaction effects a linear
rubric can't represent well but a tree ensemble can learn directly from
data. The model is real and really trained; the ground truth it's trained
against is synthetic, which is disclosed here and in the README.

Output: models/trust_score_forest.json — a plain JSON export of the forest
(feature index / threshold / children per node) so it can be evaluated in
pure JavaScript at inference time with zero Python/native dependencies.
"""
import json
import os
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

rng = np.random.default_rng(42)
N = 8000

FEATURES = [
    "blockchainVerified",       # 0 or 1
    "ocrConfidence",            # 0-100
    "forgeryScore",             # 0-100 (100 = clean)
    "metadataFlagCount",        # 0-5
    "duplicateScore",           # 0-100 (100 = exact duplicate, bad)
    "classificationConfidence", # 0-100
]

def generate_sample():
    # Correlate OCR confidence and classification confidence loosely, since
    # both derive from overall document/image quality in the real pipeline.
    quality = rng.beta(5, 2)  # skewed toward higher quality
    ocr_confidence = np.clip(rng.normal(quality * 100, 12), 0, 100)
    classification_confidence = np.clip(rng.normal(quality * 100, 15), 0, 100)

    blockchain_verified = rng.choice([1, 0], p=[0.85, 0.15])
    forgery_score = np.clip(rng.normal(quality * 90 + 5, 18), 0, 100)
    metadata_flag_count = rng.choice([0, 1, 2, 3, 4, 5], p=[0.55, 0.2, 0.12, 0.07, 0.04, 0.02])
    # Mix in a meaningful share of high-similarity (near-duplicate) cases —
    # a pure beta(1.5,6) distribution puts ~0% of mass above 85, so the
    # forest never saw enough examples to learn that split at all.
    if rng.random() < 0.15:
        duplicate_score = np.clip(rng.uniform(85, 100), 0, 100)
    else:
        duplicate_score = np.clip(rng.beta(1.5, 6) * 100, 0, 100)  # mostly low

    return {
        "blockchainVerified": blockchain_verified,
        "ocrConfidence": ocr_confidence,
        "forgeryScore": forgery_score,
        "metadataFlagCount": metadata_flag_count,
        "duplicateScore": duplicate_score,
        "classificationConfidence": classification_confidence,
    }

def label_trust_score(s):
    # Baseline weighted combination (mirrors the original hand-tuned rubric)
    base = (
        s["blockchainVerified"] * 100 * 0.25 +
        s["ocrConfidence"] * 0.15 +
        s["forgeryScore"] * 0.30 +
        max(0, 100 - s["metadataFlagCount"] * 20) * 0.10 +
        (0 if s["duplicateScore"] >= 85 else 100 - s["duplicateScore"] * 0.3) * 0.15 +
        s["classificationConfidence"] * 0.05
    )

    # Non-linear business-rule interactions a tree ensemble can capture
    # directly but a single linear formula can't represent well:
    if s["blockchainVerified"] == 0:
        base = min(base, 40)  # integrity failure hard-caps trust regardless of everything else
    if s["duplicateScore"] >= 90:
        base = min(base, 15)  # near-exact duplicate is close to disqualifying on its own
    if s["forgeryScore"] < 30:
        base -= 15  # severe forgery signal compounds beyond its linear weight
    if s["metadataFlagCount"] >= 4 and s["forgeryScore"] < 60:
        base -= 10  # multiple metadata flags + weak forgery score compound each other

    noise = rng.normal(0, 4)
    return float(np.clip(base + noise, 0, 100))

rows = [generate_sample() for _ in range(N)]
X = np.array([[r[f] for f in FEATURES] for r in rows])
y = np.array([label_trust_score(r) for r in rows])
sample_weight = np.ones(len(y))

# Blend in real human-labeled data if training/export_labeled_data.mjs has
# been run (see README "Training the models" -> "Using real data"). Real
# examples are weighted higher than synthetic ones and their trust score
# is mapped from the binary genuine/fraudulent label rather than a
# generated float, since that's the actual signal a human provided.
real_labels_path = "training/real_labels.json"
if os.path.exists(real_labels_path):
    with open(real_labels_path) as f:
        real_rows = json.load(f)
    if real_rows:
        real_X = np.array([[r[f] for f in FEATURES] for r in real_rows])
        real_y = np.array([95.0 if r["label"] == "genuine" else 10.0 for r in real_rows])
        real_weight = np.full(len(real_y), 15.0)  # real examples count ~15x a synthetic one
        X = np.vstack([X, real_X])
        y = np.concatenate([y, real_y])
        sample_weight = np.concatenate([sample_weight, real_weight])
        print(f"Blended in {len(real_rows)} real labeled examples from {real_labels_path} (weight 15x)")


X_train, X_test, y_train, y_test, w_train, _ = train_test_split(
    X, y, sample_weight, test_size=0.15, random_state=42
)

model = RandomForestRegressor(
    n_estimators=40,
    max_depth=7,
    min_samples_leaf=8,
    random_state=42,
)
model.fit(X_train, y_train, sample_weight=w_train)

pred = model.predict(X_test)
mae = mean_absolute_error(y_test, pred)
r2 = r2_score(y_test, pred)
print(f"Trust score model — MAE: {mae:.2f}, R^2: {r2:.4f}")
print("Feature importances:")
for f, imp in sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1]):
    print(f"  {f}: {imp:.3f}")


def export_tree(tree):
    t = tree.tree_

    def export_node(node_id):
        if t.feature[node_id] == -2:  # leaf
            return {"v": float(t.value[node_id][0][0])}
        return {
            "f": int(t.feature[node_id]),
            "t": float(t.threshold[node_id]),
            "l": export_node(t.children_left[node_id]),
            "r": export_node(t.children_right[node_id]),
        }

    return export_node(0)


forest_json = {
    "features": FEATURES,
    "trees": [export_tree(est) for est in model.estimators_],
    "metrics": {"mae": mae, "r2": r2, "n_train": len(X_train), "n_test": len(X_test)},
}

with open("models/trust_score_forest.json", "w") as f:
    json.dump(forest_json, f)

print(f"\nExported {len(model.estimators_)} trees to models/trust_score_forest.json")

# Export a validation set (feature dict + sklearn's own prediction) to
# cross-check the pure-JS forest-evaluation port against the real model.
val_rows = X_test[:40].tolist()
val_preds = pred[:40].tolist()
val_sample = [
    {**{f: row[i] for i, f in enumerate(FEATURES)}, "sklearn_pred": p}
    for row, p in zip(val_rows, val_preds)
]
with open("training/trust_validation_set.json", "w") as f:
    json.dump(val_sample, f, indent=2)
print(f"Exported {len(val_sample)} validation examples to training/trust_validation_set.json")
