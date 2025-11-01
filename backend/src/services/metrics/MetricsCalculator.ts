import { all, get } from '../../db/connection';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';

const ALL_DOCUMENT_TYPES: DocumentType[] = [
  'Bank Statement',
  'Government ID',
  'W-9',
  'Certificate of Insurance',
  'Articles of Incorporation',
];

const DEFAULT_EMPTY_VALUE = 0;
const PERCENTILE_50_MULTIPLIER = 0.5;
const PERCENTILE_95_MULTIPLIER = 0.95;
const CONFIDENCE_THRESHOLD_LOW = 0.7;
const CONFIDENCE_BINS_COUNT = 10;
const CONFIDENCE_BIN_MAX_INDEX = 9;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const TOKENS_PER_THOUSAND = 1000;
const COST_PER_THOUSAND_TOKENS = 0.01;
const CONFIDENCE_DISTRIBUTION_BINS = 10;

const CORRECTION_TYPE_CLASSIFICATION = 'classification';
const CORRECTION_TYPE_FIELD = 'field';
const PROCESSING_STATUS_COMPLETED = 'completed';
const PROCESSING_STATUS_NEEDS_REVIEW = 'needs_review';
const PROCESSING_STATUS_ERROR = 'error';
const IS_GOLD_FLAG = 1;
const NOT_CORRECTED_FLAG = 0;

interface ClassificationMetrics {
  accuracy: number;
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1Score: Record<string, number>;
  confusionMatrix: number[][];
}

interface ExtractionMetrics {
  exactMatchRate: Record<string, number>;
  tokenF1: Record<string, number>;
  averageConfidence: number;
  lowConfidenceFieldsRate: number;
}

interface OperationalMetrics {
  latencyP50: number | null;
  latencyP95: number | null;
  costPerDocument: number | null;
  autoApproveRate: number;
  reviewRate: number;
  errorRate: number;
  totalDocuments: number;
  processedDocuments: number;
}

interface LearningMetrics {
  totalCorrections: number;
  correctionsByType: Record<string, number>;
  goldExamplesCount: number;
  toolCallsCount: number;
  accuracyImprovement: number | null;
}

function initializeConfusionMatrix(documentTypes: DocumentType[]): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};
  documentTypes.forEach(type => {
    matrix[type] = {};
    documentTypes.forEach(predictedType => {
      matrix[type][predictedType] = DEFAULT_EMPTY_VALUE;
    });
  });
  return matrix;
}

function calculateF1Score(precision: number, recall: number): number {
  if (precision + recall === 0) {
    return DEFAULT_EMPTY_VALUE;
  }
  return (2 * precision * recall) / (precision + recall);
}

function calculatePercentileIndex(arrayLength: number, percentile: number): number {
  return Math.floor(arrayLength * percentile);
}

function estimateTokensFromChars(chars: number): number {
  return chars / CHARS_PER_TOKEN_ESTIMATE;
}

function estimateCostFromTokens(tokens: number): number {
  return (tokens / TOKENS_PER_THOUSAND) * COST_PER_THOUSAND_TOKENS;
}

function calculateConfidenceBinIndex(confidence: number): number {
  return Math.min(Math.floor(confidence * CONFIDENCE_BINS_COUNT), CONFIDENCE_BIN_MAX_INDEX);
}

