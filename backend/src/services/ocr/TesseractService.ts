import Tesseract from 'tesseract.js';
import type { OcrPage, OcrWord } from '@fuse/shared/schemas/documentTypes.zod';

const DEFAULT_WORKER_COUNT = 2;
const TESSERACT_LANGUAGE = 'eng';
const TESSERACT_OEM = 1;
const CONFIDENCE_SCALE = 100;
const MAX_PAGES = 100;
const FIRST_PAGE_NUMBER = 1;
const OCR_RECOGNIZE_JOB = 'recognize';
const OCR_STATUS_RECOGNIZING = 'recognizing text';

function convertConfidenceToNormalized(confidence: number): number {
  return confidence / CONFIDENCE_SCALE;
}

function calculateBoundingBoxWidth(x0: number, x1: number): number {
  return x1 - x0;
}

function calculateBoundingBoxHeight(y0: number, y1: number): number {
  return y1 - y0;
}

function createBoundingBox(x0: number, y0: number, x1: number, y1: number): number[] {
  return [
    x0,
    y0,
    calculateBoundingBoxWidth(x0, x1),
    calculateBoundingBoxHeight(y0, y1),
  ];
}

function buildOcrWord(word: any): OcrWord {
  return {
    text: word.text,
    bbox: createBoundingBox(word.bbox.x0, word.bbox.y0, word.bbox.x1, word.bbox.y1),
    confidence: convertConfidenceToNormalized(word.confidence),
  };
}

function createOcrLogger() {
  return (m: any) => {
    if (m.status === OCR_STATUS_RECOGNIZING) {
      console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
    }
  };
}

export class TesseractService {
  private scheduler: Tesseract.Scheduler | null = null;

  constructor(private workerCount: number = DEFAULT_WORKER_COUNT) {}

  async initialize(): Promise<void> {
    if (this.scheduler) {
      return;
    }

    this.scheduler = Tesseract.createScheduler();

    for (let i = 0; i < this.workerCount; i++) {
      const worker = await Tesseract.createWorker(TESSERACT_LANGUAGE, TESSERACT_OEM, {
        logger: createOcrLogger(),
      });
      this.scheduler.addWorker(worker);
    }

    console.log(`Tesseract initialized with ${this.workerCount} workers`);
  }

  async recognizePage(
    imageBuffer: Buffer,
    pageNumber: number
  ): Promise<OcrPage> {
    if (!this.scheduler) {
      throw new Error('TesseractService not initialized. Call initialize() first.');
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error(`Invalid image buffer for page ${pageNumber}: buffer is empty`);
    }

    const startTime = Date.now();

    try {
      const result = await this.scheduler.addJob(OCR_RECOGNIZE_JOB, imageBuffer);

      const duration = Date.now() - startTime;
      console.log(`OCR completed for page ${pageNumber} in ${duration}ms`);

      if (!result || !result.data) {
        throw new Error(`OCR failed for page ${pageNumber}: no data returned`);
      }

      const extractedText = result.data.text?.trim() || '';
      if (extractedText.length === 0) {
        console.warn(`Warning: No text extracted from page ${pageNumber}. This may be a blank page or image-only content.`);
      }

      const words: OcrWord[] = (result.data.words || []).map(buildOcrWord);

      return {
        page: pageNumber,
        text: extractedText,
        words,
      };
    } catch (error) {
      console.error(`OCR error on page ${pageNumber}:`, error);

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          throw new Error(`OCR timeout on page ${pageNumber}. The image may be too large or complex.`);
        } else if (error.message.includes('memory')) {
          throw new Error(`OCR memory error on page ${pageNumber}. Try reducing image resolution.`);
        } else if (error.message.includes('corrupt')) {
          throw new Error(`OCR failed on page ${pageNumber}: image file appears to be corrupted.`);
        }
      }

      throw new Error(`OCR failed on page ${pageNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async recognizePages(imageBuffers: Buffer[]): Promise<OcrPage[]> {
    if (!imageBuffers || imageBuffers.length === 0) {
      throw new Error('No image buffers provided for OCR processing');
    }

    if (imageBuffers.length > MAX_PAGES) {
      throw new Error(`Too many pages (${imageBuffers.length}). Maximum supported is ${MAX_PAGES} pages.`);
    }

    await this.initialize();

    const results: OcrPage[] = [];
    const errors: Array<{ page: number; error: string }> = [];

    await Promise.all(
      imageBuffers.map(async (buffer, index) => {
        try {
          const pageNumber = index + FIRST_PAGE_NUMBER;
          const result = await this.recognizePage(buffer, pageNumber);
          results.push(result);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const pageNumber = index + FIRST_PAGE_NUMBER;
          errors.push({ page: pageNumber, error: errorMessage });
          console.error(`Failed to process page ${pageNumber}:`, errorMessage);
        }
      })
    );

    if (errors.length > 0) {
      console.warn(`OCR completed with ${errors.length} failed pages:`, errors);

      if (results.length === 0) {
        throw new Error(`OCR failed on all ${imageBuffers.length} pages. First error: ${errors[0].error}`);
      }
    }

    return results.sort((a, b) => a.page - b.page);
  }

  async terminate(): Promise<void> {
    if (this.scheduler) {
      await this.scheduler.terminate();
      this.scheduler = null;
      console.log('Tesseract scheduler terminated');
    }
  }
}

let tesseractService: TesseractService | null = null;

export function getTesseractService(): TesseractService {
  if (!tesseractService) {
    tesseractService = new TesseractService();
  }
  return tesseractService;
}
