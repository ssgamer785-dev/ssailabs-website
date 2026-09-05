/*
 * The rendering engines are loaded on demand, not at startup.
 *
 * `html-to-image` (with its DOMPurify dependency) and `jsPDF` are ~390 kB of
 * JavaScript — about 112 kB over the wire, and rather more in parse time on a
 * low-end Windows PC. Imported at the top of this file they were pulled into
 * the entry graph and downloaded on first paint of every session, because the
 * three screens that can export are always in the component tree. Almost no
 * visit presses Download PDF.
 *
 * Each is fetched once, on the first export, and cached for the rest of the
 * session. The two are loaded in parallel where a function needs both.
 */
type ToPng = typeof import('html-to-image')['toPng'];
type JsPdfCtor = typeof import('jspdf')['jsPDF'];

let toPngPromise: Promise<ToPng> | null = null;
let jsPdfPromise: Promise<JsPdfCtor> | null = null;

const loadToPng = (): Promise<ToPng> =>
  (toPngPromise ??= import('html-to-image').then(m => m.toPng));

const loadJsPdf = (): Promise<JsPdfCtor> =>
  (jsPdfPromise ??= import('jspdf').then(m => m.jsPDF));

export interface ExportResult {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Ensures all custom fonts and web fonts are fully loaded before rendering
 */
async function waitForFonts(): Promise<void> {
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (err) {
    console.warn('Font loading check failed:', err);
  }
}

/**
 * Ensures all images inside the given container are fully loaded and decoded
 */
async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (img.complete && img.naturalHeight !== 0) return;
      try {
        if ('decode' in img) {
          await img.decode();
        }
      } catch {
        // Fallback standard load listener
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          // Timeout safety in case image fails to respond
          setTimeout(resolve, 1500);
        });
      }
    })
  );
}

/**
 * Direct SVG ForeignObject rasterizer as an ultra-reliable fallback
 * Completely avoids html2canvas oklab parsing errors
 */
