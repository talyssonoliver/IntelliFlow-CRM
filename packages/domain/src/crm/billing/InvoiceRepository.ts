import { Invoice } from './Invoice';
import { InvoiceId } from './InvoiceId';

/**
 * Invoice Repository Interface
 * Defines the contract for invoice persistence
 * Implementation lives in adapters layer
 */
export interface InvoiceRepository {
  /** Save an invoice (create or update) */
  save(invoice: Invoice): Promise<void>;

  /** Find an invoice by ID */
  findById(id: InvoiceId): Promise<Invoice | null>;

  /** Find an invoice by invoice number */
  findByInvoiceNumber(invoiceNumber: string, tenantId: string): Promise<Invoice | null>;

  /** Find all invoices for a customer */
  findByCustomerId(customerId: string, tenantId: string): Promise<Invoice[]>;

  /** Find overdue invoices for a tenant */
  findOverdueInvoices(tenantId: string): Promise<Invoice[]>;

  /** Delete an invoice */
  delete(id: InvoiceId): Promise<void>;
}
