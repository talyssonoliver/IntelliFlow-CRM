/**
 * PayPal Data Mappers
 */

import type {
  PayPalOrder,
  PayPalPurchaseUnit,
  PayPalItem,
  PayPalPayer,
  PayPalAddress,
  PayPalCapture,
  PayPalAuthorization,
  PayPalRefund,
  PayPalSubscription,
} from './types';

export function mapToOrder(data: Record<string, unknown>): PayPalOrder {
  const purchaseUnits = (data.purchase_units as Array<Record<string, unknown>>) ?? [];
  const payer = data.payer as Record<string, unknown> | undefined;
  const links = (data.links as Array<Record<string, unknown>>) ?? [];

  return {
    id: String(data.id ?? ''),
    status: String(data.status ?? 'CREATED') as PayPalOrder['status'],
    intent: String(data.intent ?? 'CAPTURE') as PayPalOrder['intent'],
    purchaseUnits: purchaseUnits.map((unit) => mapToPurchaseUnit(unit)),
    payer: payer ? mapToPayer(payer) : undefined,
    createTime: new Date(String(data.create_time ?? new Date().toISOString())),
    updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
    links: links.map((link) => ({
      href: String(link.href ?? ''),
      rel: String(link.rel ?? ''),
      method: link.method ? String(link.method) : undefined,
    })),
  };
}

export function mapToPurchaseUnit(data: Record<string, unknown>): PayPalPurchaseUnit {
  const amount = (data.amount as Record<string, unknown>) ?? {};
  const breakdown = amount.breakdown as Record<string, unknown> | undefined;
  const items = (data.items as Array<Record<string, unknown>>) ?? [];
  const shipping = data.shipping as Record<string, unknown> | undefined;
  const payments = data.payments as Record<string, unknown> | undefined;

  return {
    referenceId: String(data.reference_id ?? ''),
    description: data.description ? String(data.description) : undefined,
    customId: data.custom_id ? String(data.custom_id) : undefined,
    invoiceId: data.invoice_id ? String(data.invoice_id) : undefined,
    amount: {
      currencyCode: String(amount.currency_code ?? 'USD'),
      value: String(amount.value ?? '0.00'),
      breakdown: breakdown ? mapBreakdown(breakdown) : undefined,
    },
    items: items.map((item) => mapToItem(item)),
    shipping: shipping ? mapToShipping(shipping) : undefined,
    payments: payments
      ? {
          captures: (payments.captures as Array<Record<string, unknown>>)?.map((c) =>
            mapToCapture(c)
          ),
          authorizations: (payments.authorizations as Array<Record<string, unknown>>)?.map((a) =>
            mapToAuthorization(a)
          ),
          refunds: (payments.refunds as Array<Record<string, unknown>>)?.map((r) => mapToRefund(r)),
        }
      : undefined,
  };
}

function mapBreakdown(breakdown: Record<string, unknown>) {
  return {
    itemTotal: breakdown.item_total
      ? {
          currencyCode: String(
            (breakdown.item_total as Record<string, unknown>).currency_code ?? 'USD'
          ),
          value: String((breakdown.item_total as Record<string, unknown>).value ?? '0.00'),
        }
      : undefined,
    shipping: breakdown.shipping
      ? {
          currencyCode: String(
            (breakdown.shipping as Record<string, unknown>).currency_code ?? 'USD'
          ),
          value: String((breakdown.shipping as Record<string, unknown>).value ?? '0.00'),
        }
      : undefined,
    taxTotal: breakdown.tax_total
      ? {
          currencyCode: String(
            (breakdown.tax_total as Record<string, unknown>).currency_code ?? 'USD'
          ),
          value: String((breakdown.tax_total as Record<string, unknown>).value ?? '0.00'),
        }
      : undefined,
  };
}

export function mapToItem(data: Record<string, unknown>): PayPalItem {
  const unitAmount = (data.unit_amount as Record<string, unknown>) ?? {};

  return {
    name: String(data.name ?? ''),
    unitAmount: {
      currencyCode: String(unitAmount.currency_code ?? 'USD'),
      value: String(unitAmount.value ?? '0.00'),
    },
    quantity: String(data.quantity ?? '1'),
    description: data.description ? String(data.description) : undefined,
    sku: data.sku ? String(data.sku) : undefined,
    category: data.category ? (String(data.category) as PayPalItem['category']) : undefined,
  };
}

export function mapToPayer(data: Record<string, unknown>): PayPalPayer {
  const name = data.name as Record<string, unknown> | undefined;
  const phone = data.phone as Record<string, unknown> | undefined;
  const address = data.address as Record<string, unknown> | undefined;

  return {
    payerId: data.payer_id ? String(data.payer_id) : undefined,
    name: name
      ? {
          givenName: name.given_name ? String(name.given_name) : undefined,
          surname: name.surname ? String(name.surname) : undefined,
        }
      : undefined,
    emailAddress: data.email_address ? String(data.email_address) : undefined,
    phone: phone
      ? {
          phoneType: phone.phone_type ? String(phone.phone_type) : undefined,
          phoneNumber: phone.phone_number
            ? {
                nationalNumber: (phone.phone_number as Record<string, unknown>).national_number
                  ? String((phone.phone_number as Record<string, unknown>).national_number)
                  : undefined,
              }
            : undefined,
        }
      : undefined,
    birthDate: data.birth_date ? String(data.birth_date) : undefined,
    address: address ? mapToAddress(address) : undefined,
  };
}

