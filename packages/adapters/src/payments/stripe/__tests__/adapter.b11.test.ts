/**
 * StripeAdapter Tests - b11
 *
 * The adapter is a thin facade that delegates all calls to handler modules.
 * Each method simply forwards (config, ...args) to the corresponding handler.
 * These tests verify every method delegates correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockHandlers = vi.hoisted(() => ({
  createCustomer: vi.fn(),
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  attachPaymentMethod: vi.fn(),
  detachPaymentMethod: vi.fn(),
  listPaymentMethods: vi.fn(),
  createPaymentIntent: vi.fn(),
  confirmPaymentIntent: vi.fn(),
  capturePaymentIntent: vi.fn(),
  cancelPaymentIntent: vi.fn(),
  getPaymentIntent: vi.fn(),
  createRefund: vi.fn(),
  getRefund: vi.fn(),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  getSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  getInvoice: vi.fn(),
  listInvoices: vi.fn(),
  payInvoice: vi.fn(),
  constructWebhookEvent: vi.fn(),
  checkConnection: vi.fn(),
}));

vi.mock('../handlers', () => mockHandlers);

import { StripeAdapter } from '../adapter';
import type { StripeConfig } from '../types';

describe('StripeAdapter', () => {
  let adapter: StripeAdapter;
  const config: StripeConfig = { secretKey: 'sk_test_123', webhookSecret: 'whsec_123' };

  beforeEach(() => {
    adapter = new StripeAdapter(config);
    // Reset all mocks
    Object.values(mockHandlers).forEach((fn) => fn.mockReset());
  });

  it('should delegate createCustomer to handler', () => {
    const params = { email: 'test@example.com', name: 'Test' };
    mockHandlers.createCustomer.mockReturnValue('result');
    const result = adapter.createCustomer(params);
    expect(mockHandlers.createCustomer).toHaveBeenCalledWith(config, params);
    expect(result).toBe('result');
  });

  it('should delegate getCustomer to handler', () => {
    mockHandlers.getCustomer.mockReturnValue('result');
    const result = adapter.getCustomer('cus_123');
    expect(mockHandlers.getCustomer).toHaveBeenCalledWith(config, 'cus_123');
    expect(result).toBe('result');
  });

  it('should delegate updateCustomer to handler', () => {
    const params = { email: 'new@example.com' };
    mockHandlers.updateCustomer.mockReturnValue('result');
    const result = adapter.updateCustomer('cus_123', params);
    expect(mockHandlers.updateCustomer).toHaveBeenCalledWith(config, 'cus_123', params);
    expect(result).toBe('result');
  });

  it('should delegate deleteCustomer to handler', () => {
    mockHandlers.deleteCustomer.mockReturnValue('result');
    const result = adapter.deleteCustomer('cus_123');
    expect(mockHandlers.deleteCustomer).toHaveBeenCalledWith(config, 'cus_123');
    expect(result).toBe('result');
  });

  it('should delegate attachPaymentMethod to handler', () => {
    mockHandlers.attachPaymentMethod.mockReturnValue('result');
    const result = adapter.attachPaymentMethod('pm_123', 'cus_123');
    expect(mockHandlers.attachPaymentMethod).toHaveBeenCalledWith(config, 'pm_123', 'cus_123');
    expect(result).toBe('result');
  });

  it('should delegate detachPaymentMethod to handler', () => {
    mockHandlers.detachPaymentMethod.mockReturnValue('result');
    const result = adapter.detachPaymentMethod('pm_123');
    expect(mockHandlers.detachPaymentMethod).toHaveBeenCalledWith(config, 'pm_123');
    expect(result).toBe('result');
  });

  it('should delegate listPaymentMethods to handler', () => {
    mockHandlers.listPaymentMethods.mockReturnValue('result');
    const result = adapter.listPaymentMethods('cus_123');
    expect(mockHandlers.listPaymentMethods).toHaveBeenCalledWith(config, 'cus_123');
    expect(result).toBe('result');
  });

  it('should delegate createPaymentIntent to handler', () => {
    const params = { amount: 1000, currency: 'usd', customerId: 'cus_123' } as any;
    mockHandlers.createPaymentIntent.mockReturnValue('result');
    const result = adapter.createPaymentIntent(params);
    expect(mockHandlers.createPaymentIntent).toHaveBeenCalledWith(config, params);
    expect(result).toBe('result');
  });

  it('should delegate confirmPaymentIntent to handler', () => {
    mockHandlers.confirmPaymentIntent.mockReturnValue('result');
    const result = adapter.confirmPaymentIntent('pi_123', 'pm_456');
    expect(mockHandlers.confirmPaymentIntent).toHaveBeenCalledWith(config, 'pi_123', 'pm_456');
    expect(result).toBe('result');
  });

  it('should delegate capturePaymentIntent to handler', () => {
    mockHandlers.capturePaymentIntent.mockReturnValue('result');
    const result = adapter.capturePaymentIntent('pi_123', 500);
    expect(mockHandlers.capturePaymentIntent).toHaveBeenCalledWith(config, 'pi_123', 500);
    expect(result).toBe('result');
  });

  it('should delegate cancelPaymentIntent to handler', () => {
    mockHandlers.cancelPaymentIntent.mockReturnValue('result');
    const result = adapter.cancelPaymentIntent('pi_123');
    expect(mockHandlers.cancelPaymentIntent).toHaveBeenCalledWith(config, 'pi_123');
    expect(result).toBe('result');
  });

  it('should delegate getPaymentIntent to handler', () => {
    mockHandlers.getPaymentIntent.mockReturnValue('result');
    const result = adapter.getPaymentIntent('pi_123');
    expect(mockHandlers.getPaymentIntent).toHaveBeenCalledWith(config, 'pi_123');
    expect(result).toBe('result');
  });

  it('should delegate createRefund to handler', () => {
    mockHandlers.createRefund.mockReturnValue('result');
    const result = adapter.createRefund('pi_123', 500, 'duplicate');
    expect(mockHandlers.createRefund).toHaveBeenCalledWith(config, 'pi_123', 500, 'duplicate');
    expect(result).toBe('result');
  });

  it('should delegate getRefund to handler', () => {
    mockHandlers.getRefund.mockReturnValue('result');
    const result = adapter.getRefund('re_123');
    expect(mockHandlers.getRefund).toHaveBeenCalledWith(config, 're_123');
    expect(result).toBe('result');
  });

  it('should delegate createSubscription to handler', () => {
    const params = { customerId: 'cus_123', priceId: 'price_123' } as any;
    mockHandlers.createSubscription.mockReturnValue('result');
    const result = adapter.createSubscription(params);
    expect(mockHandlers.createSubscription).toHaveBeenCalledWith(config, params);
    expect(result).toBe('result');
  });

  it('should delegate updateSubscription to handler', () => {
    const params = { priceId: 'price_new' } as any;
    mockHandlers.updateSubscription.mockReturnValue('result');
    const result = adapter.updateSubscription('sub_123', params);
    expect(mockHandlers.updateSubscription).toHaveBeenCalledWith(config, 'sub_123', params);
    expect(result).toBe('result');
  });

  it('should delegate cancelSubscription to handler', () => {
    mockHandlers.cancelSubscription.mockReturnValue('result');
    const result = adapter.cancelSubscription('sub_123', true);
    expect(mockHandlers.cancelSubscription).toHaveBeenCalledWith(config, 'sub_123', true);
    expect(result).toBe('result');
  });

  it('should delegate getSubscription to handler', () => {
    mockHandlers.getSubscription.mockReturnValue('result');
    const result = adapter.getSubscription('sub_123');
    expect(mockHandlers.getSubscription).toHaveBeenCalledWith(config, 'sub_123');
    expect(result).toBe('result');
  });

  it('should delegate listSubscriptions to handler', () => {
    mockHandlers.listSubscriptions.mockReturnValue('result');
    const result = adapter.listSubscriptions('cus_123');
    expect(mockHandlers.listSubscriptions).toHaveBeenCalledWith(config, 'cus_123');
    expect(result).toBe('result');
  });

  it('should delegate getInvoice to handler', () => {
    mockHandlers.getInvoice.mockReturnValue('result');
    const result = adapter.getInvoice('in_123');
    expect(mockHandlers.getInvoice).toHaveBeenCalledWith(config, 'in_123');
    expect(result).toBe('result');
  });

  it('should delegate listInvoices to handler', () => {
    mockHandlers.listInvoices.mockReturnValue('result');
    const result = adapter.listInvoices('cus_123');
    expect(mockHandlers.listInvoices).toHaveBeenCalledWith(config, 'cus_123');
    expect(result).toBe('result');
  });

  it('should delegate payInvoice to handler', () => {
    mockHandlers.payInvoice.mockReturnValue('result');
    const result = adapter.payInvoice('in_123');
    expect(mockHandlers.payInvoice).toHaveBeenCalledWith(config, 'in_123');
    expect(result).toBe('result');
  });

  it('should delegate constructWebhookEvent to handler', () => {
    mockHandlers.constructWebhookEvent.mockReturnValue('result');
    const result = adapter.constructWebhookEvent('payload', 'sig');
    expect(mockHandlers.constructWebhookEvent).toHaveBeenCalledWith(config, 'payload', 'sig');
    expect(result).toBe('result');
  });

  it('should delegate checkConnection to handler', () => {
    mockHandlers.checkConnection.mockReturnValue('result');
    const result = adapter.checkConnection();
    expect(mockHandlers.checkConnection).toHaveBeenCalledWith(config);
    expect(result).toBe('result');
  });
});
