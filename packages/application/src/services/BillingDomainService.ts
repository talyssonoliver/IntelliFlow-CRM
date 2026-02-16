import {
  Result,
  DomainError,
  Invoice,
  InvoiceId,
  Receipt,
  Money,
  PaymentMethod,
  RefundReason,
  InvoiceRepository,
  ReceiptRepository,
  CreateInvoiceProps,
} from '@intelliflow/domain';
import { EventBusPort } from '../ports/external';
import { PersistenceError, NotFoundError } from '../errors';

export class BillingDomainService {
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly receiptRepository: ReceiptRepository,
    private readonly eventBus: EventBusPort
  ) {}

  async createInvoice(props: CreateInvoiceProps): Promise<Result<Invoice, DomainError>> {
    const invoiceResult = Invoice.create(props);
    if (invoiceResult.isFailure) {
      return Result.fail(invoiceResult.error);
    }

    const invoice = invoiceResult.value;

    try {
      await this.invoiceRepository.save(invoice);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save invoice'));
    }

    await this.publishEvents(invoice);
    return Result.ok(invoice);
  }

  async issueInvoice(invoiceId: string): Promise<Result<Invoice, DomainError>> {
    const idResult = InvoiceId.create(invoiceId);
    if (idResult.isFailure) {
      return Result.fail(idResult.error);
    }

    const invoice = await this.invoiceRepository.findById(idResult.value);
    if (!invoice) {
      return Result.fail(new NotFoundError(`Invoice not found: ${invoiceId}`));
    }

    const issueResult = invoice.issue();
    if (issueResult.isFailure) {
      return Result.fail(issueResult.error);
    }

    try {
      await this.invoiceRepository.save(invoice);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save invoice'));
    }

    await this.publishEvents(invoice);
    return Result.ok(invoice);
  }

  async recordPayment(
    invoiceId: string,
    amount: Money,
    paymentMethod: PaymentMethod,
    transactionId?: string
  ): Promise<Result<{ invoice: Invoice; receipt: Receipt }, DomainError>> {
    const idResult = InvoiceId.create(invoiceId);
    if (idResult.isFailure) {
      return Result.fail(idResult.error);
    }

    const invoice = await this.invoiceRepository.findById(idResult.value);
    if (!invoice) {
      return Result.fail(new NotFoundError(`Invoice not found: ${invoiceId}`));
    }

    const paymentResult = invoice.recordPayment(amount, transactionId);
    if (paymentResult.isFailure) {
      return Result.fail(paymentResult.error);
    }

    // Create receipt
    const receiptResult = Receipt.create({
      invoiceId: invoice.id.value,
      customerId: invoice.customerId,
      tenantId: invoice.tenantId,
      amountCents: amount.cents,
      currency: amount.currency,
      paymentMethod,
      transactionId,
    });
    if (receiptResult.isFailure) {
      return Result.fail(receiptResult.error);
    }

    const receipt = receiptResult.value;

    try {
      await this.invoiceRepository.save(invoice);
      await this.receiptRepository.save(receipt);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save invoice/receipt'));
    }

    await this.publishEvents(invoice);
    await this.publishEvents(receipt);

    return Result.ok({ invoice, receipt });
  }

  async processRefund(
    invoiceId: string,
    amount: Money,
    reason: RefundReason
  ): Promise<Result<Invoice, DomainError>> {
    const idResult = InvoiceId.create(invoiceId);
    if (idResult.isFailure) {
      return Result.fail(idResult.error);
    }

    const invoice = await this.invoiceRepository.findById(idResult.value);
    if (!invoice) {
      return Result.fail(new NotFoundError(`Invoice not found: ${invoiceId}`));
    }

    const refundResult = invoice.processRefund(amount, reason);
    if (refundResult.isFailure) {
      return Result.fail(refundResult.error);
    }

    try {
      await this.invoiceRepository.save(invoice);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save invoice'));
    }

    await this.publishEvents(invoice);
    return Result.ok(invoice);
  }

  async voidInvoice(invoiceId: string, reason?: string): Promise<Result<Invoice, DomainError>> {
    const idResult = InvoiceId.create(invoiceId);
    if (idResult.isFailure) {
      return Result.fail(idResult.error);
    }

    const invoice = await this.invoiceRepository.findById(idResult.value);
    if (!invoice) {
      return Result.fail(new NotFoundError(`Invoice not found: ${invoiceId}`));
    }

    const voidResult = invoice.void(reason);
    if (voidResult.isFailure) {
      return Result.fail(voidResult.error);
    }

    try {
      await this.invoiceRepository.save(invoice);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save invoice'));
    }

    await this.publishEvents(invoice);
    return Result.ok(invoice);
  }

  async markUncollectible(invoiceId: string): Promise<Result<Invoice, DomainError>> {
    const idResult = InvoiceId.create(invoiceId);
    if (idResult.isFailure) {
      return Result.fail(idResult.error);
    }

    const invoice = await this.invoiceRepository.findById(idResult.value);
    if (!invoice) {
      return Result.fail(new NotFoundError(`Invoice not found: ${invoiceId}`));
    }

    const uncResult = invoice.markUncollectible();
    if (uncResult.isFailure) {
      return Result.fail(uncResult.error);
    }

    try {
      await this.invoiceRepository.save(invoice);
    } catch (error) {
      return Result.fail(new PersistenceError('Failed to save invoice'));
    }

    await this.publishEvents(invoice);
    return Result.ok(invoice);
  }

  async getInvoice(invoiceId: string, tenantId: string): Promise<Result<Invoice, DomainError>> {
    const idResult = InvoiceId.create(invoiceId);
    if (idResult.isFailure) {
      return Result.fail(idResult.error);
    }

    const invoice = await this.invoiceRepository.findById(idResult.value);
    if (!invoice) {
      return Result.fail(new NotFoundError(`Invoice not found: ${invoiceId}`));
    }

    return Result.ok(invoice);
  }

  async getInvoicesByCustomer(
    customerId: string,
    tenantId: string
  ): Promise<Result<Invoice[], DomainError>> {
    const invoices = await this.invoiceRepository.findByCustomerId(customerId, tenantId);
    return Result.ok(invoices);
  }

  async getOverdueInvoices(tenantId: string): Promise<Result<Invoice[], DomainError>> {
    const invoices = await this.invoiceRepository.findOverdueInvoices(tenantId);
    return Result.ok(invoices);
  }

  async getReceiptsForInvoice(
    invoiceId: string,
    tenantId: string
  ): Promise<Result<Receipt[], DomainError>> {
    const receipts = await this.receiptRepository.findByInvoiceId(invoiceId, tenantId);
    return Result.ok(receipts);
  }

  private async publishEvents(aggregate: {
    getDomainEvents(): ReadonlyArray<any>;
    clearDomainEvents(): void;
  }): Promise<void> {
    const events = aggregate.getDomainEvents();
    if (events.length > 0) {
      try {
        await this.eventBus.publishAll(events as any);
      } catch (error) {
        console.error('Failed to publish billing domain events:', error);
      }
    }
    aggregate.clearDomainEvents();
  }
}
