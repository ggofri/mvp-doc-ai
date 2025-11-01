import { getOllamaClient } from '../llm/OllamaClient';
import { getToolRegistry } from '../llm/ToolRegistry';
import { getConfidenceCalculator } from './ConfidenceCalculator';
import { getLearningService } from '../learning/LearningService';
import { getThreshold as getThresholdUtil } from '../../utils/threshold';
import { get, run } from '../../db/connection';
import type { ClassificationModel } from '../../models/Classification';
import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';
import { DocumentTypeEnum } from '@fuse/shared/schemas/documentTypes.zod';

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const MAPPED_TYPE_CONFIDENCE_CAP = 0.6;
const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 1.0;
const OCR_TEXT_SUBSTRING_LENGTH = 2000;
const DEFAULT_MAPPED_CONFIDENCE = 0.5;

const DOCUMENT_TYPE_MAPPING: Record<string, DocumentType> = {
  'conditional sales contract': 'Certificate of Insurance',
  'sales contract': 'Certificate of Insurance',
  'contract': 'Certificate of Insurance',
  'driver license': 'Government ID',
  'drivers license': 'Government ID',
  'passport': 'Government ID',
  'tax form': 'W-9',
  'w9': 'W-9',
};

const SYSTEM_PROMPT = `You are a document classification expert. Your task is to classify documents into EXACTLY ONE of these types:

1. Bank Statement
2. Government ID
3. W-9
4. Certificate of Insurance
5. Articles of Incorporation
6. Unknown

CRITICAL: You MUST choose one of the six types above. Do NOT create new types or variations.

If you are uncertain which type it is, use the get_gold_example tool to retrieve a corrected example document for comparison.

Use "Unknown" ONLY when the document clearly does not match any of the five known types. If you have ANY indicators that suggest one of the known types, choose that type even with lower confidence rather than "Unknown".

You MUST respond with a valid JSON object in EXACTLY this format:
{
  "document_type": "Bank Statement",
  "confidence": 0.95,
  "evidence": ["Found 'account balance'", "Contains transaction history", "Bank letterhead present"]
}

The "document_type" field MUST be one of: "Bank Statement", "Government ID", "W-9", "Certificate of Insurance", "Articles of Incorporation", or "Unknown".`;

function buildUserPrompt(ocrText: string): string {
  return `Classify this document:\n\n${ocrText.substring(0, OCR_TEXT_SUBSTRING_LENGTH)}`;
}

function buildLearningUserPrompt(learningPrompt: string, ocrText: string): string {
  return `${learningPrompt}\n\nNow classify this document:\n\n${ocrText.substring(0, OCR_TEXT_SUBSTRING_LENGTH)}`;
}


async function parseLLMResponse(responseContent: string): Promise<any> {
  try {
    return JSON.parse(responseContent);
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    throw new Error('Failed to parse classification result');
  }
}

function mapDocumentTypeVariation(predictedType: string): DocumentType | null {
  const normalizedType = predictedType.toLowerCase();
  return DOCUMENT_TYPE_MAPPING[normalizedType] || null;
}

function adjustConfidenceAfterMapping(currentConfidence: number | undefined): number {
  return Math.min(currentConfidence || DEFAULT_MAPPED_CONFIDENCE, MAPPED_TYPE_CONFIDENCE_CAP);
}

export class ClassificationService {
  private ollamaClient = getOllamaClient();
  private toolRegistry = getToolRegistry();
  private confidenceCalculator = getConfidenceCalculator();
  private learningService = getLearningService();

