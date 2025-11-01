import { getExampleStore, type GoldExample } from './ExampleStore';
import { getToolRegistry } from '../llm/ToolRegistry';
import { getMetricsCalculator } from '../metrics/MetricsCalculator';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_CONFIDENCE = 0;
const DEFAULT_KEYWORDS: string[] = [];
const DEFAULT_USE_TOOL_CALLING = true;
const DEFAULT_EXAMPLE_LIMIT = 1;
const OCR_TEXT_EXCERPT_LENGTH = 500;
const DEFAULT_LEARNING_RESULT = {
  exampleFound: false,
  toolUsed: false,
};

export interface LearningContext {
  docType?: DocumentType;
  keywords?: string[];
  confidence?: number;
  useToolCalling: boolean;
}

export interface LearningResult {
  exampleFound: boolean;
  example?: GoldExample;
  toolUsed: boolean;
  improvementSuggestion?: string;
}

function extractOcrTextFromExample(example: GoldExample): string {
  try {
    if (typeof example.ocrText === 'string') {
      const ocrJson = JSON.parse(example.ocrText);
      return ocrJson.map((page: any) => page.text).join('\n').substring(0, OCR_TEXT_EXCERPT_LENGTH);
    } else {
      return String(example.ocrText).substring(0, OCR_TEXT_EXCERPT_LENGTH);
    }
  } catch {
    return String(example.ocrText).substring(0, OCR_TEXT_EXCERPT_LENGTH);
  }
}

function calculateTotalGoldExamples(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

export class LearningService {
  private exampleStore = getExampleStore();
  private toolRegistry = getToolRegistry();
  private metricsCalculator = getMetricsCalculator();

  async shouldUseLearning(
    confidence: number,
    docType: DocumentType,
    threshold: number = DEFAULT_CONFIDENCE_THRESHOLD
  ): Promise<boolean> {
    if (confidence >= threshold) {
      return false;
    }

    const counts = await this.exampleStore.getGoldExampleCounts();
    return (counts[docType] || 0) > 0;
  }

  async retrieveLearningExample(context: LearningContext): Promise<LearningResult> {
    const { docType, keywords = DEFAULT_KEYWORDS, confidence = DEFAULT_CONFIDENCE, useToolCalling = DEFAULT_USE_TOOL_CALLING } = context;

    if (!docType) {
      return DEFAULT_LEARNING_RESULT;
    }

    const shouldLearn = await this.shouldUseLearning(confidence, docType);
    if (!shouldLearn) {
      return DEFAULT_LEARNING_RESULT;
    }

    try {
      const example = await this.exampleStore.getGoldExample({
        docType,
        keywords,
        limit: DEFAULT_EXAMPLE_LIMIT,
      });

      if (!example) {
        return {
          exampleFound: false,
          toolUsed: useToolCalling,
        };
      }

      const improvementSuggestion = this.generateImprovementSuggestion(example);

      return {
        exampleFound: true,
        example,
        toolUsed: useToolCalling,
        improvementSuggestion,
      };
    } catch (error) {
      console.error('Error retrieving learning example:', error);
      return {
        exampleFound: false,
        toolUsed: useToolCalling,
      };
    }
  }

  private generateImprovementSuggestion(example: GoldExample): string {
    if (example.fieldName) {
      return `Field '${example.fieldName}' was corrected to '${example.correctedValue}'. Use this as a reference for similar extractions.`;
    }

    return `Document type was corrected to '${example.docType}'. Use the extraction pattern from this example.`;
  }

  async getLearningImpact(): Promise<LearningImpact> {
    try {
      const counts = await this.exampleStore.getGoldExampleCounts();
      const totalGoldExamples = calculateTotalGoldExamples(counts);
      const learningMetrics = await this.metricsCalculator.calculateLearningMetrics();
      const accuracyImprovement = learningMetrics.accuracyImprovement;

      return {
        totalGoldExamples,
        examplesByType: counts,
        accuracyImprovement,
      };
    } catch (error) {
      console.error('Error calculating learning impact:', error);
      return {
        totalGoldExamples: 0,
        examplesByType: {},
        accuracyImprovement: null,
      };
    }
  }

  prepareLearningPrompt(example: GoldExample): string {
    const ocrText = extractOcrTextFromExample(example);

    return `
Here is a corrected example of a ${example.docType}:

OCR Text Excerpt:
${ocrText}

Corrected Extraction:
${JSON.stringify(example.extraction, null, 2)}

Use this example as a reference to improve your extraction accuracy.
`;
  }
}

export interface LearningImpact {
  totalGoldExamples: number;
  examplesByType: Record<string, number>;
  accuracyImprovement: number | null;
}

let learningServiceInstance: LearningService | null = null;

export function getLearningService(): LearningService {
  if (!learningServiceInstance) {
    learningServiceInstance = new LearningService();
  }
  return learningServiceInstance;
}