async function rasterizeViaSvg(
  element: HTMLElement,
  bgColor: string = '#FAF8F5',
  scale: number = 2.5
): Promise<ExportResult> {
  const width = element.scrollWidth || element.offsetWidth || 794;
  const height = element.scrollHeight || element.offsetHeight || 1123;

  const clone = element.cloneNode(true) as HTMLElement;
  // Remove non-print elements in clone
  const noPrintEls = clone.querySelectorAll('.no-print, [data-no-print]');
  noPrintEls.forEach((el) => el.remove());

  // Embed serialized HTML into an SVG ForeignObject
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="${bgColor}"/>
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;min-height:${height}px;background-color:${bgColor};font-family:'Manrope',sans-serif;">
          ${serialized}
        </div>
      </foreignObject>
    </svg>
  `;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      const dataUrl = canvas.toDataURL('image/png', 0.98);
      resolve({
        canvas,
        dataUrl,
        width: canvas.width,
        height: canvas.height
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Master Source Generator: Captures the target export canvas at high resolution.
 * Returns a high-DPI HTMLCanvasElement and PNG Data URL.
 */
export async function captureMasterBillCanvas(elementId: string = 'bill-export-canvas'): Promise<ExportResult> {
  let targetElement: HTMLElement | null = null;
  if (elementId === 'bill-export-canvas' || elementId === 'printable-customer-bill') {
    targetElement = document.getElementById('bill-export-canvas') || document.getElementById('printable-customer-bill');
  } else {
    targetElement = document.getElementById(elementId) || document.getElementById('bill-export-canvas');
  }

  if (!targetElement) {
    throw new Error(`Export target element "#${elementId}" not found in DOM.`);
  }

  // 1. Wait for typography & images to finish loading completely
  await waitForFonts();
  await waitForImages(targetElement);

  // Give a small tick (100ms) for layout stabilizing
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // Primary High-Fidelity Engine: html-to-image toPng
    const dataUrl = await (await loadToPng())(targetElement, {
      pixelRatio: 2.5,
      backgroundColor: '#FAF8F5',
      cacheBust: true,
      skipFonts: true,
      fontEmbedCSS: '',
      filter: (node) => {
        if (node instanceof HTMLElement && (node.classList.contains('no-print') || node.hasAttribute('data-no-print'))) {
          return false;
        }
        return true;
      }
    });

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FAF8F5';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        }
        resolve({
          canvas,
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  } catch (err) {
    console.warn('html-to-image capture fallback to direct SVG rasterizer:', err);
    return await rasterizeViaSvg(targetElement, '#FAF8F5', 2.5);
  }
}

/**
 * Downloads a DOM element as a crisp, uncropped Master PNG image.
 */
export async function downloadElementAsImage(
  elementId: string = 'bill-export-canvas',
  filename: string = 'Regency_Tailors_Document.png'
): Promise<boolean> {
  try {
    const { dataUrl } = await captureMasterBillCanvas(elementId);

    const safeName = filename.endsWith('.png') ? filename : `${filename}.png`;
    const link = document.createElement('a');
    link.download = safeName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (error) {
    console.error('Error exporting PNG Image:', error);
    return false;
  }
}

/**
 * Calculates uniform fit scaling for placing a rendered canvas image onto an A4 page
 * without stretching, cropping, or distortion.
 */
export function calculateUniformFit(
  canvasWidth: number,
  canvasHeight: number,
  availableWidth: number,
  availableHeight: number
): { scale: number; finalWidth: number; finalHeight: number } {
  const scaleX = availableWidth / canvasWidth;
  const scaleY = availableHeight / canvasHeight;
  const scale = Math.min(scaleX, scaleY);

  const finalWidth = canvasWidth * scale;
  const finalHeight = canvasHeight * scale;

  return { scale, finalWidth, finalHeight };
}

/**
 * Downloads a DOM element as a true high-resolution A4 PDF document.
 * Automatically detects multi-page containers (e.g. Production Slips with .a4-production-page)
 */
export async function downloadElementAsPdf(
  elementId: string = 'bill-export-canvas',
  filename: string = 'Regency_Tailors_Document.pdf',
  marginMm: number = 4
): Promise<boolean> {
  try {
    const container = document.getElementById(elementId);
    
    // Check if the target element contains multiple paginated A4 pages
    if (container) {
      const pageElements = Array.from(container.querySelectorAll<HTMLElement>('.a4-production-page'));
      if (pageElements.length > 0) {
        return await downloadProductionSlipPdf(pageElements, filename);
      }
    }

    const { dataUrl, width: canvasWidth, height: canvasHeight } = await captureMasterBillCanvas(elementId);

    const pdf = new (await loadJsPdf())({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfPageWidth = 210;
    const pdfPageHeight = 297;

    // Fill entire A4 canvas with Warm Ivory background #FAF8F5
    pdf.setFillColor(250, 248, 245);
    pdf.rect(0, 0, pdfPageWidth, pdfPageHeight, 'F');

    const margin = Math.max(0, marginMm);
    const availableWidth = pdfPageWidth - (margin * 2);
    const availableHeight = pdfPageHeight - (margin * 2);

    const { finalWidth, finalHeight } = calculateUniformFit(
      canvasWidth,
      canvasHeight,
      availableWidth,
      availableHeight
    );

    const offsetX = (pdfPageWidth - finalWidth) / 2;
    const offsetY = (pdfPageHeight - finalHeight) / 2;

    pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, finalWidth, finalHeight, undefined, 'FAST');

    const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(safeName);
    return true;
  } catch (error) {
    console.error('Error exporting PDF document:', error);
    window.print();
    return false;
  }
}

/**
 * Captures an individual page element at crisp 2.5x scale for multi-page PDF generation.
 */
export async function captureSinglePageElement(element: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> {
  await waitForFonts();
  await waitForImages(element);

  try {
    const dataUrl = await (await loadToPng())(element, {
      pixelRatio: 2.5,
      backgroundColor: '#FAF8F5',
      cacheBust: true,
      skipFonts: true,
      fontEmbedCSS: '',
      filter: (node) => {
        if (node instanceof HTMLElement && (node.classList.contains('no-print') || node.hasAttribute('data-no-print'))) {
          return false;
        }
        return true;
      }
    });

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  } catch (err) {
    console.warn('html-to-image single page capture fallback to SVG rasterizer:', err);
    return await rasterizeViaSvg(element, '#FAF8F5', 2.5);
  }
}

/**
 * Downloads a multi-page Production Slip as an authentic, full-bleed A4 PDF document.
 * Iterates through every paginated .a4-production-page container in order.
 */
export async function downloadProductionSlipPdf(
  pageElementIdsOrEls: (string | HTMLElement)[],
  filename: string = 'Regency_Tailors_Production_Slip.pdf'
): Promise<boolean> {
  try {
    const pageElements: HTMLElement[] = [];
    
    for (const item of pageElementIdsOrEls) {
      if (typeof item === 'string') {
        const el = document.getElementById(item);
        if (el) pageElements.push(el);
      } else if (item instanceof HTMLElement) {
        pageElements.push(item);
      }
    }

    if (pageElements.length === 0) {
      const found = Array.from(document.querySelectorAll<HTMLElement>('.a4-production-page'));
      if (found.length > 0) {
        pageElements.push(...found);
      } else {
        throw new Error('No production slip page elements found to export.');
      }
    }

    const pdf = new (await loadJsPdf())({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfPageWidth = 210;
    const pdfPageHeight = 297;
    const marginMm = 8;
    const availableWidth = pdfPageWidth - (marginMm * 2);
    const availableHeight = pdfPageHeight - (marginMm * 2);

    for (let i = 0; i < pageElements.length; i++) {
      const pageEl = pageElements[i];
      
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      // Warm Ivory page background #FAF8F5
      pdf.setFillColor(250, 248, 245);
      pdf.rect(0, 0, pdfPageWidth, pdfPageHeight, 'F');

      const { dataUrl, width: cWidth, height: cHeight } = await captureSinglePageElement(pageEl);

      const { finalWidth, finalHeight } = calculateUniformFit(
        cWidth,
        cHeight,
        availableWidth,
        availableHeight
      );

      const offsetX = (pdfPageWidth - finalWidth) / 2;
      const offsetY = marginMm;

      pdf.addImage(dataUrl, 'PNG', offsetX, offsetY, finalWidth, finalHeight, undefined, 'FAST');
    }

    const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    pdf.save(safeName);
    return true;
  } catch (error) {
    console.error('Error generating multi-page Production Slip PDF:', error);
    window.print();
    return false;
  }
}