export class MetricsCalculator {
  async calculateClassificationMetrics(): Promise<ClassificationMetrics> {
    const correctedDocs = await all<any>(
      `
      SELECT d.id, d.type as predicted, c.corrected_value as actual
      FROM docs d
      JOIN corrections c ON d.id = c.doc_id
      WHERE c.correction_type = ?
      AND d.type IS NOT NULL
    `,
      [CORRECTION_TYPE_CLASSIFICATION]
    );

    if (correctedDocs.length === 0) {
      return this.getEmptyClassificationMetrics();
    }

    const documentTypes = ALL_DOCUMENT_TYPES;

    const matrix = initializeConfusionMatrix(documentTypes);

    correctedDocs.forEach(doc => {
      if (matrix[doc.actual] && matrix[doc.actual][doc.predicted] !== undefined) {
        matrix[doc.actual][doc.predicted]++;
      }
    });

    const precision: Record<string, number> = {};
    const recall: Record<string, number> = {};
    const f1Score: Record<string, number> = {};
    let correctPredictions = 0;

    documentTypes.forEach(type => {
      const truePositives = matrix[type][type];
      let falsePositives = 0;
      let falseNegatives = 0;

      documentTypes.forEach(otherType => {
        if (otherType !== type) {
          falsePositives += matrix[otherType][type];
          falseNegatives += matrix[type][otherType];
        }
      });

      correctPredictions += truePositives;

      precision[type] = truePositives / (truePositives + falsePositives) || DEFAULT_EMPTY_VALUE;
      recall[type] = truePositives / (truePositives + falseNegatives) || DEFAULT_EMPTY_VALUE;
      f1Score[type] = calculateF1Score(precision[type], recall[type]);
    });

    const accuracy = correctPredictions / correctedDocs.length;

    const confusionMatrix: number[][] = documentTypes.map(actualType =>
      documentTypes.map(predictedType => matrix[actualType][predictedType])
    );

    return {
      accuracy,
      precision,
      recall,
      f1Score,
      confusionMatrix,
    };
  }

  async calculateExtractionMetrics(): Promise<ExtractionMetrics> {
    const fieldCorrections = await all<any>(
      `
      SELECT c.field_name, c.original_value, c.corrected_value
      FROM corrections c
      WHERE c.correction_type = ?
    `,
      [CORRECTION_TYPE_FIELD]
    );

    const exactMatchRate: Record<string, number> = {};
    const tokenF1: Record<string, number> = {};

    if (fieldCorrections.length === 0) {
      return {
        exactMatchRate: {},
        tokenF1: {},
        averageConfidence: DEFAULT_EMPTY_VALUE,
        lowConfidenceFieldsRate: DEFAULT_EMPTY_VALUE,
      };
    }

    const fieldGroups: Record<string, Array<{ original: string; corrected: string }>> = {};
    fieldCorrections.forEach(correction => {
      const fieldName = correction.field_name;
      if (!fieldGroups[fieldName]) {
        fieldGroups[fieldName] = [];
      }
      fieldGroups[fieldName].push({
        original: correction.original_value || '',
        corrected: correction.corrected_value || '',
      });
    });

    Object.keys(fieldGroups).forEach(fieldName => {
      const corrections = fieldGroups[fieldName];
      let exactMatches = 0;
      let totalTokenF1 = 0;

      corrections.forEach(({ original, corrected }) => {
        if (original === corrected) {
          exactMatches++;
        }

        const f1 = this.calculateTokenF1(original, corrected);
        totalTokenF1 += f1;
      });

      exactMatchRate[fieldName] = exactMatches / corrections.length;
      tokenF1[fieldName] = totalTokenF1 / corrections.length;
    });

    // Calculate average confidence for all fields
    const avgConfidenceResult = await get<{ avg: number }>(
      `
      SELECT AVG(json_extract(value, '$.final_confidence')) as avg
      FROM docs, json_each(docs.extraction, '$.fields')
      WHERE extraction IS NOT NULL
    `,
      []
    );

    const averageConfidence = avgConfidenceResult?.avg || DEFAULT_EMPTY_VALUE;

    const lowConfidenceResult = await get<{ low: number; total: number }>(
      `
      SELECT
        SUM(CASE WHEN json_extract(value, '$.final_confidence') < ? THEN 1 ELSE 0 END) as low,
        COUNT(*) as total
      FROM docs, json_each(docs.extraction, '$.fields')
      WHERE extraction IS NOT NULL
    `,
      [CONFIDENCE_THRESHOLD_LOW]
    );

    const lowConfidenceFieldsRate =
      lowConfidenceResult?.total ? lowConfidenceResult.low / lowConfidenceResult.total : DEFAULT_EMPTY_VALUE;

    return {
      exactMatchRate,
      tokenF1,
      averageConfidence,
      lowConfidenceFieldsRate,
    };
  }

