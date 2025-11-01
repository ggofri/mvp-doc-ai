-- Document Tagging & Extraction MVP Database Schema

-- Documents table: stores uploaded PDFs and processing results
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_size INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  ocr_json TEXT,
  type TEXT,
  confidence REAL,
  extraction JSON,
  corrected INTEGER DEFAULT 0,
  processing_status TEXT DEFAULT 'pending',
  ocr_latency_ms INTEGER,
  classification_latency_ms INTEGER,
  extraction_latency_ms INTEGER,
  total_latency_ms INTEGER
);

-- Indexes for docs table
CREATE INDEX IF NOT EXISTS idx_docs_status ON docs(processing_status);
CREATE INDEX IF NOT EXISTS idx_docs_type ON docs(type);
CREATE INDEX IF NOT EXISTS idx_docs_upload_timestamp ON docs(upload_timestamp DESC);

-- Corrections table: stores human corrections for learning loop
CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  correction_type TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT NOT NULL,
  field_name TEXT,
  corrector_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_gold INTEGER DEFAULT 1,
  FOREIGN KEY (doc_id) REFERENCES docs(id)
);

-- Indexes for corrections table
CREATE INDEX IF NOT EXISTS idx_corrections_type ON corrections(correction_type);
CREATE INDEX IF NOT EXISTS idx_corrections_doc_id ON corrections(doc_id);
CREATE INDEX IF NOT EXISTS idx_corrections_gold ON corrections(is_gold);

-- Settings table: stores configuration (thresholds, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Initialize default confidence thresholds
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('threshold_bank_statement', '0.7'),
  ('threshold_government_id', '0.7'),
  ('threshold_w9', '0.7'),
  ('threshold_coi', '0.7'),
  ('threshold_articles', '0.7');

-- Tool usage logs table: tracks LLM tool calls for metrics
CREATE TABLE IF NOT EXISTS tool_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  tool_args TEXT NOT NULL,
  tool_result TEXT NOT NULL,
  success INTEGER DEFAULT 1,
  duration INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES docs(id)
);

-- Indexes for tool_usage_logs table
CREATE INDEX IF NOT EXISTS idx_tool_usage_doc_id ON tool_usage_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_tool_name ON tool_usage_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_usage_timestamp ON tool_usage_logs(timestamp DESC);

-- Metrics history table: stores periodic metric snapshots for learning impact analysis
CREATE TABLE IF NOT EXISTS metrics_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  classification_accuracy REAL,
  total_documents INTEGER,
  total_corrections INTEGER,
  snapshot_json TEXT,
  snapshot_type TEXT DEFAULT 'periodic'
);

-- Indexes for metrics_history table
CREATE INDEX IF NOT EXISTS idx_metrics_history_timestamp ON metrics_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_history_type ON metrics_history(snapshot_type);
