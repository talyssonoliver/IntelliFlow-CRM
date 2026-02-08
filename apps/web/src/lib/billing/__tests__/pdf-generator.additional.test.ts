/**
 * Additional tests for pdf-generator.ts
 * Covers uncovered lines
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted so mock variables are available inside vi.mock factories
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  createObjectURL: vi.fn().mockReturnValue('blob:http://localhost/fake'),
  revokeObjectURL: vi.fn(),
  windowOpen: vi.fn(),
  click: vi.fn(),
  appendChild: vi.fn(),
  removeChild: vi.fn(),
  createElement: vi.fn(),
}));

// We must set up globals in beforeEach because unstubGlobals: true cleans them
function setupGlobals() {
  mocks.createElement.mockReturnValue({ href: '', download: '', click: mocks.click });

  (globalThis as any).fetch = mocks.fetch;
  (globalThis as any).URL = class MockURL {
    protocol: string;
    constructor(url: string) {
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ftp://'))) {
        throw new TypeError('Invalid URL');
      }
      this.protocol = url.startsWith('https') ? 'https:' : url.startsWith('http') ? 'http:' : 'ftp:';
    }
    static createObjectURL = mocks.createObjectURL;
    static revokeObjectURL = mocks.revokeObjectURL;
  };
  (globalThis as any).window = { open: mocks.windowOpen };
  (globalThis as any).document = {
    createElement: mocks.createElement,
    body: { appendChild: mocks.appendChild, removeChild: mocks.removeChild },
  };
}

import {
  isValidPdfUrl,
  generateInvoiceFilename,
  openInvoicePdf,
  downloadInvoicePdf,
  getInvoicePdfInfo,
  getBestViewUrl,
} from '../pdf-generator';

describe('pdf-generator additional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setupGlobals();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isValidPdfUrl', () => {
    it('returns true for https', () => expect(isValidPdfUrl('https://x.com/a.pdf')).toBe(true));
    it('returns true for http', () => expect(isValidPdfUrl('http://x.com/a.pdf')).toBe(true));
    it('returns false for null', () => expect(isValidPdfUrl(null)).toBe(false));
    it('returns false for undefined', () => expect(isValidPdfUrl(undefined)).toBe(false));
    it('returns false for empty', () => expect(isValidPdfUrl('')).toBe(false));
    it('returns false for ftp', () => expect(isValidPdfUrl('ftp://x.com/a')).toBe(false));
    it('returns false for invalid', () => expect(isValidPdfUrl('not-a-url')).toBe(false));
  });

  describe('generateInvoiceFilename', () => {
    it('uses short ID with underscore', () => {
      const r = generateInvoiceFilename('inv_abc', new Date('2026-01-15'));
      expect(r).toMatch(/^invoice-abc-.*\.pdf$/);
    });
    it('uses full ID without underscore', () => {
      const r = generateInvoiceFilename('INV1', new Date('2026-06-20'));
      expect(r).toMatch(/^invoice-INV1-.*\.pdf$/);
    });
    it('formats date as DD-MM-YYYY', () => {
      const r = generateInvoiceFilename('inv_t', new Date('2026-03-05'));
      expect(r).toContain('05-03-2026');
    });
    it('handles multiple underscores', () => {
      const r = generateInvoiceFilename('org_inv_abc', new Date('2026-01-01'));
      expect(r).toMatch(/^invoice-abc-/);
    });
  });

  describe('openInvoicePdf', () => {
    it('opens valid URL', () => {
      openInvoicePdf('https://x.com/a.pdf');
      expect(mocks.windowOpen).toHaveBeenCalledWith('https://x.com/a.pdf', '_blank', 'noopener,noreferrer');
    });
    it('warns for invalid URL', () => {
      const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
      openInvoicePdf('bad');
      expect(mocks.windowOpen).not.toHaveBeenCalled();
      w.mockRestore();
    });
  });

  describe('downloadInvoicePdf', () => {
    it('throws for invalid URL', async () => {
      await expect(downloadInvoicePdf('bad', 'f.pdf')).rejects.toThrow('Invalid PDF URL');
    });

    it('downloads via blob', async () => {
      const blob = new Blob(['p']);
      mocks.fetch.mockResolvedValue({ ok: true, blob: vi.fn().mockResolvedValue(blob) });
      await downloadInvoicePdf('https://x.com/f.pdf', 'inv.pdf');
      expect(mocks.fetch).toHaveBeenCalledWith('https://x.com/f.pdf');
      expect(mocks.click).toHaveBeenCalled();
      vi.advanceTimersByTime(150);
      expect(mocks.revokeObjectURL).toHaveBeenCalled();
    });

    it('throws on non-ok response and falls back to window.open', async () => {
      mocks.fetch.mockResolvedValue({ ok: false, statusText: 'Not Found' });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(downloadInvoicePdf('https://x.com/f.pdf', 'i.pdf')).rejects.toThrow('Not Found');
      expect(mocks.windowOpen).toHaveBeenCalled();
    });

    it('falls back on network error', async () => {
      mocks.fetch.mockRejectedValue(new Error('Net'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(downloadInvoicePdf('https://x.com/f.pdf', 'i.pdf')).rejects.toThrow('Net');
      expect(mocks.windowOpen).toHaveBeenCalled();
    });
  });

  describe('getInvoicePdfInfo', () => {
    it('canDownload with valid pdf', () => {
      const i = getInvoicePdfInfo('https://x.com/p', null);
      expect(i.canDownload).toBe(true);
      expect(i.canView).toBe(true);
    });
    it('canView with hosted only', () => {
      const i = getInvoicePdfInfo(null, 'https://x.com/h');
      expect(i.canDownload).toBe(false);
      expect(i.canView).toBe(true);
    });
    it('false for both null', () => {
      const i = getInvoicePdfInfo(null, null);
      expect(i.canDownload).toBe(false);
    });
    it('both valid', () => {
      const i = getInvoicePdfInfo('https://x.com/p', 'https://x.com/h');
      expect(i.pdfUrl).toBe('https://x.com/p');
      expect(i.hostedUrl).toBe('https://x.com/h');
    });
    it('undefined args', () => {
      const i = getInvoicePdfInfo(undefined, undefined);
      expect(i.canView).toBe(false);
    });
  });

  describe('getBestViewUrl', () => {
    it('prefers pdf', () => expect(getBestViewUrl('https://x.com/p', 'https://x.com/h')).toBe('https://x.com/p'));
    it('falls back to hosted', () => expect(getBestViewUrl(null, 'https://x.com/h')).toBe('https://x.com/h'));
    it('null for both null', () => expect(getBestViewUrl(null, null)).toBeNull());
    it('null for no args', () => expect(getBestViewUrl()).toBeNull());
    it('null for both undefined', () => expect(getBestViewUrl(undefined, undefined)).toBeNull());
  });
});