export function mapToAddress(data: Record<string, unknown>): PayPalAddress {
  return {
    addressLine1: data.address_line_1 ? String(data.address_line_1) : undefined,
    addressLine2: data.address_line_2 ? String(data.address_line_2) : undefined,
    adminArea1: data.admin_area_1 ? String(data.admin_area_1) : undefined,
    adminArea2: data.admin_area_2 ? String(data.admin_area_2) : undefined,
    postalCode: data.postal_code ? String(data.postal_code) : undefined,
    countryCode: data.country_code ? String(data.country_code) : undefined,
  };
}

function mapToShipping(
  data: Record<string, unknown>
): { name?: { fullName?: string }; address?: PayPalAddress } {
  const name = data.name as Record<string, unknown> | undefined;
  const address = data.address as Record<string, unknown> | undefined;

  return {
    name: name ? { fullName: name.full_name ? String(name.full_name) : undefined } : undefined,
    address: address ? mapToAddress(address) : undefined,
  };
}

export function mapToCapture(data: Record<string, unknown>): PayPalCapture {
  const amount = (data.amount as Record<string, unknown>) ?? {};
  const sellerProtection = data.seller_protection as Record<string, unknown> | undefined;

  return {
    id: String(data.id ?? ''),
    status: String(data.status ?? 'PENDING') as PayPalCapture['status'],
    amount: {
      currencyCode: String(amount.currency_code ?? 'USD'),
      value: String(amount.value ?? '0.00'),
    },
    finalCapture: Boolean(data.final_capture),
    sellerProtection: sellerProtection
      ? {
          status: String(sellerProtection.status ?? ''),
          disputeCategories: sellerProtection.dispute_categories as string[] | undefined,
        }
      : undefined,
    createTime: new Date(String(data.create_time ?? new Date().toISOString())),
    updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
  };
}

export function mapToAuthorization(data: Record<string, unknown>): PayPalAuthorization {
  const amount = (data.amount as Record<string, unknown>) ?? {};

  return {
    id: String(data.id ?? ''),
    status: String(data.status ?? 'PENDING') as PayPalAuthorization['status'],
    amount: {
      currencyCode: String(amount.currency_code ?? 'USD'),
      value: String(amount.value ?? '0.00'),
    },
    expirationTime: data.expiration_time ? new Date(String(data.expiration_time)) : undefined,
    createTime: new Date(String(data.create_time ?? new Date().toISOString())),
    updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
  };
}

export function mapToRefund(data: Record<string, unknown>): PayPalRefund {
  const amount = (data.amount as Record<string, unknown>) ?? {};

  return {
    id: String(data.id ?? ''),
    status: String(data.status ?? 'PENDING') as PayPalRefund['status'],
    amount: {
      currencyCode: String(amount.currency_code ?? 'USD'),
      value: String(amount.value ?? '0.00'),
    },
    invoiceId: data.invoice_id ? String(data.invoice_id) : undefined,
    noteToPayer: data.note_to_payer ? String(data.note_to_payer) : undefined,
    createTime: new Date(String(data.create_time ?? new Date().toISOString())),
    updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
  };
}

export function mapToSubscription(data: Record<string, unknown>): PayPalSubscription {
  const subscriber = data.subscriber as Record<string, unknown> | undefined;
  const billingInfo = data.billing_info as Record<string, unknown> | undefined;
  const links = (data.links as Array<Record<string, unknown>>) ?? [];

  return {
    id: String(data.id ?? ''),
    status: String(data.status ?? 'APPROVAL_PENDING') as PayPalSubscription['status'],
    planId: String(data.plan_id ?? ''),
    quantity: data.quantity ? String(data.quantity) : undefined,
    subscriber: subscriber ? mapToPayer(subscriber) : undefined,
    billingInfo: billingInfo ? mapBillingInfo(billingInfo) : undefined,
    createTime: new Date(String(data.create_time ?? new Date().toISOString())),
    updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
    links: links.map((link) => ({
      href: String(link.href ?? ''),
      rel: String(link.rel ?? ''),
      method: link.method ? String(link.method) : undefined,
    })),
  };
}

function mapBillingInfo(billingInfo: Record<string, unknown>) {
  return {
    outstandingBalance: billingInfo.outstanding_balance
      ? {
          currencyCode: String(
            (billingInfo.outstanding_balance as Record<string, unknown>).currency_code ?? 'USD'
          ),
          value: String(
            (billingInfo.outstanding_balance as Record<string, unknown>).value ?? '0.00'
          ),
        }
      : undefined,
    lastPayment: billingInfo.last_payment
      ? {
          amount: {
            currencyCode: String(
              (
                (billingInfo.last_payment as Record<string, unknown>).amount as Record<
                  string,
                  unknown
                >
              )?.currency_code ?? 'USD'
            ),
            value: String(
              (
                (billingInfo.last_payment as Record<string, unknown>).amount as Record<
                  string,
                  unknown
                >
              )?.value ?? '0.00'
            ),
          },
          time: new Date(
            String(
              (billingInfo.last_payment as Record<string, unknown>).time ?? new Date().toISOString()
            )
          ),
        }
      : undefined,
    nextBillingTime: billingInfo.next_billing_time
      ? new Date(String(billingInfo.next_billing_time))
      : undefined,
    failedPaymentsCount: billingInfo.failed_payments_count
      ? Number(billingInfo.failed_payments_count)
      : undefined,
  };
}
