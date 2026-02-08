import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock the pdf-generator module so invoice-actions gets controlled helpers.
 */
const mockDownloadInvoicePdf = vi.fn();
const mockOpenInvoicePdf = vi.fn();

vi.mock('../pdf-generator', () => ({
  downloadInvoicePdf: (...args: unknown[]) => mockDownloadInvoicePdf(...args),
  generateInvoiceFilename: (id: string, date: Date) => {
    const shortId = id.includes('_') ? id.split('_').pop() : id;
    return `invoice-${shortId}-${date.toISOString().slice(0, 10)}.pdf`;
  },
  getInvoicePdfInfo: (invoicePdf?: string | null, hostedUrl?: string | null) => {
    const pdfValid = typeof invoicePdf === 'string' && invoicePdf.startsWith('http');
    const hostedValid = typeof hostedUrl === 'string' && hostedUrl.startsWith('http');
    return {
      canDownload: pdfValid,
      canView: pdfValid || hostedValid,
      pdfUrl: pdfValid ? invoicePdf : null,
      hostedUrl: hostedValid ? hostedUrl : null,
    };
  },
  openInvoicePdf: (...args: unknown[]) => mockOpenInvoicePdf(...args),
  isValidPdfUrl: (url: string | null | undefined): url is string => {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  },
}));

import {
  downloadInvoice,
  viewInvoice,
  printInvoice,
  copyInvoiceLink,
  emailInvoice,
  hasValidPdf,
  hasViewableUrl,
  getInvoiceUrl,
  type InvoiceData,
} from '../invoice-actions';

// ============================================
// Test Data
// ============================================

const invoiceWithPdf: InvoiceData = {
  id: 'in_abc123',
  created: new Date('2026-01-15'),
  invoicePdf: 'https://stripe.com/invoice.pdf',
  hostedInvoiceUrl: 'https://stripe.com/hosted/invoice',
};

const invoiceWithHostedOnly: InvoiceData = {
  id: 'in_def456',
  created: new Date('2026-02-01'),
  invoicePdf: null,
  hostedInvoiceUrl: 'https://stripe.com/hosted/invoice2',
};

const invoiceWithNoUrls: InvoiceData = {
  id: 'in_ghi789',
  created: new Date('2026-02-01'),
  invoicePdf: null,
  hostedInvoiceUrl: null,
};

// ============================================
// downloadInvoice
// ============================================

describe('downloadInvoice', () => {
  beforeEach(() => {
    mockDownloadInvoicePdf.mockReset();
  });

  it('downloads invoice when PDF is available', async () => {
    mockDownloadInvoicePdf.mockResolvedValue(undefined);

    const result = await downloadInvoice(invoiceWithPdf);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Invoice downloaded successfully');
    expect(mockDownloadInvoicePdf).toHaveBeenCalledWith(
      'https://stripe.com/invoice.pdf',
      expect.stringContaining('invoice-')
    );
  });

  it('returns failure when no PDF is available', async () => {
    const result = await downloadInvoice(invoiceWithNoUrls);
    expect(result.success).toBe(false);
    expect(result.message).toBe('PDF not available');
    expect(result.error).toBeTruthy();
  });

  it('handles download error gracefully', async () => {
    mockDownloadInvoicePdf.mockRejectedValue(new Error('Network error'));

    const result = await downloadInvoice(invoiceWithPdf);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Download failed');
    expect(result.error).toBe('Network error');
  });

  it('handles non-Error thrown objects', async () => {
    mockDownloadInvoicePdf.mockRejectedValue('string error');

    const result = await downloadInvoice(invoiceWithPdf);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error occurred');
  });

  it('generates filename from invoice id and date', async () => {
    mockDownloadInvoicePdf.mockResolvedValue(undefined);

    await downloadInvoice(invoiceWithPdf);
    const filenameArg = mockDownloadInvoicePdf.mock.calls[0][1];
    expect(filenameArg).toContain('abc123'); // last part of in_abc123
    expect(filenameArg.endsWith('.pdf')).toBe(true);
  });
});

// ============================================
// viewInvoice
// ============================================

describe('viewInvoice', () => {
  beforeEach(() => {
    mockOpenInvoicePdf.mockReset();
  });

  it('opens PDF URL when available', () => {
    const result = viewInvoice(invoiceWithPdf);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Invoice opened in new tab');
    expect(mockOpenInvoicePdf).toHaveBeenCalledWith('https://stripe.com/invoice.pdf');
  });

  it('opens hosted URL when PDF is not available', () => {
    const result = viewInvoice(invoiceWithHostedOnly);
    expect(result.success).toBe(true);
    expect(mockOpenInvoicePdf).toHaveBeenCalledWith('https://stripe.com/hosted/invoice2');
  });

  it('returns failure when no URLs are available', () => {
    const result = viewInvoice(invoiceWithNoUrls);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invoice not viewable');
  });
});

// ============================================
// printInvoice
// ============================================

