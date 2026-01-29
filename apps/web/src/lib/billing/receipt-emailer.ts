/**
 * Receipt Email Service
 *
 * Provides email functionality for sending receipts to customers.
 *
 * @implements PG-031 (Receipts)
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return EMAIL_REGEX.test(email);
}

/**
 * Get confirmation dialog content for sending receipt
 */
export function getEmailConfirmation(email: string): {
  title: string;
  message: string;
} {
  return {
    title: 'Send Receipt',
    message: `Send a copy of this receipt to ${email}?`,
  };
}

/**
 * Result type for email sending
 */
export interface SendReceiptResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send receipt email to customer
 *
 * In production, this calls the tRPC mutation. For now, we provide
 * the interface with simulated success for development.
 */
export async function sendReceiptEmail(
  receiptId: string,
  email?: string
): Promise<SendReceiptResult> {
  if (!receiptId) {
    return { success: false, error: 'Receipt ID is required' };
  }

  if (email && !isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }

  try {
    // In production, this would call:
    // const result = await trpc.billing.sendReceiptEmail.mutate({ receiptId, email });

    // Simulated success for development
    // Generate a mock message ID
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return { success: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return { success: false, error: message };
  }
}

/**
 * Format receipt email subject line
 */
export function getReceiptEmailSubject(receiptNumber: string): string {
  return `Your Receipt ${receiptNumber} from IntelliFlow`;
}
