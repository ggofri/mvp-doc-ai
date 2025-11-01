# speckit.specify

EPIC: Local AI Document Tagging & Extraction MVP with HITL + Learning Loop

Goal: Build a fully local, TypeScript-only, Ollama-powered MVP that tags, extracts, and learns from human corrections without long prompts or fine-tuning.

Why: No cloud costs, no PII leakage, demonstrates agentic AI (tool use), beats "lost in the middle" with SQL-backed retrieval, proves measurable improvement from feedback.

---

# USER STORIES & TECHNICAL SPECIFICATION

## Story 1: Upload PDF & Trigger Processing

As a loan officer, I want to upload a PDF so that the system auto-tags and extracts data.

Technical Details:

- Frontend: React + Vite + TypeScript + Tailwind
- File → FileReader → base64
- POST /api/upload with { filename, data: base64 }
- Backend saves to uploads/

Acceptance Criteria:

- [ ] Accepts .pdf (multi-page)
- [ ] Shows upload progress
- [ ] Returns docId and initial result
- [ ] Works offline after first load

Test Cases:
test("uploads multi-page PDF", async () => {
const file = new File([mockPdf], "bank.pdf", { type: "application/pdf" });
const res = await upload(file);
expect(res.docId).toBeDefined();
expect(res.type).toBe("Bank Statement");
});

---

## Story 2: OCR with Tesseract.js (Local)

As the system, I want to extract text + page + bounding boxes from PDFs so that the LLM can reason over real content.

Technical Details:

- Use tesseract.js (Web Worker)
- Fallback: pdfjs-dist → render page → OCR canvas
- Output per page: { page: 1, text: string, words: [{ text, bbox: [x,y,w,h] }] }

Acceptance Criteria:

- [ ] Handles scanned + digital PDFs
- [ ] Returns page number for every field
- [ ] Bounding boxes accurate to ±10px
- [ ] Caches OCR JSON per file

Test Cases:
test("extracts text from scanned page", async () => {
const pages = await ocr("scanned-id.pdf");
expect(pages[0].text).toContain("DRIVER LICENSE");
expect(pages[0].words[0].bbox).toHaveLength(4);
});

---

## Story 3: Classify Document Type via Ollama + Tool Use

As the AI, I want to classify the document using tool calling to fetch 1 gold example from SQL.

Technical Details:

- Model: llama3.2:3b or gemma2:2b (with format: json)
- Tool: { name: "get_gold_example", parameters: { type: "string", keywords: "array" } }
- Prompt: "Classify this document. If unsure, call get_gold_example(type)."

Acceptance Criteria:

- [ ] Never stuffs >1 example in prompt
- [ ] Uses tool when confidence < 0.7
- [ ] Returns { type, confidence, evidence: string[] }

Test Cases:
test("calls tool when unsure", async () => {
const res = await classify(mockOcr);
expect(res.tool_calls).toContainEqual({ name: "get_gold_example" });
});

---

## Story 4: Extract Fields with Schema + Confidence

As the AI, I want to extract JSON matching per-type schema with confidence per field.

Technical Details:

- Zod schemas in schema/types.zod.ts
- 3-layer confidence: final = llm × validation × clarity
- Validation: regex + date parsing
- Clarity: keyword presence

Acceptance Criteria:

- [ ] Output exactly matches Zod schema
- [ ] Confidence breakdown logged
- [ ] Includes page and bbox if available

Test Cases:
test("extracts W-9 with high confidence", () => {
const result = extract("W-9", ocrText);
expect(result.legal_name.confidence).toBeGreaterThan(0.9);
expect(result.ein_or_ssn.value).toMatch(/^\d{2}-\d{7}$/);
});

---

## Story 5: Human-in-the-Loop (HITL) Correction

As a loan officer, I want to correct type or fields so that the system learns.

Technical Details:

- UI: Editable table + dropdown
- POST /api/docs/:id/correct
- Saves to corrections table with is_gold = 1

Acceptance Criteria:

- [ ] Edit type → dropdown
- [ ] Edit field → inline input
- [ ] “Save” → instant feedback
- [ ] Persists after refresh

Test Cases:
test("saves correction and marks gold", async () => {
await correct(docId, { type: "W-9" });
const corr = db.get("SELECT \* FROM corrections WHERE doc_id = ?", docId);
expect(corr.is_gold).toBe(1);
});

