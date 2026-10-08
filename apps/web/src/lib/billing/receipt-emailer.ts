/**
 * Receipt Email Service
 *
 * Provides email functionality for sending receipts to customers.
 *
 * @implements PG-031 (Receipts)
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  if (!email || /\s/.test(email)) return false;
  // Same rule as /^[^\s@]+@[^\s@]+\.[^\s@]+$/, without a backtracking regex:
  // exactly one @, something before it, and a dot inside the domain.
  const at = email.indexOf('@');
  if (at < 1 || email.includes('@', at + 1)) return false;
  const domain = email.slice(at + 1);
  const dot = domain.indexOf('.', 1);
  return dot > 0 && dot < domain.length - 1;
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
 * Sender callback type — matches the billing.sendReceiptEmail tRPC mutation signature.
 * Pass `trpc.billing.sendReceiptEmail.mutateAsync` from a React component to use the
 * real API; omit it (or pass undefined) to fall back to the synthetic dev-mode response.
 */
export type ReceiptEmailSender = (input: {
  receiptId: string;
  email?: string;
}) => Promise<{ success: boolean; messageId: string }>;

/**
 * Send receipt email to customer
 *
 * When `sender` is provided it is called with the tRPC-compatible input object
 * (e.g. `trpc.billing.sendReceiptEmail.mutateAsync`), which triggers real server-side
 * email delivery. When `sender` is omitted a synthetic message ID is returned — this
 * preserves backward-compatibility for unit tests that do not inject a sender.
 */
export async function sendReceiptEmail(
  receiptId: string,
  email?: string,
  sender?: ReceiptEmailSender
): Promise<SendReceiptResult> {
  if (!receiptId) {
    return { success: false, error: 'Receipt ID is required' };
  }

  if (email && !isValidEmail(email)) {
    return { success: false, error: 'Invalid email address' };
  }

  if (sender) {
    try {
      const result = await sender({ receiptId, email });
      return { success: result.success, messageId: result.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send receipt email';
      return { success: false, error: message };
    }
  }

  // Fallback: no sender provided (development / unit test context).
  // Returns a synthetic message ID without making a network call.
  const messageId = `msg_${Date.now()}_${crypto.randomUUID().replaceAll('-', '')}`;
  return { success: true, messageId };
}

/**
 * Format receipt email subject line
 */
export function getReceiptEmailSubject(receiptNumber: string): string {
  return `Your Receipt ${receiptNumber} from Aurora`;
}
