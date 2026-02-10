import { Receipt } from './Receipt';
import { ReceiptId } from './ReceiptId';

/**
 * Receipt Repository Interface
 * Defines the contract for receipt persistence
 * Implementation lives in adapters layer
 */
export interface ReceiptRepository {
  /** Save a receipt */
  save(receipt: Receipt): Promise<void>;

  /** Find a receipt by ID */
  findById(id: ReceiptId): Promise<Receipt | null>;

  /** Find all receipts for an invoice */
  findByInvoiceId(invoiceId: string, tenantId: string): Promise<Receipt[]>;

  /** Find all receipts for a customer */
  findByCustomerId(customerId: string, tenantId: string): Promise<Receipt[]>;
}
