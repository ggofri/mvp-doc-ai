const CONFIDENCE_MIN = 0;
const CONFIDENCE_MAX = 1;
const DEFAULT_LLM_CONFIDENCE = 0.8;
const VALIDATION_CONFIDENCE_PASS = 1.0;
const VALIDATION_CONFIDENCE_FAIL = 0.3;
const CLARITY_CONFIDENCE_NO_TEXT = 0.4;
const CLARITY_CONFIDENCE_NO_KEYWORDS = 1.0;
const CLARITY_CONFIDENCE_ALL_KEYWORDS = 1.0;
const CLARITY_CONFIDENCE_MOST_KEYWORDS = 0.7;
const CLARITY_CONFIDENCE_FEW_KEYWORDS = 0.4;
const KEYWORD_MATCH_RATIO_FULL = 1.0;
const KEYWORD_MATCH_RATIO_PARTIAL = 0.5;
const LLM_CONFIDENCE_LOW_THRESHOLD = 0.7;
const CLARITY_CONFIDENCE_LOW_THRESHOLD = 0.7;
const VALIDATION_CONFIDENCE_CRITICAL_THRESHOLD = 0.3;
const CLARITY_CONFIDENCE_POOR_THRESHOLD = 0.4;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const FIELD_CLARITY_CONFIDENCE = 0.8;
const CLASSIFICATION_VALIDATION_CONFIDENCE = 1.0;

const EXPECTED_KEYWORDS_MAP: Record<string, string[]> = {
  'Bank Statement': ['account', 'balance', 'statement', 'bank', 'transaction'],
  'Government ID': ['license', 'identification', 'id', 'expires', 'date of birth', 'dob'],
  'W-9': ['w-9', 'tax', 'ein', 'ssn', 'irs', 'taxpayer'],
  'Certificate of Insurance': [
    'insurance',
    'policy',
    'certificate',
    'coverage',
    'insured',
  ],
  'Articles of Incorporation': [
    'articles',
    'incorporation',
    'state',
    'corporation',
    'entity',
    'filed',
  ],
};

export interface ConfidenceBreakdown {
  llm_confidence: number;
  validation_confidence: number;
  clarity_confidence: number;
  final_confidence: number;
  reasons?: string[];
}

function clampConfidence(value: number): number {
  return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, value));
}

function calculateMatchRatio(foundKeywords: number, totalKeywords: number): number {
  return foundKeywords / totalKeywords;
}

function mapMatchRatioToClarityConfidence(matchRatio: number): number {
  if (matchRatio >= KEYWORD_MATCH_RATIO_FULL) {
    return CLARITY_CONFIDENCE_ALL_KEYWORDS;
  } else if (matchRatio >= KEYWORD_MATCH_RATIO_PARTIAL) {
    return CLARITY_CONFIDENCE_MOST_KEYWORDS;
  } else {
    return CLARITY_CONFIDENCE_FEW_KEYWORDS;
  }
}

export class ConfidenceCalculator {
  calculateLLMConfidence(modelOutput: any): number {
    if (typeof modelOutput === 'number') {
      return clampConfidence(modelOutput);
    }

    if (modelOutput && typeof modelOutput.confidence === 'number') {
      return clampConfidence(modelOutput.confidence);
    }

    return DEFAULT_LLM_CONFIDENCE;
  }

  calculateValidationConfidence(isValid: boolean, validationErrors?: string[]): number {
    if (isValid) {
      return VALIDATION_CONFIDENCE_PASS;
    }

    if (validationErrors && validationErrors.length > 0) {
      return VALIDATION_CONFIDENCE_FAIL;
    }

    return VALIDATION_CONFIDENCE_FAIL;
  }

