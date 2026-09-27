import { describe, expect, it } from 'bun:test';
import { canShowPdfInline } from './DocumentViewer';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

describe('inline PDF support', () => {
  it('follows what the browser reports', () => {
    expect(canShowPdfInline({ userAgent: ANDROID, pdfViewerEnabled: false })).toBe(false);
    expect(canShowPdfInline({ userAgent: IPHONE, pdfViewerEnabled: true })).toBe(true);
  });
  it('assumes no inline viewer on Android when the browser does not say', () => {
    expect(canShowPdfInline({ userAgent: ANDROID })).toBe(false);
    expect(canShowPdfInline({ userAgent: IPHONE })).toBe(true);
  });
});
