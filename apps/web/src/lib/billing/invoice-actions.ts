/**
 * Invoice Actions Utility
 *
 * Provides actions for invoice management including:
 * - Download PDF
 * - Email invoice
 * - Print invoice
 * - Copy link
 *
 * @implements PG-028 (Invoice Detail)
 */

import {
  downloadInvoicePdf,
  generateInvoiceFilename,
  getInvoicePdfInfo,
  openInvoicePdf,
  isValidPdfUrl,
} from './pdf-generator';

// ============================================
// Types
// ============================================

export interface InvoiceActionResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface InvoiceData {
  id: string;
  created: Date | string;
  invoicePdf?: string | null;
  hostedInvoiceUrl?: string | null;
}

// ============================================
// Download Action
// ============================================

/**
 * Download invoice as PDF
 * Falls back to opening in new tab if download fails
 */
export async function downloadInvoice(invoice: InvoiceData): Promise<InvoiceActionResult> {
  const pdfInfo = getInvoicePdfInfo(invoice.invoicePdf, invoice.hostedInvoiceUrl);

  if (!pdfInfo.canDownload) {
    return {
      success: false,
      message: 'PDF not available',
      error: 'This invoice does not have a downloadable PDF.',
    };
  }

  try {
    const filename = generateInvoiceFilename(
      invoice.id,
      new Date(invoice.created)
    );
    await downloadInvoicePdf(pdfInfo.pdfUrl!, filename);
    return {
      success: true,
      message: 'Invoice downloaded successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Download failed',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ============================================
// View Action
// ============================================

/**
 * Open invoice in a new browser tab
 */
export function viewInvoice(invoice: InvoiceData): InvoiceActionResult {
  const pdfInfo = getInvoicePdfInfo(invoice.invoicePdf, invoice.hostedInvoiceUrl);

  if (!pdfInfo.canView) {
    return {
      success: false,
      message: 'Invoice not viewable',
      error: 'This invoice does not have a viewable URL.',
    };
  }

  const url = pdfInfo.pdfUrl || pdfInfo.hostedUrl;
  if (url) {
    openInvoicePdf(url);
    return {
      success: true,
      message: 'Invoice opened in new tab',
    };
  }

  return {
    success: false,
    message: 'No URL available',
    error: 'Could not determine invoice URL.',
  };
}

// ============================================
// Print Action
// ============================================

/**
 * Print invoice (opens print dialog)
 * Uses iframe technique to print PDF without navigation
 */
export function printInvoice(invoice: InvoiceData): InvoiceActionResult {
  const pdfInfo = getInvoicePdfInfo(invoice.invoicePdf, invoice.hostedInvoiceUrl);

  if (!pdfInfo.canView) {
    return {
      success: false,
      message: 'Invoice not printable',
      error: 'This invoice does not have a printable URL.',
    };
  }

  const url = pdfInfo.pdfUrl || pdfInfo.hostedUrl;
  if (!url) {
    return {
      success: false,
      message: 'No URL available',
      error: 'Could not determine invoice URL.',
    };
  }

  try {
    // Create hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.src = url;

    iframe.onload = () => {
      try {
        iframe.contentWindow?.print();
      } catch {
        // If iframe print fails (CORS), open in new window
        const printWindow = window.open(url, '_blank');
        printWindow?.print();
      }
      // Clean up iframe after a delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    };

    document.body.appendChild(iframe);

    return {
      success: true,
      message: 'Print dialog opened',
    };
  } catch (error) {
    return {
      success: false,
      message: 'Print failed',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ============================================
// Copy Link Action
// ============================================

/**
 * Copy invoice URL to clipboard
 */
export async function copyInvoiceLink(invoice: InvoiceData): Promise<InvoiceActionResult> {
  const pdfInfo = getInvoicePdfInfo(invoice.invoicePdf, invoice.hostedInvoiceUrl);
  const url = pdfInfo.hostedUrl || pdfInfo.pdfUrl;

  if (!url) {
    return {
      success: false,
      message: 'No link available',
      error: 'This invoice does not have a shareable link.',
    };
  }

  try {
    await navigator.clipboard.writeText(url);
    return {
      success: true,
      message: 'Link copied to clipboard',
    };
  } catch {
    return {
      success: false,
      message: 'Copy failed',
      error: 'Could not copy link to clipboard. Please try manually.',
    };
  }
}

// ============================================
// Email Action (Placeholder)
// ============================================

/**
 * Email invoice to recipient
 * Opens default email client with invoice link
 */
export function emailInvoice(
  invoice: InvoiceData,
  recipientEmail?: string
): InvoiceActionResult {
  const pdfInfo = getInvoicePdfInfo(invoice.invoicePdf, invoice.hostedInvoiceUrl);
  const url = pdfInfo.hostedUrl || pdfInfo.pdfUrl;

  // Format invoice ID for display
  const displayId = invoice.id.includes('_')
    ? invoice.id.split('_').pop()
    : invoice.id.slice(0, 12);

  const subject = encodeURIComponent(`Invoice ${displayId}`);
  const body = encodeURIComponent(
    `Please find your invoice below:\n\n` +
      (url ? `View Invoice: ${url}\n\n` : '') +
      `Invoice ID: ${invoice.id}\n` +
      `Date: ${new Date(invoice.created).toLocaleDateString('en-GB')}\n\n` +
      `Thank you for your business.`
  );

  const mailto = `mailto:${recipientEmail || ''}?subject=${subject}&body=${body}`;

  try {
    window.location.href = mailto;
    return {
      success: true,
      message: 'Email client opened',
    };
  } catch {
    return {
      success: false,
      message: 'Email failed',
      error: 'Could not open email client.',
    };
  }
}

// ============================================
// Invoice Validation
// ============================================

/**
 * Check if invoice has valid PDF URL
 */
export function hasValidPdf(invoice: InvoiceData): boolean {
  return isValidPdfUrl(invoice.invoicePdf);
}

/**
 * Check if invoice has any viewable URL
 */
export function hasViewableUrl(invoice: InvoiceData): boolean {
  return isValidPdfUrl(invoice.invoicePdf) || isValidPdfUrl(invoice.hostedInvoiceUrl);
}

/**
 * Get the best available URL for an invoice
 */
export function getInvoiceUrl(invoice: InvoiceData): string | null {
  const pdfInfo = getInvoicePdfInfo(invoice.invoicePdf, invoice.hostedInvoiceUrl);
  return pdfInfo.pdfUrl || pdfInfo.hostedUrl;
}
