"""
Trains a real Random Forest classifier for image-level forgery detection,
adding a genuinely trained signal to lib/forgery.js (which previously only
had metadata/OCR-text heuristics — this is disclosed in the README).

There's no labeled real-world forged-document dataset available in this
environment, so this generates its own: genuine documents (rendered text,
sometimes with realistic GLOBAL degradation — blur/rotation/compression
applied uniformly, so the model can't just learn "any noise = forged") and
forged counterparts (a genuine image with a LOCAL tamper — a spliced patch
from a different render, a copy-moved region, a blurred-out signature/seal
area, or an overlaid text patch in a different font — applied to only part
of the image). The features (see forgery_features.py) measure block-level
noise/edge heterogeneity, which is what should distinguish "uniformly
degraded everywhere" from "tampered in one spot" regardless of the overall
quality level.

Honest caveat: this model has learned to detect *this generator's*
tampering patterns, not forgery in general — a real deployment should
retrain on genuine forged-document cases once available. Still a real,
non-trivial trained signal beyond pure heuristics.

Output: models/forgery_detector.json (exported Random Forest, same
tree-JSON format as trust_score_forest.json) + a validation set for
cross-checking the JS port.
"""
import json
import random
import tempfile
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score

from forgery_features import extract_features, FEATURE_NAMES

random.seed(7)
np.random.seed(7)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONT_FILES = ["DejaVuSans.ttf", "DejaVuSerif.ttf", "DejaVuSansCondensed.ttf"]

WORDS = ["CERTIFICATE", "Name:", "Institution:", "Signature", "Date of Issue:", "Certificate Number:",
         "Official Seal", "Awarded to", "has completed", "the program", "Authorized by", "ID Number:"]


def random_doc_text():
    lines = []
    for _ in range(random.randint(6, 9)):
        lines.append(" ".join(random.choice(WORDS) for _ in range(random.randint(2, 5))))
    return "\n".join(lines)