---

## Story 6: Learning Loop via Tool-Backed Retrieval

As the system, I want to improve from corrections by letting the LLM query SQL for the best example.

Technical Details:

- On correction → save full OCR + extraction
- Tool get_gold_example runs: SELECT \* FROM corrections WHERE type = ? AND is_gold = 1 ORDER BY RANDOM() LIMIT 1
- LLM uses result → outputs correct JSON

Acceptance Criteria:

- [ ] No prompt > 2k tokens
- [ ] After 1 correction → next same-type doc = 100% accuracy
- [ ] No “lost in the middle”

Test Cases:
test("improves after one correction", async () => {
await correct(doc1, { type: "W-9" });
const res = await process(doc2); // same type
expect(res.type).toBe("W-9");
expect(res.confidence).toBeGreaterThan(0.95);
});

---

## Story 7: Live Metrics Dashboard

As a manager, I want to see accuracy, review rate, learning impact so I know the system is improving.

Technical Details:

- Polls /api/metrics every 10s
- Charts: Accuracy over time, Review rate, Confidence histogram, Tool usage %
- Metrics recalculated on every correction

Acceptance Criteria:

- [ ] Shows before/after accuracy
- [ ] Highlights tool usage = learning
- [ ] Live update on correction

Test Cases:
test("metrics update after correction", async () => {
const before = await getMetrics();
await correct(docId, { type: "W-9" });
const after = await getMetrics();
expect(after.accuracy).toBeGreaterThan(before.accuracy);
});

---

## Story 8: Confidence System (No Hand-Wavy Scores)

As an evaluator, I want explainable confidence so I trust the system.

Technical Details:

- Formula: final = llm × validation × clarity
- Logged per field
- UI tooltip shows breakdown

Acceptance Criteria:

- [ ] No magic numbers
- [ ] Confidence < 0.7 → auto-routes to HITL
- [ ] Hover → shows formula

Test Cases:
test("confidence drops on invalid date", () => {
const c = computeConfidence(0.9, "2025-13-01", "date");
expect(c.final).toBeLessThan(0.5);
});

---

## Story 9: No Hard-Coded Layouts

As a robustness tester, I want extraction to work even if layout changes.

Technical Details:

- No string search like "Starting Balance:"
- Use regex patterns per field
- Fallback to LLM only if regex fails

Acceptance Criteria:

- [ ] Works if field moves from page 1 → page 3
- [ ] Works if label changes: “Balance” → “Final Balance”

Test Cases:
test("extracts balance with different label", () => {
const text = "Final Balance: $1,234.56";
const value = extractField(text, "ending_balance");
expect(value).toBe("1234.56");
});

---

# TECHNICAL ARCHITECTURE

graph TD
A[Frontend] --> B[Backend API]
B --> C[Tesseract.js OCR]
B --> D[Ollama + Tool Use]
D --> E[SQL: get_gold_example]
E --> F[SQLite DB]
B --> F
B --> G[Metrics Engine]
A --> H[Dashboard]
G --> H

---

# DATABASE SCHEMA

CREATE TABLE docs (
id INTEGER PRIMARY KEY,
filename TEXT,
ocr_json TEXT,
type TEXT,
confidence REAL,
extraction JSON,
corrected INTEGER DEFAULT 0
);

CREATE TABLE corrections (
id INTEGER PRIMARY KEY,
doc_id INTEGER,
type TEXT,
extraction JSON,
ocr_text TEXT,
is_gold INTEGER DEFAULT 1,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

---

# DELIVERABLES

- frontend/: React + Vite + TS
- backend/: Express + TS
- ollama/: Modelfile with tool support
- data/db.sqlite: Pre-populated with 5 dummy docs
- README.md: Setup, run, demo script
- LOOM #1: Product demo
- LOOM #2: Tech deep dive

---

# FINAL ACCEPTANCE CHECKLIST

- [ ] 100% local (Ollama + Tesseract)
- [ ] Tool use for learning
- [ ] Confidence = LLM × Val × Clarity
- [ ] No hard-coded strings
- [ ] Before/after metrics
- [ ] HITL → instant learning
- [ ] All JSON, no YAML

# speckit.plan
