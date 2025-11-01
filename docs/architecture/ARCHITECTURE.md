# Fuse Document Extraction - System Architecture

## Table of Contents
1. [Current MVP Architecture](#current-mvp-architecture)
2. [Phase 2: Scale-Up Plan](#phase-2-scale-up-plan)
3. [Reliability & Monitoring](#reliability--monitoring)
4. [Cost Optimization](#cost-optimization)
5. [Performance & Throughput](#performance--throughput)

---

## Current MVP Architecture

### System Overview

```
┌─────────────────┐
│   Frontend      │  React + TypeScript + Vite
│   (Browser)     │  - Upload UI
│                 │  - Document Viewer (PDF.js)
│                 │  - Corrections Interface
│                 │  - Metrics Dashboard
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────┐
│   Backend API   │  Express + Node.js + TypeScript
│   (Port 3000)   │  - /api/upload
│                 │  - /api/docs
│                 │  - /api/metrics
│                 │  - /api/corrections
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────────┐
│SQLite  │ │   Ollama     │
│Database│ │   (Local)    │
│        │ │   LLM Server │
└────────┘ └──────────────┘
```

### Component Architecture

#### 1. Data Layer
- **Database**: SQLite3 with foreign keys enabled
  - `docs`: Document metadata, OCR results, classification, extraction
  - `corrections`: Human corrections for learning loop
  - `settings`: Configurable thresholds per document type
  - `tool_usage_logs`: LLM tool call tracking
  - `metrics_history`: Periodic metric snapshots

#### 2. Service Layer (Modular Design)

**OCR Pipeline**:
- `PdfRenderer`: Converts PDF pages to images using pdf-lib + canvas
- `TesseractService`: OCR with Tesseract.js (supports up to 100 pages)

**Classification & Extraction**:
- `ClassificationService`: Document type prediction with confidence scoring
- `ExtractionService`: Field extraction with schema validation
- `ValidationService`: Zod-based schema validation
- `TypeCoercionService`: Type conversion with fuzzy matching
- `ConfidenceCalculator`: 3-factor confidence (LLM × validation × clarity)

**Learning Loop**:
- `LearningService`: Orchestrates feedback application
- `ExampleStore`: Retrieves gold examples from corrections
- `SchemaStore`: Centralized document schema registry

**Metrics & Storage**:
- `MetricsCalculator`: Real-time metrics with 10s cache
  - Classification metrics (accuracy, precision/recall, confusion matrix)
  - Extraction metrics (exact-match, token-F1)
  - Operational metrics (latency p50/p95, review rate, error rate)
  - Learning impact (accuracy improvement tracking)
- `MetricStore`: Snapshot persistence to `metrics_history` table

**Security & Utilities**:
- `PIIMasker`: Regex-based PII masking (SSN, EIN, account numbers, credit cards)
- `ToolRegistry`: LLM function calling support for gold example retrieval
- `ToolUsageLogger`: Logs all LLM tool invocations

#### 3. Processing Flow

```
Upload → OCR → Classification → Extraction → Human Review (if needed) → Learning Loop
  │       │         │               │                │                      │
  └───────┴─────────┴───────────────┴────────────────┴──────────────────────┘
                            All tracked in SQLite
```

**Current Processing**:
- **Synchronous OCR**: ~2-5s per page (single-threaded Tesseract)
- **LLM calls**: Sequential (classification, then extraction)
- **No retry logic**: One-shot processing
- **Single process**: No worker pool

### Current Limitations

1. **Throughput**: ~1-2 docs/minute (OCR bottleneck)
2. **Concurrency**: Single-process, no horizontal scaling
3. **Reliability**: No retries, circuit breakers, or dead-letter queues
4. **Storage**: Local filesystem + SQLite (no cloud backup)
5. **Monitoring**: Basic console logging, no structured telemetry
6. **Latency**: OCR dominates (~80% of total time)

---

## Phase 2: Scale-Up Plan

### 1. Async Job Queue Architecture

**Goal**: Decouple upload from processing, enable horizontal scaling

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend   │────▶│  API Server │────▶│  Redis Queue │
└──────────────┘     │  (Stateless)│     │   (Bull)     │
                     └─────────────┘     └──────┬───────┘
                                                 │
                     ┌───────────────────────────┴───────────────────┐
                     ▼                           ▼                   ▼
                ┌─────────┐               ┌─────────┐         ┌─────────┐
                │ Worker 1│               │ Worker 2│   ...   │ Worker N│
                │ (OCR)   │               │ (OCR)   │         │ (OCR)   │
                └─────────┘               └─────────┘         └─────────┘
                     │                           │                   │
                     └───────────────┬───────────┴───────────────────┘
                                     ▼
                              ┌──────────────┐
                              │  PostgreSQL  │
                              │  (Primary)   │
                              └──────────────┘
```

**Implementation**:
- **Job Queue**: Bull (Redis-backed) or BullMQ
  - `ocr-queue`: PDF → Images → OCR results
  - `classification-queue`: OCR text → Document type
  - `extraction-queue`: OCR text + type → Fields
- **Worker Pool**:
  - N OCR workers (CPU-bound, scale based on cores)
  - M LLM workers (I/O-bound, scale based on Ollama capacity)
- **API Changes**:
  - `POST /api/upload` → Returns job ID immediately (202 Accepted)
  - `GET /api/jobs/:id` → Poll for job status
  - WebSocket support for real-time updates

**Benefits**:
- 10-50x throughput improvement (parallel processing)
- Better resource utilization (separate OCR/LLM worker pools)
- Graceful degradation under load (queue backlog vs. timeouts)

### 2. Distributed Caching (Redis)

**Goal**: Reduce redundant computation, improve API latency

**Cache Layers**:
1. **Metrics Cache**:
   - Current: 10s in-memory cache (per-instance)
   - Phase 2: Redis cache shared across all API instances
   - TTL: 10s for metrics, 60s for aggregates

2. **OCR Result Cache**:
   - Key: SHA256(PDF content)
   - Value: OCR JSON (per-page)
   - TTL: 7 days
   - **Impact**: Avoid re-OCR for duplicate uploads (~30% of production traffic)

3. **Classification Cache**:
   - Key: `classify:${SHA256(first 1000 chars)}`
   - Value: Document type + confidence
   - TTL: 24 hours
   - **Impact**: Fast re-classification for similar documents

4. **Gold Example Cache**:
   - Key: `examples:${documentType}`
   - Value: Top 10 gold examples
   - TTL: 5 minutes (invalidate on new correction)
   - **Impact**: Reduce DB queries in LLM prompts

**Architecture**:
```
API → Redis (cache miss) → Database → Redis (cache set) → API
```

### 3. Database Migration (SQLite → PostgreSQL)

**Why PostgreSQL?**
- **Concurrent writes**: SQLite locks on write (blocks all workers)
- **Connection pooling**: pgBouncer for efficient connection reuse
- **Full-text search**: Built-in FTS for OCR text search
- **JSONB**: Native JSON indexing for extraction fields
- **Replication**: Read replicas for metrics dashboard queries

**Migration Plan**:
1. Add Prisma ORM for type-safe queries
2. Dual-write mode (SQLite + PostgreSQL) for 1 week
3. Validate data consistency
4. Switch reads to PostgreSQL
5. Deprecate SQLite

**Indexing Strategy**:
```sql
CREATE INDEX idx_docs_type_confidence ON docs(type, confidence);
CREATE INDEX idx_docs_processing_status ON docs(processing_status) WHERE processing_status IN ('needs_review', 'error');
CREATE INDEX idx_corrections_created_at ON corrections(created_at DESC);
CREATE INDEX idx_gin_ocr_text ON docs USING GIN (to_tsvector('english', ocr_text));
```

### 4. Horizontal Scaling Strategy

**Load Balancer (nginx)**:
```
                         ┌──────────┐
                         │  nginx   │
                         │ (SSL/LB) │
                         └─────┬────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
   ┌─────────┐           ┌─────────┐           ┌─────────┐
   │ API-1   │           │ API-2   │           │ API-N   │
   │ (Node)  │           │ (Node)  │           │ (Node)  │
   └─────────┘           └─────────┘           └─────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ▼
                        ┌──────────────┐
                        │  PostgreSQL  │
                        │  + Redis     │
                        └──────────────┘
```

**Autoscaling Rules** (Kubernetes HPA):
- **API servers**: Scale on CPU > 70% or queue depth > 100
- **OCR workers**: Scale on `ocr-queue` depth > 50 jobs
- **LLM workers**: Scale on `classification-queue` depth > 20 jobs

**Target Capacity**:
- MVP: 1-2 docs/minute (single process)
- Phase 2: 50-100 docs/minute (10 OCR workers + 5 LLM workers)

### 5. Cloud Storage for PDFs

**Problem**: Local filesystem doesn't work with multiple workers

**Solution**: S3-compatible object storage (AWS S3, MinIO, Cloudflare R2)

**Architecture**:
```
Upload → API → S3 → Job Queue → Worker (download from S3) → Process
```

**Benefits**:
- **Durability**: 99.999999999% (11 9's) with S3
- **Scalability**: No local disk limits
- **Cost**: ~$0.023/GB/month (S3 Standard)

**Optimization**:
- Presigned URLs for direct browser → S3 uploads (bypass API)
- Lifecycle policies: Move to Glacier after 90 days, delete after 1 year
- CloudFront CDN for PDF viewer (reduce S3 egress costs)

---

## Reliability & Monitoring

### 1. Retry Logic & Circuit Breakers

**Current**: No retries, one-shot processing

**Phase 2**:
- **Exponential backoff**: Retry OCR failures (Tesseract crashes) with delays: 1s, 2s, 4s, 8s
- **Circuit breaker** for Ollama:
  - Open circuit after 5 consecutive failures
  - Half-open after 30s (test with 1 request)
  - Close if successful
- **Dead-letter queue**: Failed jobs after 3 retries → Manual review queue

**Libraries**:
- `async-retry` for exponential backoff
- `opossum` for circuit breaker pattern

### 2. Structured Logging & Telemetry

**Current**: Console.log with basic PII masking

**Phase 2**:
- **Winston** for structured JSON logs
- **OpenTelemetry** for distributed tracing
  - Trace ID propagates through: API → Queue → Worker → LLM
  - Spans: `upload`, `ocr`, `classify`, `extract`
- **Prometheus** metrics:
  - `fuse_documents_processed_total` (counter by status)
  - `fuse_processing_duration_ms` (histogram by stage)
  - `fuse_llm_token_usage_total` (counter by model)
  - `fuse_queue_depth` (gauge by queue name)

**Alerting** (AlertManager):
- Error rate > 5% for 5 minutes
- Queue depth > 500 for 10 minutes
- p95 latency > 60s for 5 minutes
- Ollama unreachable for 2 minutes

### 3. Health Checks & Graceful Shutdown

**Health endpoints**:
- `/health` → HTTP 200 if process is alive
- `/health/ready` → HTTP 200 if DB, Redis, Ollama reachable
- `/health/live` → HTTP 200 if not shutting down

**Graceful shutdown**:
```typescript
process.on('SIGTERM', async () => {
  // 1. Stop accepting new requests (mark /health/ready as 503)
  // 2. Wait for in-flight requests to complete (30s timeout)
  // 3. Close DB connections, Redis clients
  // 4. Flush logs and metrics
  // 5. Exit process
});
```

### 4. Disaster Recovery

**Backup Strategy**:
- **Database**: Daily full backups to S3 (pg_dump)
- **PDFs**: Already in S3 (versioning enabled)
- **Restore time objective (RTO)**: < 1 hour
- **Recovery point objective (RPO)**: < 24 hours

**High Availability**:
- PostgreSQL primary + 2 replicas (streaming replication)
- Redis Sentinel for automatic failover
- Multi-AZ deployment (AWS Availability Zones)

---

## Cost Optimization

### 1. Batch Processing for LLM Calls

**Current**: Sequential LLM calls (one per document)

**Phase 2**: Batch inference
- Group 5-10 documents per LLM request (if Ollama supports batch)
- **Savings**: 30-50% reduction in LLM overhead (fewer model loads)

### 2. Model Caching & Quantization

**Ollama optimizations**:
- Keep model in GPU memory (VRAM) between requests
- Use quantized models (Q4_K_M) for 2-3x speedup with minimal quality loss
- **Target model**: `llama3.2:3b-instruct-q4_K_M` (~2GB VRAM, 50 tokens/s)

**Estimated costs** (if switching to hosted LLM):
- GPT-4o-mini: ~$0.15/document (1000 input tokens + 500 output tokens)
- Claude Haiku: ~$0.10/document
- **Local Ollama**: $0/document (but requires GPU server: ~$200/month for A10G)

### 3. OCR Optimization

**Current**: Tesseract.js (JavaScript, slow)

**Phase 2 options**:
1. **Tesseract Native** (C++ via `node-tesseract-ocr`): 5-10x faster
2. **Cloud OCR** (pay-per-use):
   - AWS Textract: $1.50/1000 pages
   - Google Document AI: $1.00/1000 pages
   - Azure Document Intelligence: $1.00/1000 pages
3. **Hybrid**: Local Tesseract for simple docs, Cloud OCR for low-quality scans

**ROI Analysis**:
```
Tesseract Native:
  - Speed: 5x faster → 5x more throughput
  - Cost: $0/page (free)
  - Setup: 2-3 days (Docker image with Tesseract)

Cloud OCR:
  - Speed: 10x faster (parallel processing)
  - Cost: $0.001/page = $1000/million pages
  - Setup: 1 day (API integration)
```

**Recommendation**: Start with Tesseract Native, switch to Cloud OCR if volume > 100K pages/month.

### 4. Compute Right-Sizing

**Current MVP** (single server):
- 4 vCPU, 16GB RAM, 50GB SSD
- Cost: ~$80/month (AWS t3.xlarge)

**Phase 2** (distributed):
| Component        | Instance Type | Count | Cost/Month |
|------------------|---------------|-------|------------|
| API Servers      | t3.medium     | 3     | $100       |
| OCR Workers      | c6i.2xlarge   | 5     | $500       |
| LLM Workers      | g5.xlarge     | 2     | $800       |
| PostgreSQL       | db.r6g.large  | 1     | $150       |
| Redis            | cache.t3.small| 1     | $20        |
| **Total**        |               |       | **$1,570** |

**Per-document cost at scale** (1M docs/month):
- Compute: $1,570 / 1,000,000 = **$0.0016/doc**
- Storage (S3): $0.023/GB = ~**$0.0005/doc** (assuming 20MB avg PDF)
- Cloud OCR (if used): **$0.001/page** × 3 pages avg = **$0.003/doc**
- **Total**: **~$0.005/doc** at scale

---

## Guardrails & Safety

### 1. Input Validation & Sanitization

**Document Upload Controls**:
- **File type whitelist**: Only PDF, PNG, JPG, TIFF allowed
- **Size limits**: Max 50MB per file (prevent DoS)
- **Page limits**: Max 100 pages per document (prevent resource exhaustion)
- **Virus scanning**: Integrate ClamAV or AWS GuardDuty for malware detection

**Rate Limiting** (using `express-rate-limit`):
```typescript
// Per-user limits
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 uploads per hour
  message: 'Too many uploads, please try again later',
});

// Per-IP limits (prevent abuse)
const ipLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 500, // 500 requests per hour per IP
});
```

**Content Validation**:
- Verify PDF structure (not corrupted)
- Reject password-protected PDFs
- Sanitize filenames (prevent path traversal: `../../../etc/passwd`)

### 2. PII Protection & Data Privacy

**Current**: PIIMasker for logs (SSN, EIN, account numbers, credit cards)

**Phase 2 Enhancements**:

**OCR Text Scrubbing** (before LLM processing):
```typescript
class PIIDetector {
  // Named Entity Recognition (NER) for names, addresses
  detectPII(text: string): Array<{ type: string; value: string; offset: number }> {
    // Use spaCy or Presidio for NER
    // Detect: PERSON, GPE (location), DATE_TIME, PHONE_NUMBER
  }

  // Anonymization modes
  anonymize(text: string, mode: 'mask' | 'hash' | 'remove'): string {
    // mask: "John Doe" → "J*** D**"
    // hash: "John Doe" → "HASH_a3f8e7"
    // remove: "John Doe" → "[REDACTED]"
  }
}
```

**Access Controls**:
- Document-level permissions (multi-tenancy)
- Role-Based Access Control (RBAC):
  - **Viewer**: Read documents, view metrics
  - **Operator**: Upload, correct, approve
  - **Admin**: Configure thresholds, delete data
- API authentication via JWT (1-hour expiry, refresh tokens)

**Audit Logging**:
- Log all document access: `{ userId, docId, action, timestamp }`
- Immutable audit trail (append-only S3 bucket)
- Retention: 7 years (compliance requirement)

**Compliance**:
- GDPR: Right to deletion (`DELETE /users/:id/data`)
- CCPA: Opt-out of data sale (N/A for this use case)
- SOC 2 Type II readiness (future certification)

### 3. LLM Safety & Validation

**Prompt Injection Prevention**:
- **Delimiter approach**: Prefix all OCR text with `<USER_INPUT>` tag
- **Sanitization**: Strip markdown code blocks (````), instructions like "Ignore previous"
- **Output validation**: Reject LLM responses containing meta-instructions

**Output Guardrails**:
```typescript
class ExtractionValidator {
  validateExtraction(fields: Field[]): ValidationResult {
    // 1. Completeness check
    if (fields.filter(f => f.value).length < fields.length * 0.5) {
      return { valid: false, reason: 'Too many empty fields' };
    }

    // 2. Anomaly detection
    for (const field of fields) {
      // SSN in account_number field
      if (field.name === 'account_number' && /\d{3}-\d{2}-\d{4}/.test(field.value)) {
        return { valid: false, reason: 'SSN in account field' };
      }
      // Future dates in historical fields
      if (field.name.includes('date') && new Date(field.value) > new Date()) {
        return { valid: false, reason: 'Future date in historical field' };
      }
    }

    // 3. Cross-field validation
    const startDate = fields.find(f => f.name === 'statement_start_date')?.value;
    const endDate = fields.find(f => f.name === 'statement_end_date')?.value;
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return { valid: false, reason: 'Start date after end date' };
    }

    return { valid: true };
  }
}
```

**Confidence Thresholds** (per document type):
- Bank Statement: 0.70 (higher complexity)
- Government ID: 0.80 (safety-critical)
- W-9: 0.75 (tax implications)
- Dynamically adjust based on historical accuracy

**HITL Triggers** (route to human review):
- Confidence < threshold
- Schema validation failure
- Anomaly detection flag
- Random sampling (5% of high-confidence docs for calibration)

### 4. Model Drift Detection

**Problem**: LLM performance degrades over time due to domain shift

**Solution**: Continuous monitoring + alerts

```typescript
class DriftDetector {
  async detectDrift(): Promise<DriftAlert | null> {
    // Compare last 7 days vs previous 30 days
    const recentAccuracy = await this.getAccuracy({ days: 7 });
    const baselineAccuracy = await this.getAccuracy({ days: 30, offset: 7 });

    const drop = baselineAccuracy - recentAccuracy;

    if (drop > 0.05) {
      return {
        severity: 'high',
        message: `Accuracy dropped ${(drop * 100).toFixed(1)}% in past week`,
        action: 'Review recent corrections, retrain model',
      };
    }

    return null;
  }
}
```

**Alerts**:
- Accuracy drop > 5% week-over-week → Email to ML team
- Extraction field errors spike > 20% → Slack alert
- Confidence distribution shift (more low-confidence) → Dashboard warning

**Mitigation**:
- A/B test new model versions against baseline
- Gradual rollout (10% → 50% → 100%)
- Automatic rollback if error rate > baseline + 10%

### 5. Cost Controls & Budget Limits

**Problem**: Runaway LLM costs from unexpected traffic or bugs

**Solution**: Multi-level cost controls

**Per-Customer Spending Limits**:
```typescript
class CostController {
  async checkBudget(customerId: string, estimatedCost: number): Promise<boolean> {
    const monthlySpend = await this.getMonthlySpend(customerId);
    const limit = await this.getCustomerLimit(customerId); // e.g., $500/month

    if (monthlySpend + estimatedCost > limit) {
      await this.sendAlert(customerId, 'Budget limit reached');
      return false; // Block processing
    }

    return true;
  }
}
```

**Circuit Breakers**:
- Daily spend > $1000 → Require manual approval
- Hourly LLM calls > 10,000 → Throttle to 1000/hour
- Single document cost > $1 → Flag for review

**Cost Monitoring**:
- Real-time dashboard: spend today, this week, this month
- Alerts: daily spend > baseline × 2
- Budget forecasting: "At current rate, will hit $5K limit in 12 days"

### 6. Operational Guardrails

**Queue Depth Limits**:
- Max queue size: 10,000 jobs
- If exceeded, return HTTP 503 (Service Unavailable)
- Auto-scale workers when queue > 500 (prevent backlog)

**Resource Limits** (per worker):
- Max memory: 2GB (kill worker if exceeded, restart)
- Max CPU: 90% for 5 minutes → throttle new jobs
- Max processing time: 60s per document → timeout + retry

**Error Rate Triggers**:
- Error rate > 10% for 5 minutes → Stop accepting new uploads
- Error rate > 25% → Automatic rollback to previous version
- Manual override available for incidents

**Graceful Degradation**:
- Ollama down → Queue jobs for retry (don't fail immediately)
- Database slow → Use cached metrics (stale data OK for dashboard)
- OCR timeout → Return partial results + manual review flag

---

## Performance & Throughput

### Bottleneck Analysis

**Current MVP bottlenecks** (ranked by impact):
1. **OCR** (80% of latency): Tesseract.js is JavaScript, single-threaded
2. **LLM inference** (15% of latency): Ollama running locally, no GPU
3. **Database writes** (3% of latency): SQLite locks on write
4. **API overhead** (2% of latency): Express middleware, JSON parsing

**Phase 2 improvements**:
| Bottleneck        | MVP Latency | Phase 2 Latency | Improvement |
|-------------------|-------------|-----------------|-------------|
| OCR (per page)    | 3000ms      | 600ms           | 5x faster   |
| Classification    | 2000ms      | 500ms           | 4x faster   |
| Extraction        | 3000ms      | 800ms           | 3.75x faster|
| **Total (3-page)**| **15s**     | **3s**          | **5x faster** |

### Throughput Targets

**Phase 2 goals**:
- **Sustained throughput**: 50 documents/minute (3,000/hour, 72,000/day)
- **Peak throughput**: 100 documents/minute (with autoscaling)
- **p50 latency**: 3s (total processing time)
- **p95 latency**: 8s (includes queueing delay)
- **p99 latency**: 15s (rare cases with 10+ pages)

**Scaling math** (with 10 OCR workers):
- Each worker: 600ms/page = 100 pages/minute = 33 docs/minute (avg 3 pages)
- 10 workers: 330 docs/minute theoretical max
- With 70% utilization: 230 docs/minute sustained
- **Target**: 50 docs/minute is well within capacity

### Load Testing Plan

**Tools**: k6 or Locust

**Scenarios**:
1. **Baseline**: 10 docs/minute, 1 hour (600 documents)
2. **Ramp-up**: 0 → 50 docs/minute over 10 minutes
3. **Sustained**: 50 docs/minute for 1 hour (3000 documents)
4. **Spike**: 100 docs/minute for 5 minutes
5. **Soak test**: 25 docs/minute for 8 hours (12,000 documents)

**Success criteria**:
- ✅ p95 latency < 10s under sustained load
- ✅ Error rate < 1%
- ✅ Queue never exceeds 500 jobs
- ✅ No memory leaks (RSS stable over soak test)

---

## Summary: MVP → Phase 2 Comparison

| Metric                    | MVP (Current)        | Phase 2 (Target)     | Improvement |
|---------------------------|----------------------|----------------------|-------------|
| **Throughput**            | 2 docs/min           | 50 docs/min          | 25x         |
| **Latency (p95)**         | 20s                  | 8s                   | 2.5x faster |
| **Concurrency**           | 1 process            | 20+ workers          | 20x         |
| **Reliability**           | No retries           | 3 retries + DLQ      | Robust      |
| **Monitoring**            | Console logs         | OpenTelemetry + Prometheus | Production-ready |
| **Database**              | SQLite (local)       | PostgreSQL (HA)      | Scalable    |
| **Storage**               | Local filesystem     | S3 (11 9's durability)| Durable     |
| **Cost/doc** (at scale)   | N/A (local dev)      | $0.005/doc           | Affordable  |
| **Deployment**            | Single server        | Kubernetes (multi-AZ)| HA          |

---

## Phase 2 Implementation Roadmap

### Milestone 1: Queue + Workers (Week 1-2)
- [ ] Set up Redis + Bull queue
- [ ] Refactor API to async job submission
- [ ] Implement OCR worker pool
- [ ] Add job status polling endpoint

### Milestone 2: Database Migration (Week 3)
- [ ] Add Prisma ORM
- [ ] Set up PostgreSQL instance
- [ ] Dual-write mode + data validation
- [ ] Cut over to PostgreSQL

### Milestone 3: Caching + Monitoring (Week 4)
- [ ] Implement Redis caching layers
- [ ] Add OpenTelemetry tracing
- [ ] Set up Prometheus + Grafana dashboards
- [ ] Configure alerts

### Milestone 4: Reliability + Scale (Week 5-6)
- [ ] Add retry logic + circuit breakers
- [ ] Implement graceful shutdown
- [ ] Set up load balancer (nginx)
- [ ] Deploy to Kubernetes
- [ ] Run load tests

### Milestone 5: Optimization (Week 7-8)
- [ ] Switch to Tesseract Native
- [ ] Optimize LLM prompts (reduce token usage)
- [ ] Add batch processing for LLMs
- [ ] Tune PostgreSQL indexes + query performance

**Total timeline**: 8 weeks (2 months) to production-ready Phase 2
