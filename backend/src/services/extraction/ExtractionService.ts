import { getOllamaClient } from '../llm/OllamaClient';
import { getSchemaStore } from './SchemaStore';
import { getValidationService } from './ValidationService';
import { getLearningService } from '../learning/LearningService';
import { getConfidenceCalculator } from '../classification/ConfidenceCalculator';
import { getTypeCoercionService } from './TypeCoercionService';
import { logger } from '../../utils/logger';
import { getThreshold } from '../../utils/threshold';
import type { DocumentType, Field, OcrPage } from '@fuse/shared/schemas/documentTypes.zod';
import type { ExtractionModel } from '../../models/Extraction';

const LEARNING_EXAMPLE_MIN_CONFIDENCE = 0.5;
const OCR_TEXT_MAX_LENGTH = 4000;

const LLM_CONFIDENCE_EMPTY_STRING = 0.1;
const LLM_CONFIDENCE_SHORT_STRING = 0.3;
const LLM_CONFIDENCE_MEDIUM_STRING = 0.6;
const LLM_CONFIDENCE_LONG_STRING = 0.85;
const LLM_CONFIDENCE_NUMBER = 0.9;
const LLM_CONFIDENCE_BOOLEAN = 0.95;
const LLM_CONFIDENCE_EMPTY_ARRAY = 0.2;
const LLM_CONFIDENCE_FILLED_ARRAY = 0.8;
const LLM_CONFIDENCE_DEFAULT = 0.7;

const CLARITY_CONFIDENCE_NO_KEYWORDS = 0.3;
const CLARITY_CONFIDENCE_FEW_KEYWORDS = 0.5;
const CLARITY_CONFIDENCE_SOME_KEYWORDS = 0.7;
const CLARITY_CONFIDENCE_MOST_KEYWORDS = 0.95;
const CLARITY_CONFIDENCE_DEFAULT = 0.5;

const MIN_SEARCHABLE_TEXT_LENGTH = 2;
const MIN_PARTIAL_MATCH_LENGTH = 6;
const MIN_CONTAINED_MATCH_LENGTH_SHORT = 4;
const MIN_CONTAINED_MATCH_LENGTH_LONG = 8;
const LONG_PHRASE_THRESHOLD = 15;

export class ExtractionService {
  private ollamaClient: ReturnType<typeof getOllamaClient>;
  private schemaStore: ReturnType<typeof getSchemaStore>;
  private validationService: ReturnType<typeof getValidationService>;
  private learningService: ReturnType<typeof getLearningService>;
  private confidenceCalculator: ReturnType<typeof getConfidenceCalculator>;
  private typeCoercionService: ReturnType<typeof getTypeCoercionService>;

  constructor() {
    this.ollamaClient = getOllamaClient();
    this.schemaStore = getSchemaStore();
    this.validationService = getValidationService();
    this.learningService = getLearningService();
    this.confidenceCalculator = getConfidenceCalculator();
    this.typeCoercionService = getTypeCoercionService();
  }

