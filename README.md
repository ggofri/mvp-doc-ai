# Fuse - AI-Powered Document Extraction System

An intelligent document processing system with automated classification, data extraction, and continuous learning capabilities.

## Overview

This system processes uploaded documents (PDFs, images) to:
1. **Classify** documents into predefined types (Bank Statements, Government IDs, W-9s, Certificates of Insurance, etc.)
2. **Extract** structured data matching per-type JSON schemas
3. **Score confidence** for both classification and field-level extraction
4. **Route low-confidence items** to human review
5. **Learn from corrections** to improve future predictions
6. **Display live metrics** in a dashboard

## Quick Start

```bash
# Install dependencies
npm install

# Run tests and linting
npm test && npm run lint
```

## Project Structure

```
fuse/
├── backend/          # Backend services (Node.js 18+)
├── frontend/         # Frontend application
├── shared/           # Shared types and utilities
└── docs/            # Comprehensive documentation
```

## Documentation

### Architecture & Design
- **[Architecture Overview](docs/architecture/ARCHITECTURE.md)** - System architecture, design patterns, and scalability considerations
- **[Technology Decisions](docs/architecture/TECH_DECISIONS.md)** - Technology stack choices and trade-offs
- **[Architectural Decisions](docs/architecture/DECISIONS.md)** - Key design decisions with rationale

## Key Features

### Document Processing
- Multi-page PDF support with page navigation
- OCR integration for text extraction
- Bounding box detection for field highlighting
- Support for 5+ document types

### Machine Learning & AI
- LLM-powered classification and extraction
- Field-level confidence scoring
- Learning loop with few-shot retrieval
- Continuous improvement from human feedback

### Human-in-the-Loop
- Intuitive review interface
- Document type correction
- Field-level editing
- Immediate metric updates

### Metrics & Monitoring
- Real-time classification accuracy
- Field-level extraction quality (exact-match, token-F1)
- Latency and cost tracking (p50/p95)
- Confidence calibration histograms
- Learning impact visualization

## Technology Stack

- **Backend:** TypeScript 5.x on Node.js 18+
- **Frontend:** TypeScript 5.x (browser-targeted)
- **Data Format:** JSON (all structured data)

## Development

Run tests and linting:
```bash
npm test && npm run lint
```

## Security Notes

- All demo PDFs contain dummy data only
- Sensitive strings are masked in logs (e.g., `****1234`)
- Store API keys in `.env` (see `.env.example`)

## License

MIT License - See LICENSE file for details