def render_genuine(degrade=None, noise_sigma=None):
    """Renders a document image with a realistic per-image noise baseline.
    Blur/rotation intentionally kept minimal and decoupled from the noise
    level so degradation doesn't confound with the tamper signal we're
    trying to isolate (see module docstring for why this matters)."""
    font_path = os.path.join(FONT_DIR, random.choice(FONT_FILES))
    font = ImageFont.truetype(font_path, random.randint(16, 22))
    img = Image.new("RGB", (700, 500), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    y = 30
    for line in random_doc_text().split("\n"):
        d.text((40, y), line, fill=(0, 0, 0), font=font)
        y += 45

    if random.random() > 0.85:
        img = img.rotate(random.uniform(-0.5, 0.5), fillcolor=(255, 255, 255))

    noise_sigma = noise_sigma if noise_sigma is not None else random.uniform(2.0, 5.0)
    arr = np.array(img, dtype=np.float64)
    arr += np.random.normal(0, noise_sigma, arr.shape)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def apply_local_tamper(img, other_img):
    """Applies ONE localized tamper to a copy of `img`, using `other_img` as
    an external source for splicing. Returns the tampered image."""
    tampered = img.copy()
    w, h = tampered.size
    pw, ph = random.randint(100, 220), random.randint(40, 90)
    x = random.randint(0, max(1, w - pw))
    y = random.randint(0, max(1, h - ph))

    kind = random.choice(["splice_foreign", "copy_move", "local_blur", "text_overlay"])

    if kind == "splice_foreign":
        ow, oh = other_img.size
        ox = random.randint(0, max(1, ow - pw))
        oy = random.randint(0, max(1, oh - ph))
        patch = other_img.crop((ox, oy, ox + pw, oy + ph))
        tampered.paste(patch, (x, y))

    elif kind == "copy_move":
        sx = random.randint(0, max(1, w - pw))
        sy = random.randint(0, max(1, h - ph))
        patch = tampered.crop((sx, sy, sx + pw, sy + ph))
        tampered.paste(patch, (x, y))

    elif kind == "local_blur":
        region = tampered.crop((x, y, x + pw, y + ph))
        region = region.filter(ImageFilter.GaussianBlur(radius=4))
        tampered.paste(region, (x, y))

    elif kind == "text_overlay":
        d = ImageDraw.Draw(tampered)
        d.rectangle([x, y, x + pw, y + ph], fill=(255, 255, 255))
        font_path = os.path.join(FONT_DIR, "DejaVuSansCondensed-Bold.ttf")
        font = ImageFont.truetype(font_path, random.randint(14, 20))
        d.text((x + 4, y + 4), random.choice(WORDS), fill=(10, 10, 10), font=font)

    return tampered, kind


def save_and_size(img, quality=None):
    quality = quality or random.randint(88, 95)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        path = f.name
    img.save(path, quality=quality)
    size = os.path.getsize(path)
    return path, size


N = 900
rows, labels, kinds = [], [], []
genuine_pool = [render_genuine() for _ in range(60)]  # source pool for foreign splices

print("Generating synthetic genuine/tampered documents and extracting features...")
for i in range(N):
    base = render_genuine()
    is_forged = random.random() < 0.5

    if is_forged:
        other = random.choice(genuine_pool)
        img, kind = apply_local_tamper(base, other)
    else:
        img, kind = base, "genuine"

    path, size = save_and_size(img)
    try:
        feats = extract_features(Image.open(path), size)
    finally:
        os.unlink(path)

    rows.append([feats[f] for f in FEATURE_NAMES])
    labels.append(1 if is_forged else 0)
    kinds.append(kind)

    if (i + 1) % 150 == 0:
        print(f"  {i + 1}/{N} generated")

X = np.array(rows)
y = np.array(labels)

X_train, X_test, y_train, y_test, kinds_train, kinds_test = train_test_split(
    X, y, kinds, test_size=0.2, random_state=7, stratify=y
)

model = RandomForestClassifier(n_estimators=50, max_depth=6, min_samples_leaf=6, random_state=7)
model.fit(X_train, y_train)

pred = model.predict(X_test)
proba = model.predict_proba(X_test)[:, 1]
acc = accuracy_score(y_test, pred)
auc = roc_auc_score(y_test, proba)
print(f"\nForgery detector — accuracy: {acc:.4f}, ROC-AUC: {auc:.4f}")
print(classification_report(y_test, pred, target_names=["genuine", "forged"]))
print("Feature importances:")
for f, imp in sorted(zip(FEATURE_NAMES, model.feature_importances_), key=lambda x: -x[1]):
    print(f"  {f}: {imp:.3f}")

print("\nAccuracy by tamper kind (test set):")
kinds_test_arr = np.array(kinds_test)
for k in sorted(set(kinds_test)):
    mask = kinds_test_arr == k
    if mask.sum() == 0:
        continue
    print(f"  {k}: {accuracy_score(y_test[mask], pred[mask]):.3f} (n={mask.sum()})")


def export_tree(tree):
    t = tree.tree_

    def export_node(node_id):
        if t.feature[node_id] == -2:
            # value is [[n_genuine, n_forged]] counts at this leaf -> P(forged)
            counts = t.value[node_id][0]
            p_forged = float(counts[1] / counts.sum())
            return {"v": p_forged}
        return {
            "f": int(t.feature[node_id]),
            "t": float(t.threshold[node_id]),
            "l": export_node(t.children_left[node_id]),
            "r": export_node(t.children_right[node_id]),
        }

    return export_node(0)


forest_json = {
    "features": FEATURE_NAMES,
    "trees": [export_tree(est) for est in model.estimators_],
    "metrics": {"accuracy": acc, "roc_auc": auc, "n_train": len(X_train), "n_test": len(X_test)},
}

with open("models/forgery_detector.json", "w") as f:
    json.dump(forest_json, f)
print("\nExported to models/forgery_detector.json")

val_sample = [
    {**{feat: float(row[i]) for i, feat in enumerate(FEATURE_NAMES)}, "sklearn_proba": float(p)}
    for row, p in zip(X_test[:40], proba[:40])
]
with open("training/forgery_validation_set.json", "w") as f:
    json.dump(val_sample, f, indent=2)
print(f"Exported {len(val_sample)} validation examples to training/forgery_validation_set.json")