  calculateClarityConfidence(text: string, expectedKeywords: string[]): number {
    if (!text || text.trim().length === 0) {
      return CLARITY_CONFIDENCE_NO_TEXT;
    }

    if (expectedKeywords.length === 0) {
      return CLARITY_CONFIDENCE_NO_KEYWORDS;
    }

    const lowerText = text.toLowerCase();
    const foundKeywords = expectedKeywords.filter((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    );

    const matchRatio = calculateMatchRatio(foundKeywords.length, expectedKeywords.length);
    return mapMatchRatioToClarityConfidence(matchRatio);
  }

  calculateFinalConfidence(breakdown: Omit<ConfidenceBreakdown, 'final_confidence'>): ConfidenceBreakdown {
    const final_confidence =
      breakdown.llm_confidence *
      breakdown.validation_confidence *
      breakdown.clarity_confidence;

    return {
      ...breakdown,
      final_confidence: clampConfidence(final_confidence),
    };
  }

  generateLowConfidenceReasons(breakdown: ConfidenceBreakdown, threshold: number = DEFAULT_CONFIDENCE_THRESHOLD): string[] {
    const reasons: string[] = [];

    if (breakdown.final_confidence >= threshold) {
      return reasons;
    }

    if (breakdown.llm_confidence < LLM_CONFIDENCE_LOW_THRESHOLD) {
      reasons.push(`Model uncertainty: The AI model was not confident in its prediction (${Math.round(breakdown.llm_confidence * 100)}%)`);
    }

    if (breakdown.validation_confidence < VALIDATION_CONFIDENCE_PASS) {
      if (breakdown.validation_confidence <= VALIDATION_CONFIDENCE_CRITICAL_THRESHOLD) {
        reasons.push('Validation failed: Extracted data does not match expected format or contains errors');
      } else {
        reasons.push('Partial validation: Some extracted fields have format issues');
      }
    }

    if (breakdown.clarity_confidence < CLARITY_CONFIDENCE_LOW_THRESHOLD) {
      if (breakdown.clarity_confidence <= CLARITY_CONFIDENCE_POOR_THRESHOLD) {
        reasons.push('Poor document quality: Document may be unclear, missing expected text, or heavily degraded');
      } else {
        reasons.push('Missing keywords: Document does not contain all expected identifying information');
      }
    }

    if (reasons.length === 0) {
      reasons.push('Combined factors: Multiple confidence components are slightly below optimal levels');
    }

    return reasons;
  }

  getExpectedKeywords(documentType: string): string[] {
    return EXPECTED_KEYWORDS_MAP[documentType] || [];
  }

  calculateClassificationConfidence(
    modelOutput: any,
    ocrText: string,
    predictedType: string,
    threshold?: number
  ): ConfidenceBreakdown {
    const llm_confidence = this.calculateLLMConfidence(modelOutput);
    const validation_confidence = CLASSIFICATION_VALIDATION_CONFIDENCE;
    const keywords = this.getExpectedKeywords(predictedType);
    const clarity_confidence = this.calculateClarityConfidence(ocrText, keywords);

    const breakdown = this.calculateFinalConfidence({
      llm_confidence,
      validation_confidence,
      clarity_confidence,
    });

    const reasons = this.generateLowConfidenceReasons(breakdown, threshold);
    return {
      ...breakdown,
      reasons: reasons.length > 0 ? reasons : undefined,
    };
  }

  calculateFieldConfidence(
    modelOutput: any,
    isValid: boolean,
    ocrText: string,
    fieldName: string,
    validationErrors?: string[],
    threshold?: number
  ): ConfidenceBreakdown {
    const llm_confidence = this.calculateLLMConfidence(modelOutput);
    const validation_confidence = this.calculateValidationConfidence(
      isValid,
      validationErrors
    );

    const clarity_confidence = FIELD_CLARITY_CONFIDENCE;

    const breakdown = this.calculateFinalConfidence({
      llm_confidence,
      validation_confidence,
      clarity_confidence,
    });

    const reasons = this.generateLowConfidenceReasons(breakdown, threshold);
    return {
      ...breakdown,
      reasons: reasons.length > 0 ? reasons : undefined,
    };
  }
}

let confidenceCalculator: ConfidenceCalculator | null = null;

export function getConfidenceCalculator(): ConfidenceCalculator {
  if (!confidenceCalculator) {
    confidenceCalculator = new ConfidenceCalculator();
  }
  return confidenceCalculator;
}
