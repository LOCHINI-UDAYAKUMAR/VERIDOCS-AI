"""
Trains a real TF-IDF + Logistic Regression text classifier for document
type classification, replacing the keyword-scoring heuristic in
lib/classify.js.

There's no real corpus of labeled certificates/resumes/contracts/etc
available in this environment. The document *content* is still synthetic
(templated text with randomized names/dates/phrasing), but the *noise* is
now real: each document is rendered to an actual image (varied fonts,
sizes, rotation, blur, and JPEG compression to mimic scan quality) and run
through the real Tesseract binary — the same OCR engine the production
pipeline uses — so the model trains on genuine OCR error patterns instead
of a hand-coded character-substitution approximation. This is disclosed
here and in the README: content is synthetic, OCR noise is real.

Output: models/classifier.json — the TF-IDF vocabulary/IDF weights and
logistic regression coefficients, exported as plain JSON so inference can
run in pure JavaScript with zero Python/native dependencies at request time.
"""
import json
import random
import subprocess
import tempfile
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

random.seed(42)
np.random.seed(42)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
FONT_FILES = ["DejaVuSans.ttf", "DejaVuSerif.ttf", "DejaVuSansCondensed.ttf", "DejaVuSans-Bold.ttf"]

def render_and_ocr(text, quality_level=None):
    """Renders `text` to a document-like image with randomized visual noise
    (font, size, slight rotation, blur, JPEG compression) and runs it
    through the real Tesseract binary, returning what OCR actually produced
    — including its real mistakes — instead of synthetic character swaps."""
    quality_level = quality_level if quality_level is not None else random.random()
    font_path = os.path.join(FONT_DIR, random.choice(FONT_FILES))
    font_size = random.randint(16, 22)
    font = ImageFont.truetype(font_path, font_size)

    lines = text.split("\n")
    line_h = font_size + 10
    img_w, img_h = 900, max(200, line_h * len(lines) + 80)
    img = Image.new("L", (img_w, img_h), color=255)
    d = ImageDraw.Draw(img)
    y = 40
    for line in lines:
        d.text((50, y), line, fill=0, font=font)
        y += line_h

    # Degrade quality proportionally so the corpus spans clean-scan to
    # poor-scan conditions, giving the classifier realistic OCR-confidence
    # variety to learn from (mirrors real-world document quality spread).
    if quality_level > 0.5:
        img = img.rotate(random.uniform(-1.5, 1.5), fillcolor=255, expand=False)
    if quality_level > 0.7:
        img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.4, 1.0)))

    with tempfile.TemporaryDirectory() as tmp:
        img_path = os.path.join(tmp, "doc.jpg")
        jpeg_quality = 90 if quality_level < 0.7 else random.randint(35, 60)
        img.save(img_path, quality=jpeg_quality)
        out_base = os.path.join(tmp, "out")
        result = subprocess.run(
            ["tesseract", img_path, out_base, "--psm", "6"],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode != 0:
            return text  # fall back to clean text if OCR fails on this render
        with open(out_base + ".txt", "r", encoding="utf-8", errors="ignore") as f:
            return f.read()

FIRST_NAMES = ["John", "Maria", "Wei", "Fatima", "Carlos", "Aisha", "David", "Priya", "James", "Elena",
               "Mohammed", "Sarah", "Chen", "Olga", "Kwame", "Yuki", "Diego", "Anna", "Raj", "Emma"]
LAST_NAMES = ["Smith", "Garcia", "Chen", "Khan", "Rossi", "Kim", "Johnson", "Patel", "Müller", "Silva",
              "Nguyen", "Brown", "Kowalski", "Tanaka", "Osei", "Andersson", "Lopez", "Dubois", "Singh", "Novak"]
INSTITUTIONS = ["Acme University", "Northbridge Institute of Technology", "Sunrise College", "Global Business School",
                "Meridian State University", "Lakeside Technical Institute", "Horizon College of Engineering"]
COMPANIES = ["Initech Solutions", "Globex Corporation", "Nexus Dynamics", "Vertex Industries", "Quantum Retail Group",
             "Summit Logistics", "BrightPath Consulting", "Cascade Manufacturing"]
COURSES = ["Data Science", "Mechanical Engineering", "Business Administration", "Computer Science",
           "Digital Marketing", "Civil Engineering", "Graphic Design", "Public Health"]
JOB_TITLES = ["Software Engineer", "Marketing Manager", "Data Analyst", "Operations Lead", "Sales Executive",
              "Project Coordinator", "UX Designer", "Financial Analyst"]

def rand_date():
    return f"{random.randint(1,28):02d}/{random.randint(1,12):02d}/{random.randint(2018,2026)}"

def rand_id(prefix, digits=8):
    return f"{prefix}-{random.randint(10**(digits-1), 10**digits - 1)}"

def person():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

def certificate_doc():
    name, inst, course = person(), random.choice(INSTITUTIONS), random.choice(COURSES)
    templates = [
        f"CERTIFICATE OF COMPLETION\nThis is to certify that {name} has successfully completed the program in {course}.\nCertificate Number: {rand_id('CERT')}\nInstitution: {inst}\nIssue Date: {rand_date()}\nAuthorized Signature: ____________\nOfficial Seal affixed below.",
        f"{inst}\nCERTIFICATE OF ACHIEVEMENT\nAwarded to {name}\nfor outstanding performance in {course}\nDate of Issue: {rand_date()}  Certificate No: {rand_id('CT')}\nSigned and sealed by the Registrar.",
        f"This certifies that {name}, having completed all requirements of the {course} program at {inst}, is hereby awarded this certificate.\nCert ID: {rand_id('CID')}\n{rand_date()}\nSignature of Dean\nSeal of the Institution",
    ]
    return random.choice(templates)

def resume_doc():
    name, title = person(), random.choice(JOB_TITLES)
    templates = [
        f"{name}\nCurriculum Vitae\nObjective: Seeking a role as {title}.\nWork Experience:\n{random.choice(COMPANIES)} — {title}, {random.randint(2019,2025)}-Present\nSkills: communication, teamwork, problem solving, {random.choice(['Python','Excel','SQL','Photoshop'])}\nEducation: {random.choice(COURSES)}, {random.choice(INSTITUTIONS)}",
        f"RESUME\n{name}\nCareer Summary: Experienced {title} with a background in {random.choice(COURSES)}.\nWork Experience: {random.choice(COMPANIES)}\nSkills: leadership, {random.choice(['data analysis','negotiation','project management'])}\nContact: {name.lower().replace(' ','.')}@email.com",
        f"{name} — Curriculum Vitae\nObjective: {title} position at a growth-focused company.\nRelevant Skills: {random.choice(['communication','strategy','coding'])}, {random.choice(['leadership','analytics'])}\nWork Experience: {random.randint(2,10)} years at {random.choice(COMPANIES)}",
    ]
    return random.choice(templates)

def contract_doc():
    a, b = random.choice(COMPANIES), random.choice(COMPANIES)
    templates = [
        f"AGREEMENT\nThis agreement is made between {a} (party of the first part) and {b} (party of the second part).\nTerms and Conditions apply as outlined in Schedule A.\nBoth parties hereby agree to the terms herein.\nSigned by both parties on {rand_date()}.",
        f"SERVICE CONTRACT\nParty of the first part: {a}\nParty of the second part: {b}\nThe parties hereby agree to the terms and conditions set forth below.\nEffective Date: {rand_date()}\nSigned by both parties.",
        f"This contract, entered into by {a} and {b}, sets forth the terms and conditions governing their business relationship.\nBoth parties agree to be bound by this agreement as of {rand_date()}.",
    ]
    return random.choice(templates)

def id_card_doc():
    name = person()
    templates = [
        f"IDENTITY CARD\nName: {name}\nID No: {rand_id('ID', 9)}\nDate of Birth: {rand_date()}\nBlood Group: {random.choice(['A+','B+','O+','AB+','O-'])}\nEmployee ID: {rand_id('EMP',6)}",
        f"EMPLOYEE IDENTITY CARD\n{name}\nEmployee ID: {rand_id('EMP',6)}\nDate of Birth: {rand_date()}\nDepartment: {random.choice(['Engineering','Sales','HR','Finance'])}",
    ]
    return random.choice(templates)

def passport_doc():
    name = person()
    templates = [
        f"PASSPORT\nName: {name}\nNationality: {random.choice(['American','British','Indian','Brazilian','German','Japanese'])}\nPassport No: {rand_id('P',8)}\nPlace of Birth: {random.choice(['New York','London','Mumbai','Sao Paulo','Berlin','Tokyo'])}\nDate of Issue: {rand_date()}\nDate of Expiry: {rand_date()}",
    ]
    return random.choice(templates)

def driving_license_doc():
    name = person()
    templates = [
        f"DRIVING LICENCE\nName: {name}\nDL No: {rand_id('DL',9)}\nVehicle Class: {random.choice(['A','B','C','LMV','MC'])}\nIssued by: {random.choice(['State Transport Authority','Regional Transport Office'])}\nDate of Issue: {rand_date()}",
    ]
    return random.choice(templates)

def offer_letter_doc():
    name, company, title = person(), random.choice(COMPANIES), random.choice(JOB_TITLES)
    templates = [
        f"OFFER LETTER\nDear {name},\nWe are pleased to offer you the position of {title} at {company}.\nCompensation: ${random.randint(50,150)}0,00 per year (CTC)\nJoining Date: {rand_date()}\nWe look forward to welcoming you to the team.",
        f"{company}\nDear {name}, we are pleased to offer you employment as {title}.\nCTC: ${random.randint(50,150)}0,00\nJoining Date: {rand_date()}\nPlease sign and return this offer letter to confirm acceptance.",
    ]
    return random.choice(templates)

def experience_letter_doc():
    name, company, title = person(), random.choice(COMPANIES), random.choice(JOB_TITLES)
    templates = [
        f"EXPERIENCE LETTER\nTo Whomsoever It May Concern,\nThis is to certify that {name} worked with us as {title} from {rand_date()} to {rand_date()}.\nLast Working Day: {rand_date()}\nWe wish them success in future endeavors.\n{company}",
        f"{company}\nExperience Certificate\n{name} was employed as {title} and is being relieved from duty effective {rand_date()}.\nRelieving Letter — Last Working Day: {rand_date()}",
    ]
    return random.choice(templates)

GENERATORS = {
    "Certificate": certificate_doc,
    "Resume": resume_doc,
    "Contract": contract_doc,
    "ID Card": id_card_doc,
    "Passport": passport_doc,
    "Driving License": driving_license_doc,
    "Offer Letter": offer_letter_doc,
    "Experience Letter": experience_letter_doc,
}

PER_CLASS = 90  # real OCR rendering is slow (~0.2-0.4s/doc); kept modest for a reasonable training run
texts, labels = [], []
print("Rendering documents and running real Tesseract OCR (this takes a few minutes)...")
for label, gen in GENERATORS.items():
    for i in range(PER_CLASS):
        texts.append(render_and_ocr(gen()))
        labels.append(label)
    print(f"  {label}: {PER_CLASS} documents rendered + OCR'd")

# A slice of ambiguous/unclassifiable noise text so the model also learns
# to route genuinely unrecognizable input to "Unclassified" at low confidence
# rather than being forced into one of the 8 known categories.
UNCLASSIFIED_SAMPLES = [
    "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod",
    "Random scanned page with no discernible structure or fields present here",
    "asdkjaslkdj laksjd laksjdlkasjd blank page scan artifact noise text only",
    "Handwritten note: remember to buy milk and call the plumber tomorrow morning",
    "Meeting notes: discussed budget quarterly review timeline pending approval",
]
for _ in range(60):
    texts.append(render_and_ocr(random.choice(UNCLASSIFIED_SAMPLES) + " " + str(random.randint(1000, 9999))))
    labels.append("Unclassified")
print("Done rendering/OCR. Training classifier...")

X_train_text, X_test_text, y_train, y_test = train_test_split(
    texts, labels, test_size=0.15, random_state=42, stratify=labels
)

vectorizer = TfidfVectorizer(lowercase=True, ngram_range=(1, 2), max_features=2000, min_df=2)
X_train = vectorizer.fit_transform(X_train_text)
X_test = vectorizer.transform(X_test_text)

clf = LogisticRegression(max_iter=2000, C=2.0)
clf.fit(X_train, y_train)

pred = clf.predict(X_test)
acc = accuracy_score(y_test, pred)
print(f"Classifier accuracy: {acc:.4f}")
print(classification_report(y_test, pred))

vocab = {k: int(v) for k, v in vectorizer.vocabulary_.items()}
idf = vectorizer.idf_.tolist()
ngram_range = vectorizer.ngram_range

export = {
    "classes": clf.classes_.tolist(),
    "vocabulary": vocab,          # token -> feature index
    "idf": idf,                   # feature index -> idf weight
    "ngram_range": list(ngram_range),
    "coef": clf.coef_.tolist(),   # (n_classes, n_features)
    "intercept": clf.intercept_.tolist(),
    "metrics": {"accuracy": acc, "n_train": len(X_train_text), "n_test": len(X_test_text)},
}

with open("models/classifier.json", "w") as f:
    json.dump(export, f)

print(f"\nExported classifier ({len(vocab)} vocab terms, {len(clf.classes_)} classes) to models/classifier.json")

# Export a small validation set (text + sklearn's own prediction) so the
# pure-JS inference port can be cross-checked against the real model.
val_sample = list(zip(X_test_text[:40], pred[:40].tolist()))
with open("training/validation_set.json", "w") as f:
    json.dump(val_sample, f, indent=2)
print(f"Exported {len(val_sample)} validation examples to training/validation_set.json")
