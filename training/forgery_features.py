"""
Shared image-forensics feature extraction for the forgery detector.

Design constraint: every feature here must be computable identically in
Python (training, via PIL/numpy) and JavaScript (inference, via jimp) with
no dependency on JPEG re-encoding behavior — different JPEG encoders (PIL's
libjpeg vs jimp's jpeg-js) produce different byte-level artifacts, so any
"recompress and diff" (Error-Level-Analysis-style) feature would silently
drift between the two languages and invalidate the trained model. Verified
by direct pixel comparison: PIL and jimp decode identical RGB values for
the same file; the only discrepancy is the grayscale conversion formula,
so grayscale conversion here uses PIL's exact ITU-R 601-2 integer formula
(L = (R*299 + G*587 + B*114) // 1000) rather than either library's
built-in .convert('L') / .greyscale(), and lib/forgeryModel.js replicates
this exact formula in JS.

Features are block-based noise/edge statistics (an established, low-tech
image-forensics technique): genuine documents tend to have fairly uniform
noise/edge characteristics across the page, while a locally spliced,
copy-pasted, or touched-up region creates a statistical discontinuity
between blocks. This doesn't require a labeled real-world forgery dataset
to compute — it's a general signal, not something we memorize from the
(here, synthetic) training set.
"""
import numpy as np
from PIL import Image

FEATURE_NAMES = [
    "fileSizeBytesPerPixel",
    "globalEdgeVariance",
    "blockNoiseHeterogeneity",
    "meanBlockNoiseVariance",
    "colorChannelStdMean",
    "highFreqEnergyRatio",
    "maxBlockNoiseDeviation",
    "maxBlockEdgeDeviation",
]

BLOCK = 24


def to_grayscale_array(img: Image.Image) -> np.ndarray:
    rgb = np.array(img.convert("RGB"), dtype=np.int64)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    L = (r * 299 + g * 587 + b * 114) // 1000
    return L.astype(np.float64)


def laplacian(gray: np.ndarray) -> np.ndarray:
    """3x3 Laplacian [[0,1,0],[1,-4,1],[0,1,0]] with edge-replicate padding."""
    h, w = gray.shape
    padded = np.pad(gray, 1, mode="edge")
    center = padded[1:h + 1, 1:w + 1]
    up = padded[0:h, 1:w + 1]
    down = padded[2:h + 2, 1:w + 1]
    left = padded[1:h + 1, 0:w]
    right = padded[1:h + 1, 2:w + 2]
    return up + down + left + right - 4 * center


def extract_features(img: Image.Image, file_size_bytes: int) -> dict:
    gray = to_grayscale_array(img)
    h, w = gray.shape
    lap = laplacian(gray)

    rgb = np.array(img.convert("RGB"), dtype=np.float64)
    color_std_mean = float(np.mean([rgb[..., c].std() for c in range(3)]))

    block_vars, block_edges = [], []
    for y in range(0, h - BLOCK + 1, BLOCK):
        for x in range(0, w - BLOCK + 1, BLOCK):
            patch = lap[y:y + BLOCK, x:x + BLOCK]
            block_vars.append(patch.var())
            block_edges.append(np.abs(patch).mean())

    block_vars = np.array(block_vars) if block_vars else np.array([0.0])
    block_edges = np.array(block_edges) if block_edges else np.array([0.0])

    # Blank margin/whitespace blocks have near-zero edge activity and are
    # extremely common on a text document (most of the page is white
    # space). Including them in the outlier statistics means "this block
    # has text on it" already looks like an outlier relative to "this
    # block is blank margin" — completely swamping any tamper-specific
    # signal. Restrict outlier detection to content-bearing blocks only
    # (some real edge activity present) so the comparison is "content
    # block vs other content blocks", where a genuinely spliced/blurred
    # region's noise/edge statistics should actually stand out.
    content_mask = block_edges > (block_edges.mean() * 0.15)
    content_vars = block_vars[content_mask] if content_mask.any() else block_vars
    content_edges = block_edges[content_mask] if content_mask.any() else block_edges

    median_var = float(np.median(content_vars))
    median_edge = float(np.median(content_edges))
    max_var_dev = float(np.max(np.abs(content_vars - median_var))) if len(content_vars) > 1 else 0.0
    max_edge_dev = float(np.max(np.abs(content_edges - median_edge))) if len(content_edges) > 1 else 0.0

    return {
        "fileSizeBytesPerPixel": file_size_bytes / (h * w),
        "globalEdgeVariance": float(lap.var()),
        "blockNoiseHeterogeneity": float(content_vars.std()),
        "meanBlockNoiseVariance": float(content_vars.mean()),
        "colorChannelStdMean": color_std_mean,
        "highFreqEnergyRatio": float(np.mean(np.abs(lap) > 10)),
        "maxBlockNoiseDeviation": max_var_dev,
        "maxBlockEdgeDeviation": max_edge_dev,
    }