  async extract(
    ocrText: string,
    documentType: DocumentType,
    documentId: number,
    ocrPages: OcrPage[] = []
  ): Promise<ExtractionModel> {
    console.log(`Starting extraction for document ${documentId}, type: ${documentType}`);

    const schema = this.schemaStore.getSchema(documentType);
    if (!schema) {
      throw new Error(`No schema found for document type: ${documentType}`);
    }

    // Get the confidence threshold for this document type from database
    const threshold = await getThreshold(documentType);

    const fieldNames = this.schemaStore.getFieldNames(documentType);
    const fieldKeywords = this.schemaStore.getFieldKeywords(documentType);

    const learningResult = await this.learningService.retrieveLearningExample({
      docType: documentType,
      confidence: LEARNING_EXAMPLE_MIN_CONFIDENCE,
      useToolCalling: false,
    });

    const prompt = this.buildExtractionPrompt(
      documentType,
      fieldNames,
      ocrText,
      learningResult.exampleFound ? learningResult.example : undefined
    );

    const startTime = Date.now();
    const response = await this.ollamaClient.chat({
      messages: [
        {
          role: 'system',
          content: 'You are a document extraction assistant. Extract structured data from OCR text and return valid JSON only. Do not include any explanations or markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      format: 'json',
    });
    const extractionTime = Date.now() - startTime;

    logger.log(`LLM extraction completed in ${extractionTime}ms`, {
      usedLearningExample: learningResult.exampleFound,
    });

    let extractedData: Record<string, any>;
    try {
      extractedData = JSON.parse(response.message.content);
    } catch {
      logger.error('Failed to parse LLM response:', response.message.content);
      throw new Error('Invalid JSON response from LLM');
    }

    extractedData = this.typeCoercionService.coerceAllFields(documentType, extractedData);
    console.log('Type coercion completed for extracted fields');

    const fields: Field[] = [];
    let totalConfidence = 0;

    for (const fieldName of fieldNames) {
      const value = extractedData[fieldName];

      const llmConfidence = this.calculateLLMConfidence(value);

      const validationResult = this.validationService.validateField(
        documentType,
        fieldName,
        value
      );
      const validationConfidence = validationResult.confidence;

      const keywords = fieldKeywords?.[fieldName] || [];
      const clarityConfidence = this.calculateClarityConfidence(ocrText, keywords);

      const finalConfidence = llmConfidence * validationConfidence * clarityConfidence;

      const confidenceBreakdown = {
        llm_confidence: llmConfidence,
        validation_confidence: validationConfidence,
        clarity_confidence: clarityConfidence,
        final_confidence: finalConfidence,
      };
      const reasons = this.confidenceCalculator.generateLowConfidenceReasons(
        confidenceBreakdown,
        threshold
      );

      totalConfidence += finalConfidence;

      const locationInfo = this.findFieldLocation(value, ocrPages);

      fields.push({
        name: fieldName,
        value: value ?? null,
        llm_confidence: llmConfidence,
        validation_confidence: validationConfidence,
        clarity_confidence: clarityConfidence,
        final_confidence: finalConfidence,
        page_number: locationInfo.pageNumber,
        bbox: locationInfo.bbox,
        validation_status: this.validationService.getValidationStatus(validationResult),
        validation_error: validationResult.error || null,
        reasons: reasons.length > 0 ? reasons : undefined,
      });
    }

    const overallConfidence = totalConfidence / fieldNames.length;

    const overallConfidenceBreakdown = {
      llm_confidence: fields.reduce((sum, f) => sum + f.llm_confidence, 0) / fields.length,
      validation_confidence: fields.reduce((sum, f) => sum + f.validation_confidence, 0) / fields.length,
      clarity_confidence: fields.reduce((sum, f) => sum + f.clarity_confidence, 0) / fields.length,
      final_confidence: overallConfidence,
    };
    const overallReasons = this.confidenceCalculator.generateLowConfidenceReasons(
      overallConfidenceBreakdown,
      threshold
    );

    return {
      document_id: documentId,
      fields,
      extraction_timestamp: new Date().toISOString(),
      overall_confidence: overallConfidence,
      schema_type: documentType,
      reasons: overallReasons.length > 0 ? overallReasons : undefined,
    };
  }

  private buildExtractionPrompt(
    documentType: DocumentType,
    fieldNames: string[],
    ocrText: string,
    learningExample?: any
  ): string {
    const fieldsDescription = fieldNames.map((name) => `  - ${name}`).join('\n');

    let prompt = `Extract the following fields from this ${documentType} document:

${fieldsDescription}

Return a JSON object with these exact field names as keys. If a field is not found, use null.

`;

    if (learningExample) {
      const examplePrompt = this.learningService.prepareLearningPrompt(learningExample);
      prompt += `${examplePrompt}\n\nNow extract from this document:\n\n`;
    }

    prompt += `OCR Text:
${ocrText.substring(0, OCR_TEXT_MAX_LENGTH)}

Return only valid JSON, no explanations.`;

    return prompt;
  }

  private calculateLLMConfidence(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return LLM_CONFIDENCE_EMPTY_STRING;
    }

    if (typeof value === 'string') {
      const length = value.trim().length;
      if (length < 2) return LLM_CONFIDENCE_SHORT_STRING;
      if (length < 5) return LLM_CONFIDENCE_MEDIUM_STRING;
      return LLM_CONFIDENCE_LONG_STRING;
    }

    if (typeof value === 'number') {
      return LLM_CONFIDENCE_NUMBER;
    }

    if (typeof value === 'boolean') {
      return LLM_CONFIDENCE_BOOLEAN;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return LLM_CONFIDENCE_EMPTY_ARRAY;
      return LLM_CONFIDENCE_FILLED_ARRAY;
    }

    return LLM_CONFIDENCE_DEFAULT;
  }

  private calculateClarityConfidence(text: string, keywords: string[]): number {
    if (keywords.length === 0) {
      return CLARITY_CONFIDENCE_DEFAULT;
    }

    const lowerText = text.toLowerCase();
    let matchCount = 0;

    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }

    const matchRate = matchCount / keywords.length;

    if (matchRate === 0) return CLARITY_CONFIDENCE_NO_KEYWORDS;
    if (matchRate < 0.3) return CLARITY_CONFIDENCE_FEW_KEYWORDS;
    if (matchRate < 0.6) return CLARITY_CONFIDENCE_SOME_KEYWORDS;
    return CLARITY_CONFIDENCE_MOST_KEYWORDS;
  }