  async classify(ocrText: string, documentId: number): Promise<ClassificationModel> {
    const userPrompt = buildUserPrompt(ocrText);

    try {
      const result = await this.ollamaClient.chatWithTools(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        this.toolRegistry.getTools(),
        this.toolRegistry.createToolHandler(),
        { format: 'json' }
      );

      let parsed = await parseLLMResponse(result.response.content);
      let predictedType = parsed.document_type as DocumentType;

      let validationResult = DocumentTypeEnum.safeParse(predictedType);
      if (!validationResult.success) {
        console.error(`LLM returned invalid document type: "${predictedType}"`);

        const mappedType = mapDocumentTypeVariation(predictedType);

        if (mappedType) {
          console.log(`Mapped "${predictedType}" to "${mappedType}"`);
          predictedType = mappedType;
          parsed.document_type = mappedType;
          parsed.confidence = adjustConfidenceAfterMapping(parsed.confidence);
          validationResult = DocumentTypeEnum.safeParse(predictedType);
        }

        if (!validationResult.success) {
          throw new Error(`Invalid document type: ${predictedType}. Must be one of: ${Object.values(DocumentTypeEnum.enum).join(', ')}`);
        }
      }

      const threshold = await this.getThreshold(predictedType);

      const confidenceBreakdown = this.confidenceCalculator.calculateClassificationConfidence(
        parsed,
        ocrText,
        predictedType,
        threshold
      );

      let finalResult = parsed;
      let finalConfidenceBreakdown = confidenceBreakdown;
      let finalToolUsed = result.toolUsed;

      if (confidenceBreakdown.final_confidence < LOW_CONFIDENCE_THRESHOLD && !result.toolUsed) {
        console.log('Low confidence detected, attempting learning loop...');

        const learningResult = await this.learningService.retrieveLearningExample({
          docType: predictedType,
          confidence: confidenceBreakdown.final_confidence,
          useToolCalling: true,
        });

        if (learningResult.exampleFound && learningResult.example) {
          const learningPrompt = this.learningService.prepareLearningPrompt(
            learningResult.example
          );

          const retryResult = await this.ollamaClient.chatWithTools(
            [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildLearningUserPrompt(learningPrompt, ocrText) },
            ],
            this.toolRegistry.getTools(),
            this.toolRegistry.createToolHandler(),
            { format: 'json' }
          );

          try {
            const retryParsed = JSON.parse(retryResult.response.content);
            const retryConfidence = this.confidenceCalculator.calculateClassificationConfidence(
              retryParsed,
              ocrText,
              retryParsed.document_type,
              threshold
            );

            if (retryConfidence.final_confidence > confidenceBreakdown.final_confidence) {
              console.log('Learning loop improved confidence:', {
                before: confidenceBreakdown.final_confidence,
                after: retryConfidence.final_confidence,
              });
              finalResult = retryParsed;
              finalConfidenceBreakdown = retryConfidence;
              finalToolUsed = true;
            }
          } catch (error) {
            console.error('Failed to parse retry result:', error);
          }
        }
      }

      const requires_review = finalConfidenceBreakdown.final_confidence < threshold;

      const classificationResult: ClassificationModel = {
        predicted_type: finalResult.document_type,
        confidence: finalConfidenceBreakdown.final_confidence,
        threshold,
        requires_review,
        evidence: finalResult.evidence || [],
        tool_used: finalToolUsed,
        llm_confidence: finalConfidenceBreakdown.llm_confidence,
        clarity_confidence: finalConfidenceBreakdown.clarity_confidence,
        final_confidence: finalConfidenceBreakdown.final_confidence,
        reasons: finalConfidenceBreakdown.reasons,
      };

      console.log('Classification result:', {
        documentId,
        type: finalResult.document_type,
        confidence: finalConfidenceBreakdown.final_confidence,
        requires_review,
        tool_used: finalToolUsed,
      });

      return classificationResult;
    } catch (error) {
      console.error('Classification error:', error);
      throw new Error(`Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getThreshold(type: DocumentType): Promise<number> {
    // Use the shared utility function
    return await getThresholdUtil(type);
  }

  async setThreshold(type: DocumentType, threshold: number): Promise<void> {
    if (threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD) {
      throw new Error('Threshold must be between 0.5 and 1.0');
    }

    // Use the same mapping as the threshold utility
    const DOCUMENT_TYPE_TO_KEY: Record<DocumentType, string> = {
      'Bank Statement': 'threshold_bank_statement',
      'Government ID': 'threshold_government_id',
      'W-9': 'threshold_w9',
      'Certificate of Insurance': 'threshold_coi',
      'Articles of Incorporation': 'threshold_articles',
      'Unknown': 'threshold_unknown',
    };
    const key = DOCUMENT_TYPE_TO_KEY[type] || `threshold_${type.replace(/\s+/g, '_').replace(/-/g, '').toLowerCase()}`;

    await run(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, threshold.toString()]
    );

    console.log(`Updated threshold for ${type}: ${threshold}`);
  }
}

let classificationService: ClassificationService | null = null;

export function getClassificationService(): ClassificationService {
  if (!classificationService) {
    classificationService = new ClassificationService();
  }
  return classificationService;
}
