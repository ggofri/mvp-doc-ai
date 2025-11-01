import type { OllamaTool } from './OllamaClient';

import type { DocumentType } from '@fuse/shared/schemas/documentTypes.zod';
import { getExampleStore } from '../learning/ExampleStore';

const DEFAULT_KEYWORDS: string[] = [];
const DEFAULT_EXAMPLE_LIMIT = 1;
const OCR_TEXT_EXCERPT_LENGTH = 500;

const DOCUMENT_TYPES_ENUM = [
  'Bank Statement',
  'Government ID',
  'W-9',
  'Certificate of Insurance',
  'Articles of Incorporation',
];

export interface ToolDefinition {
  tool: OllamaTool;
  handler: (args: any) => Promise<string>;
}

function sanitizeKeywords(keywords: string[] | string | undefined): string[] {
  if (!keywords) {
    return DEFAULT_KEYWORDS;
  }

  if (Array.isArray(keywords)) {
    return keywords;
  }

  if (typeof keywords === 'string') {
    try {
      const parsed = JSON.parse(keywords);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      console.warn('Invalid keywords format, ignoring:', keywords);
    }
  }

  return DEFAULT_KEYWORDS;
}

function extractOcrTextFromExample(example: any): string {
  try {
    if (typeof example.ocrText === 'string') {
      const ocrJson = JSON.parse(example.ocrText);
      return ocrJson.map((page: any) => page.text).join('\n');
    } else {
      return example.ocrText;
    }
  } catch {
    return String(example.ocrText);
  }
}

function buildGoldExampleResponse(example: any): string {
  const ocrText = extractOcrTextFromExample(example);

  return JSON.stringify({
    found: true,
    document_type: example.docType,
    ocr_text_excerpt: ocrText.substring(0, OCR_TEXT_EXCERPT_LENGTH),
    corrected_extraction: example.extraction,
    corrected_field: example.fieldName ? {
      field_name: example.fieldName,
      corrected_value: example.correctedValue,
    } : null,
    note: 'This is a corrected example. Use it to improve your extraction accuracy.',
  });
}

function buildNoExampleResponse(docType: DocumentType): string {
  return JSON.stringify({
    found: false,
    message: `No gold examples found for document type: ${docType}`,
  });
}

function buildErrorResponse(): string {
  return JSON.stringify({
    found: false,
    error: 'Failed to retrieve example',
  });
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    this.register({
      tool: {
        type: 'function',
        function: {
          name: 'get_gold_example',
          description:
            'Retrieve a corrected example document for few-shot learning. Use this when confidence is low or the document type is ambiguous.',
          parameters: {
            type: 'object',
            properties: {
              doc_type: {
                type: 'string',
                enum: DOCUMENT_TYPES_ENUM,
                description: 'The document type to retrieve an example for',
              },
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Optional keywords to find similar documents (e.g., ["bank", "statement"])',
              },
            },
            required: ['doc_type'],
          },
        },
      },
      handler: this.handleGetGoldExample.bind(this),
    });
  }

  private async handleGetGoldExample(args: {
    doc_type: DocumentType;
    keywords?: string[] | string;
  }): Promise<string> {
    try {
      const exampleStore = getExampleStore();
      const keywords = sanitizeKeywords(args.keywords);

      const example = await exampleStore.getGoldExample({
        docType: args.doc_type,
        keywords,
        limit: DEFAULT_EXAMPLE_LIMIT,
      });

      if (!example) {
        return buildNoExampleResponse(args.doc_type);
      }

      return buildGoldExampleResponse(example);
    } catch (error) {
      console.error('Error in get_gold_example handler:', error);
      return buildErrorResponse();
    }
  }

  register(definition: ToolDefinition): void {
    const toolName = definition.tool.function.name;
    this.tools.set(toolName, definition);
    console.log(`Registered tool: ${toolName}`);
  }

  getTools(): OllamaTool[] {
    return Array.from(this.tools.values()).map((def) => def.tool);
  }

  async executeTool(toolName: string, args: any): Promise<string> {
    const definition = this.tools.get(toolName);

    if (!definition) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    return definition.handler(args);
  }

  createToolHandler(): (toolName: string, args: any) => Promise<string> {
    return async (toolName: string, args: any) => {
      return this.executeTool(toolName, args);
    };
  }
}

let toolRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!toolRegistry) {
    toolRegistry = new ToolRegistry();
  }
  return toolRegistry;
}