  async calculateOperationalMetrics(): Promise<OperationalMetrics> {
    const totalDocsResult = await get<{ count: number }>('SELECT COUNT(*) as count FROM docs', []);
    const totalDocuments = totalDocsResult?.count || DEFAULT_EMPTY_VALUE;

    const processedResult = await get<{ count: number }>(
      `SELECT COUNT(*) as count FROM docs WHERE processing_status IN (?, ?)`,
      [PROCESSING_STATUS_COMPLETED, PROCESSING_STATUS_NEEDS_REVIEW]
    );
    const processedDocuments = processedResult?.count || DEFAULT_EMPTY_VALUE;

    const autoApprovedResult = await get<{ count: number }>(
      `SELECT COUNT(*) as count FROM docs WHERE processing_status = ? AND corrected = ?`,
      [PROCESSING_STATUS_COMPLETED, NOT_CORRECTED_FLAG]
    );
    const autoApproveRate = processedDocuments > 0 ? (autoApprovedResult?.count || DEFAULT_EMPTY_VALUE) / processedDocuments : DEFAULT_EMPTY_VALUE;

    const needsReviewResult = await get<{ count: number }>(
      `SELECT COUNT(*) as count FROM docs WHERE processing_status = ?`,
      [PROCESSING_STATUS_NEEDS_REVIEW]
    );
    const reviewRate = processedDocuments > 0 ? (needsReviewResult?.count || DEFAULT_EMPTY_VALUE) / processedDocuments : DEFAULT_EMPTY_VALUE;

    const errorResult = await get<{ count: number }>(
      `SELECT COUNT(*) as count FROM docs WHERE processing_status = ?`,
      [PROCESSING_STATUS_ERROR]
    );
    const errorRate = totalDocuments > 0 ? (errorResult?.count || DEFAULT_EMPTY_VALUE) / totalDocuments : DEFAULT_EMPTY_VALUE;

    const latencyData = await all<{ total_latency_ms: number | null }>(
      `SELECT total_latency_ms FROM docs WHERE total_latency_ms IS NOT NULL ORDER BY total_latency_ms ASC`,
      []
    );

    let latencyP50: number | null = null;
    let latencyP95: number | null = null;

    if (latencyData.length > 0) {
      const p50Index = calculatePercentileIndex(latencyData.length, PERCENTILE_50_MULTIPLIER);
      const p95Index = calculatePercentileIndex(latencyData.length, PERCENTILE_95_MULTIPLIER);

      latencyP50 = latencyData[p50Index]?.total_latency_ms || null;
      latencyP95 = latencyData[p95Index]?.total_latency_ms || null;
    }

    const costData = await all<{ ocr_json: string | null; extraction: string | null }>(
      `SELECT ocr_json, extraction FROM docs WHERE ocr_json IS NOT NULL`,
      []
    );

    let totalEstimatedCost = 0;
    costData.forEach((doc) => {
      const ocrChars = doc.ocr_json ? JSON.stringify(doc.ocr_json).length : 0;
      const extractionChars = doc.extraction ? JSON.stringify(doc.extraction).length : 0;
      const totalChars = ocrChars + extractionChars;

      const estimatedTokens = estimateTokensFromChars(totalChars);
      const estimatedCost = estimateCostFromTokens(estimatedTokens);
      totalEstimatedCost += estimatedCost;
    });

    const costPerDocument = processedDocuments > 0 ? totalEstimatedCost / processedDocuments : null;

    return {
      latencyP50,
      latencyP95,
      costPerDocument,
      autoApproveRate,
      reviewRate,
      errorRate,
      totalDocuments,
      processedDocuments,
    };
  }