  private findFieldLocation(
    value: any,
    ocrPages: OcrPage[]
  ): { pageNumber: number | null; bbox: [number, number, number, number] | null } {
    if (!ocrPages || ocrPages.length === 0 || value === null || value === undefined) {
      return { pageNumber: null, bbox: null };
    }

    let searchText: string;
    if (typeof value === 'string') {
      searchText = value.trim();
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      searchText = String(value);
    } else if (Array.isArray(value)) {
      if (value.length > 0) {
        searchText = String(value[0]);
      } else {
        return { pageNumber: null, bbox: null };
      }
    } else {
      return { pageNumber: null, bbox: null };
    }

    if (searchText.length < MIN_SEARCHABLE_TEXT_LENGTH) {
      return { pageNumber: null, bbox: null };
    }

    const normalizedSearch = searchText.toLowerCase().replace(/[^a-z0-9\s]/g, '');

    for (const page of ocrPages) {
      if (!page.words || page.words.length === 0) {
        continue;
      }

      for (let i = 0; i < page.words.length; i++) {
        const word = page.words[i];
        const normalizedWord = word.text.toLowerCase().replace(/[^a-z0-9\s]/g, '');

        if (normalizedWord === normalizedSearch) {
          return {
            pageNumber: page.page,
            bbox: word.bbox as [number, number, number, number],
          };
        }

        const wordCount = searchText.split(/\s+/).length;
        const maxLookahead = Math.min(Math.max(wordCount + 3, 10), 20);

        if (i < page.words.length - 1) {
          let combinedText = word.text;
          let minX = word.bbox[0];
          let minY = word.bbox[1];
          let maxX = word.bbox[0] + word.bbox[2];
          let maxY = word.bbox[1] + word.bbox[3];

          for (let j = i + 1; j < Math.min(i + maxLookahead, page.words.length); j++) {
            const nextWord = page.words[j];
            combinedText += ' ' + nextWord.text;
            const normalizedCombined = combinedText.toLowerCase().replace(/[^a-z0-9\s]/g, '');

            minX = Math.min(minX, nextWord.bbox[0]);
            minY = Math.min(minY, nextWord.bbox[1]);
            maxX = Math.max(maxX, nextWord.bbox[0] + nextWord.bbox[2]);
            maxY = Math.max(maxY, nextWord.bbox[1] + nextWord.bbox[3]);

            if (normalizedCombined === normalizedSearch) {
              return {
                pageNumber: page.page,
                bbox: [minX, minY, maxX - minX, maxY - minY] as [number, number, number, number],
              };
            }

            const compactCombined = normalizedCombined.replace(/\s/g, '');
            const compactSearch = normalizedSearch.replace(/\s/g, '');

            if (compactCombined === compactSearch) {
              return {
                pageNumber: page.page,
                bbox: [minX, minY, maxX - minX, maxY - minY] as [number, number, number, number],
              };
            }

            const minLength = searchText.length > LONG_PHRASE_THRESHOLD ? MIN_CONTAINED_MATCH_LENGTH_LONG : MIN_CONTAINED_MATCH_LENGTH_SHORT;
            if (normalizedCombined.includes(normalizedSearch) && normalizedSearch.length > minLength) {
              return {
                pageNumber: page.page,
                bbox: [minX, minY, maxX - minX, maxY - minY] as [number, number, number, number],
              };
            }
          }
        }
      }

      if (normalizedSearch.length > MIN_PARTIAL_MATCH_LENGTH) {
        for (const word of page.words) {
          const normalizedWord = word.text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
          if (normalizedWord.includes(normalizedSearch)) {
            return {
              pageNumber: page.page,
              bbox: word.bbox as [number, number, number, number],
            };
          }
        }
      }
    }

    return { pageNumber: null, bbox: null };
  }

  async validate(
    documentType: DocumentType,
    fields: Field[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const fieldMap: Record<string, any> = {};
    for (const field of fields) {
      fieldMap[field.name] = field.value;
    }

    const result = this.validationService.validateDocument(documentType, fieldMap);
    return {
      valid: result.valid,
      errors: result.errors,
    };
  }

  async reExtract(documentId: number, newType: DocumentType, ocrText: string): Promise<ExtractionModel> {
    console.log(`Re-extracting document ${documentId} with new type: ${newType}`);
    return this.extract(ocrText, newType, documentId);
  }
}

let extractionService: ExtractionService | null = null;

export function getExtractionService(): ExtractionService {
  if (!extractionService) {
    extractionService = new ExtractionService();
  }
  return extractionService;
}