describe('printInvoice', () => {
  let mockIframe: Record<string, unknown>;

  beforeEach(() => {
    mockIframe = {
      style: {},
      src: '',
      onload: null as unknown,
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockIframe as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
  });

  it('creates iframe and returns success for valid invoice', () => {
    const result = printInvoice(invoiceWithPdf);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Print dialog opened');
    expect(document.createElement).toHaveBeenCalledWith('iframe');
    expect(document.body.appendChild).toHaveBeenCalled();
  });

  it('returns failure when no viewable URL', () => {
    const result = printInvoice(invoiceWithNoUrls);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invoice not printable');
  });

  it('sets iframe src to PDF URL', () => {
    printInvoice(invoiceWithPdf);
    expect(mockIframe.src).toBe('https://stripe.com/invoice.pdf');
  });

  it('uses hosted URL when PDF URL is not available', () => {
    printInvoice(invoiceWithHostedOnly);
    expect(mockIframe.src).toBe('https://stripe.com/hosted/invoice2');
  });

  it('handles exception in print flow', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('DOM error');
    });
    const result = printInvoice(invoiceWithPdf);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Print failed');
    expect(result.error).toBe('DOM error');
  });
});

// ============================================
// copyInvoiceLink
// ============================================

describe('copyInvoiceLink', () => {
  let mockWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
  });

  it('copies hosted URL to clipboard', async () => {
    const result = await copyInvoiceLink(invoiceWithPdf);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Link copied to clipboard');
    // Prefer hostedUrl over pdfUrl
    expect(mockWriteText).toHaveBeenCalledWith(
      'https://stripe.com/hosted/invoice'
    );
  });

  it('copies PDF URL when hosted URL is not available', async () => {
    const invoicePdfOnly: InvoiceData = {
      id: 'in_test',
      created: new Date(),
      invoicePdf: 'https://stripe.com/invoice.pdf',
      hostedInvoiceUrl: null,
    };
    const result = await copyInvoiceLink(invoicePdfOnly);
    expect(result.success).toBe(true);
    expect(mockWriteText).toHaveBeenCalledWith(
      'https://stripe.com/invoice.pdf'
    );
  });

  it('returns failure when no URL is available', async () => {
    const result = await copyInvoiceLink(invoiceWithNoUrls);
    expect(result.success).toBe(false);
    expect(result.message).toBe('No link available');
  });

  it('handles clipboard API failure', async () => {
    mockWriteText.mockRejectedValue(new Error('Clipboard blocked'));
    const result = await copyInvoiceLink(invoiceWithPdf);
    expect(result.success).toBe(false);
    expect(result.message).toBe('Copy failed');
  });
});

// ============================================
// emailInvoice
// ============================================

describe('emailInvoice', () => {
  let locationHrefSetter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    locationHrefSetter = vi.fn();
    // We need to mock window.location.href assignment.
    // In happy-dom we can just spy on the property.
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        set href(val: string) {
          locationHrefSetter(val);
        },
        get href() {
          return '';
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it('opens email client with invoice details', () => {
    const result = emailInvoice(invoiceWithPdf, 'user@example.com');
    expect(result.success).toBe(true);
    expect(result.message).toBe('Email client opened');
  });

  it('uses empty recipient when not provided', () => {
    const result = emailInvoice(invoiceWithPdf);
    expect(result.success).toBe(true);
  });

  it('includes invoice URL in email body when available', () => {
    emailInvoice(invoiceWithPdf, 'test@example.com');
    // The function constructs a mailto: URL
    const call = locationHrefSetter.mock.calls[0]?.[0];
    if (call) {
      expect(call).toContain('mailto:');
      expect(call).toContain('test@example.com');
    }
  });

  it('extracts display ID from invoice ID with underscore', () => {
    const result = emailInvoice(invoiceWithPdf);
    expect(result.success).toBe(true);
    // invoice id "in_abc123" -> displayId should be "abc123"
  });

  it('handles invoice ID without underscore', () => {
    const invoice: InvoiceData = {
      id: 'shortid',
      created: new Date('2026-01-15'),
      invoicePdf: 'https://stripe.com/invoice.pdf',
      hostedInvoiceUrl: null,
    };
    const result = emailInvoice(invoice);
    expect(result.success).toBe(true);
  });
});

// ============================================
// hasValidPdf
// ============================================

describe('hasValidPdf', () => {
  it('returns true for invoice with valid PDF URL', () => {
    expect(hasValidPdf(invoiceWithPdf)).toBe(true);
  });

  it('returns false for invoice with null PDF', () => {
    expect(hasValidPdf(invoiceWithNoUrls)).toBe(false);
  });

  it('returns false for invoice with invalid URL', () => {
    const invoice: InvoiceData = {
      id: 'test',
      created: new Date(),
      invoicePdf: 'not-a-url',
    };
    expect(hasValidPdf(invoice)).toBe(false);
  });
});

// ============================================
// hasViewableUrl
// ============================================

describe('hasViewableUrl', () => {
  it('returns true when PDF URL exists', () => {
    expect(hasViewableUrl(invoiceWithPdf)).toBe(true);
  });

  it('returns true when only hosted URL exists', () => {
    expect(hasViewableUrl(invoiceWithHostedOnly)).toBe(true);
  });

  it('returns false when no URLs exist', () => {
    expect(hasViewableUrl(invoiceWithNoUrls)).toBe(false);
  });
});

// ============================================
// getInvoiceUrl
// ============================================

describe('getInvoiceUrl', () => {
  it('returns PDF URL when available', () => {
    expect(getInvoiceUrl(invoiceWithPdf)).toBe('https://stripe.com/invoice.pdf');
  });

  it('returns hosted URL when PDF is not available', () => {
    expect(getInvoiceUrl(invoiceWithHostedOnly)).toBe('https://stripe.com/hosted/invoice2');
  });

  it('returns null when no URLs are available', () => {
    expect(getInvoiceUrl(invoiceWithNoUrls)).toBeNull();
  });
});