  async calculateLearningMetrics(): Promise<LearningMetrics> {
    const totalCorrectionsResult = await get<{ count: number }>(
      'SELECT COUNT(*) as count FROM corrections',
      []
    );
    const totalCorrections = totalCorrectionsResult?.count || DEFAULT_EMPTY_VALUE;

    const correctionsByTypeRows = await all<{ type: string; count: number }>(
      `
      SELECT d.type, COUNT(*) as count
      FROM corrections c
      JOIN docs d ON c.doc_id = d.id
      WHERE d.type IS NOT NULL
      GROUP BY d.type
    `,
      []
    );

    const correctionsByType: Record<string, number> = {};
    correctionsByTypeRows.forEach(row => {
      correctionsByType[row.type] = row.count;
    });

    const goldExamplesResult = await get<{ count: number }>(
      'SELECT COUNT(*) as count FROM corrections WHERE is_gold = ?',
      [IS_GOLD_FLAG]
    );
    const goldExamplesCount = goldExamplesResult?.count || DEFAULT_EMPTY_VALUE;

    const toolCallsResult = await get<{ count: number }>(
      'SELECT COUNT(*) as count FROM tool_usage_logs',
      []
    );
    const toolCallsCount = toolCallsResult?.count || DEFAULT_EMPTY_VALUE;

    let accuracyImprovement: number | null = null;

    const classificationMetrics = await this.calculateClassificationMetrics();
    const currentAccuracy = classificationMetrics.accuracy;

    const baselineSnapshot = await get<{ classification_accuracy: number }>(
      `
      SELECT classification_accuracy
      FROM metrics_history
      WHERE classification_accuracy IS NOT NULL
        AND total_corrections > 0
      ORDER BY timestamp ASC
      LIMIT 1
    `,
      []
    );

    if (baselineSnapshot && baselineSnapshot.classification_accuracy !== null && currentAccuracy !== null) {
      accuracyImprovement = currentAccuracy - baselineSnapshot.classification_accuracy;
    }

    return {
      totalCorrections,
      correctionsByType,
      goldExamplesCount,
      toolCallsCount,
      accuracyImprovement,
    };
  }

  async calculateConfidenceDistribution(): Promise<Record<string, number[]>> {
    const docs = await all<{ type: string; confidence: number }>(
      `
      SELECT type, confidence
      FROM docs
      WHERE type IS NOT NULL AND confidence IS NOT NULL
    `,
      []
    );

    const distribution: Record<string, number[]> = {};

    docs.forEach(doc => {
      if (!distribution[doc.type]) {
        distribution[doc.type] = new Array(CONFIDENCE_DISTRIBUTION_BINS).fill(DEFAULT_EMPTY_VALUE);
      }

      const binIndex = calculateConfidenceBinIndex(doc.confidence);
      distribution[doc.type][binIndex]++;
    });

    return distribution;
  }

  private calculateTokenF1(predicted: string, actual: string): number {
    const predictedTokens = new Set(predicted.toLowerCase().split(/\s+/));
    const actualTokens = new Set(actual.toLowerCase().split(/\s+/));

    if (predictedTokens.size === 0 || actualTokens.size === 0) {
      return DEFAULT_EMPTY_VALUE;
    }

    const intersection = new Set([...predictedTokens].filter(token => actualTokens.has(token)));
    const truePositives = intersection.size;

    const precision = truePositives / predictedTokens.size;
    const recall = truePositives / actualTokens.size;

    return calculateF1Score(precision, recall);
  }

  private getEmptyClassificationMetrics(): ClassificationMetrics {
    const documentTypes = ALL_DOCUMENT_TYPES;

    const emptyMetrics: Record<string, number> = {};
    documentTypes.forEach(type => {
      emptyMetrics[type] = DEFAULT_EMPTY_VALUE;
    });

    return {
      accuracy: DEFAULT_EMPTY_VALUE,
      precision: emptyMetrics,
      recall: emptyMetrics,
      f1Score: emptyMetrics,
      confusionMatrix: documentTypes.map(() => new Array(documentTypes.length).fill(DEFAULT_EMPTY_VALUE)),
    };
  }
}

let metricsCalculator: MetricsCalculator | null = null;

export function getMetricsCalculator(): MetricsCalculator {
  if (!metricsCalculator) {
    metricsCalculator = new MetricsCalculator();
  }
  return metricsCalculator;
}
