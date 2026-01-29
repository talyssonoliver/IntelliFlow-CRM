/**
 * Invoice PDF Generator Utilities
 *
 * Provides helper functions for invoice PDF handling including
 * opening, downloading, and filename generation.
 *
 * @implements PG-027 (Invoices)
 */

// ============================================
// PDF URL Validation
// ============================================

/**
 * Check if a PDF URL is valid and accessible
 */
export function isValidPdfUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ============================================
// Filename Generation
// ============================================

/**
 * Generate a filename for invoice PDF download
 * Format: invoice-{id}-{date}.pdf
 */
export function generateInvoiceFilename(invoiceId: string, date: Date): string {
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/\//g, '-');

  // Extract last part of invoice ID for cleaner filename
  const shortId = invoiceId.includes('_')
    ? invoiceId.split('_').pop() || invoiceId
    : invoiceId;

  return `invoice-${shortId}-${dateStr}.pdf`;
}

// ============================================
// PDF Actions
// ============================================

/**
 * Open invoice PDF in a new browser tab
 */
export function openInvoicePdf(url: string): void {
  if (!isValidPdfUrl(url)) {
    console.warn('Invalid PDF URL provided:', url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Download invoice PDF file
 * Uses fetch to get the file and triggers browser download
 */
export async function downloadInvoicePdf(
  url: string,
  filename: string
): Promise<void> {
  if (!isValidPdfUrl(url)) {
    throw new Error('Invalid PDF URL provided');
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up blob URL after download starts
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (error) {
    console.error('Failed to download invoice PDF:', error);
    // Fallback: open in new tab if download fails
    openInvoicePdf(url);
    throw error;
  }
}

// ============================================
// Invoice PDF Info
// ============================================

export interface InvoicePdfInfo {
  canDownload: boolean;
  canView: boolean;
  pdfUrl: string | null;
  hostedUrl: string | null;
}

/**
 * Get PDF availability info for an invoice
 */
export function getInvoicePdfInfo(
  invoicePdf?: string | null,
  hostedInvoiceUrl?: string | null
): InvoicePdfInfo {
  const pdfValid = isValidPdfUrl(invoicePdf);
  const hostedValid = isValidPdfUrl(hostedInvoiceUrl);

  return {
    canDownload: pdfValid,
    canView: pdfValid || hostedValid,
    pdfUrl: pdfValid ? invoicePdf! : null,
    hostedUrl: hostedValid ? hostedInvoiceUrl! : null,
  };
}

/**
 * Get the best URL to view an invoice
 * Prefers PDF URL over hosted URL
 */
export function getBestViewUrl(
  invoicePdf?: string | null,
  hostedInvoiceUrl?: string | null
): string | null {
  if (isValidPdfUrl(invoicePdf)) return invoicePdf;
  if (isValidPdfUrl(hostedInvoiceUrl)) return hostedInvoiceUrl;
  return null;
}
