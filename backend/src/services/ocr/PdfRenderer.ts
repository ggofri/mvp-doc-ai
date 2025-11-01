import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, ImageData } from '@napi-rs/canvas';

const DEFAULT_RENDER_SCALE = 2.0;
const PNG_IMAGE_FORMAT = 'image/png';

if (typeof global !== 'undefined' && !(global as any).ImageData) {
  (global as any).ImageData = ImageData;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

export class PdfRenderer {
  async loadPdf(pdfPath: string): Promise<pdfjsLib.PDFDocumentProxy> {
    const loadingTask = pdfjsLib.getDocument(pdfPath);
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded: ${pdf.numPages} pages`);
    return pdf;
  }

  async renderPage(
    pdf: pdfjsLib.PDFDocumentProxy,
    pageNumber: number,
    scale: number = DEFAULT_RENDER_SCALE
  ): Promise<Buffer> {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    const renderContext = {
      canvasContext: context as any,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    return canvas.toBuffer(PNG_IMAGE_FORMAT);
  }

  async renderAllPages(
    pdfPath: string,
    scale: number = DEFAULT_RENDER_SCALE
  ): Promise<{ buffers: Buffer[]; pageCount: number }> {
    const pdf = await this.loadPdf(pdfPath);
    const pageCount = pdf.numPages;

    console.log(`Rendering ${pageCount} pages at scale ${scale}...`);

    const buffers: Buffer[] = [];
    const FIRST_PAGE_NUMBER = 1;
    for (let pageNum = FIRST_PAGE_NUMBER; pageNum <= pageCount; pageNum++) {
      const buffer = await this.renderPage(pdf, pageNum, scale);
      buffers.push(buffer);
      console.log(`Rendered page ${pageNum}/${pageCount}`);
    }

    return { buffers, pageCount };
  }

  async getPageCount(pdfPath: string): Promise<number> {
    const pdf = await this.loadPdf(pdfPath);
    return pdf.numPages;
  }
}

let pdfRenderer: PdfRenderer | null = null;

export function getPdfRenderer(): PdfRenderer {
  if (!pdfRenderer) {
    pdfRenderer = new PdfRenderer();
  }
  return pdfRenderer;
}
