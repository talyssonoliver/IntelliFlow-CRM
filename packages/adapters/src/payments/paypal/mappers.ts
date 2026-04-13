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
    id: (data.id as string | null | undefined) ?? '',
    status: ((data.status as string | null | undefined) ?? 'CREATED') as PayPalOrder['status'],
    intent: ((data.intent as string | null | undefined) ?? 'CAPTURE') as PayPalOrder['intent'],
    purchaseUnits: purchaseUnits.map((unit) => mapToPurchaseUnit(unit)),
    payer: payer ? mapToPayer(payer) : undefined,
    createTime: new Date(
      (data.create_time as string | null | undefined) ?? new Date().toISOString()
    ),
    updateTime: new Date(
      (data.update_time as string | null | undefined) ?? new Date().toISOString()
    ),
    links: links.map((link) => ({
      href: (link.href as string | null | undefined) ?? '',
      rel: (link.rel as string | null | undefined) ?? '',
      method: link.method ? (link.method as string) : undefined,
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
    referenceId: (data.reference_id as string | null | undefined) ?? '',
    description: data.description ? (data.description as string) : undefined,
    customId: data.custom_id ? (data.custom_id as string) : undefined,
    invoiceId: data.invoice_id ? (data.invoice_id as string) : undefined,
    amount: {
      currencyCode: (amount.currency_code as string | null | undefined) ?? 'GBP',
      value: (amount.value as string | null | undefined) ?? '0.00',
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
          currencyCode:
            ((breakdown.item_total as Record<string, unknown>).currency_code as
              | string
              | null
              | undefined) ?? 'GBP',
          value:
            ((breakdown.item_total as Record<string, unknown>).value as
              | string
              | null
              | undefined) ?? '0.00',
        }
      : undefined,
    shipping: breakdown.shipping
      ? {
          currencyCode:
            ((breakdown.shipping as Record<string, unknown>).currency_code as
              | string
              | null
              | undefined) ?? 'GBP',
          value:
            ((breakdown.shipping as Record<string, unknown>).value as string | null | undefined) ??
            '0.00',
        }
      : undefined,
    taxTotal: breakdown.tax_total
      ? {
          currencyCode:
            ((breakdown.tax_total as Record<string, unknown>).currency_code as
              | string
              | null
              | undefined) ?? 'GBP',
          value:
            ((breakdown.tax_total as Record<string, unknown>).value as string | null | undefined) ??
            '0.00',
        }
      : undefined,
  };
}

export function mapToItem(data: Record<string, unknown>): PayPalItem {
  const unitAmount = (data.unit_amount as Record<string, unknown>) ?? {};

  return {
    name: (data.name as string | null | undefined) ?? '',
    unitAmount: {
      currencyCode: (unitAmount.currency_code as string | null | undefined) ?? 'GBP',
      value: (unitAmount.value as string | null | undefined) ?? '0.00',
    },
    quantity: (data.quantity as string | null | undefined) ?? '1',
    description: data.description ? (data.description as string) : undefined,
    sku: data.sku ? (data.sku as string) : undefined,
    category: data.category ? (data.category as string as PayPalItem['category']) : undefined,
  };
}

function mapPayerPhone(phone: Record<string, unknown>): {
  phoneType?: string;
  phoneNumber?: { nationalNumber?: string };
} {
  const phoneNumberObj = phone.phone_number as Record<string, unknown> | undefined;
  const nationalNumber = phoneNumberObj?.national_number
    ? (phoneNumberObj.national_number as string)
    : undefined;
  return {
    phoneType: phone.phone_type ? (phone.phone_type as string) : undefined,
    phoneNumber: phoneNumberObj ? { nationalNumber } : undefined,
  };
}

function mapPayerName(
  name: Record<string, unknown> | undefined
): { givenName?: string; surname?: string } | undefined {
  if (!name) return undefined;
  return {
    givenName: name.given_name ? (name.given_name as string) : undefined,
    surname: name.surname ? (name.surname as string) : undefined,
  };
}

export function mapToPayer(data: Record<string, unknown>): PayPalPayer {
  const name = data.name as Record<string, unknown> | undefined;
  const phone = data.phone as Record<string, unknown> | undefined;
  const address = data.address as Record<string, unknown> | undefined;

  return {
    payerId: data.payer_id ? (data.payer_id as string) : undefined,
    name: mapPayerName(name),
    emailAddress: data.email_address ? (data.email_address as string) : undefined,
    phone: phone ? mapPayerPhone(phone) : undefined,
    birthDate: data.birth_date ? (data.birth_date as string) : undefined,
    address: address ? mapToAddress(address) : undefined,
  };
}

export function mapToAddress(data: Record<string, unknown>): PayPalAddress {
  return {
    addressLine1: data.address_line_1 ? (data.address_line_1 as string) : undefined,
    addressLine2: data.address_line_2 ? (data.address_line_2 as string) : undefined,
    adminArea1: data.admin_area_1 ? (data.admin_area_1 as string) : undefined,
    adminArea2: data.admin_area_2 ? (data.admin_area_2 as string) : undefined,
    postalCode: data.postal_code ? (data.postal_code as string) : undefined,
    countryCode: data.country_code ? (data.country_code as string) : undefined,
  };
}

function mapToShipping(data: Record<string, unknown>): {
  name?: { fullName?: string };
  address?: PayPalAddress;
} {
  const name = data.name as Record<string, unknown> | undefined;
  const address = data.address as Record<string, unknown> | undefined;

  return {
    name: name ? { fullName: name.full_name ? (name.full_name as string) : undefined } : undefined,
    address: address ? mapToAddress(address) : undefined,
  };
}

export function mapToCapture(data: Record<string, unknown>): PayPalCapture {
  const amount = (data.amount as Record<string, unknown>) ?? {};
  const sellerProtection = data.seller_protection as Record<string, unknown> | undefined;

  return {
    id: (data.id as string | null | undefined) ?? '',
    status: ((data.status as string | null | undefined) ?? 'PENDING') as PayPalCapture['status'],
    amount: {
      currencyCode: (amount.currency_code as string | null | undefined) ?? 'GBP',
      value: (amount.value as string | null | undefined) ?? '0.00',
    },
    finalCapture: Boolean(data.final_capture),
    sellerProtection: sellerProtection
      ? {
          status: (sellerProtection.status as string | null | undefined) ?? '',
          disputeCategories: sellerProtection.dispute_categories as string[] | undefined,
        }
      : undefined,
    createTime: new Date(
      (data.create_time as string | null | undefined) ?? new Date().toISOString()
    ),
    updateTime: new Date(
      (data.update_time as string | null | undefined) ?? new Date().toISOString()
    ),
  };
}

export function mapToAuthorization(data: Record<string, unknown>): PayPalAuthorization {
  const amount = (data.amount as Record<string, unknown>) ?? {};

  return {
    id: (data.id as string | null | undefined) ?? '',
    status: ((data.status as string | null | undefined) ??
      'PENDING') as PayPalAuthorization['status'],
    amount: {
      currencyCode: (amount.currency_code as string | null | undefined) ?? 'GBP',
      value: (amount.value as string | null | undefined) ?? '0.00',
    },
    expirationTime: data.expiration_time ? new Date(data.expiration_time as string) : undefined,
    createTime: new Date(
      (data.create_time as string | null | undefined) ?? new Date().toISOString()
    ),
    updateTime: new Date(
      (data.update_time as string | null | undefined) ?? new Date().toISOString()
    ),
  };
}

export function mapToRefund(data: Record<string, unknown>): PayPalRefund {
  const amount = (data.amount as Record<string, unknown>) ?? {};

  return {
    id: (data.id as string | null | undefined) ?? '',
    status: ((data.status as string | null | undefined) ?? 'PENDING') as PayPalRefund['status'],
    amount: {
      currencyCode: (amount.currency_code as string | null | undefined) ?? 'GBP',
      value: (amount.value as string | null | undefined) ?? '0.00',
    },
    invoiceId: data.invoice_id ? (data.invoice_id as string) : undefined,
    noteToPayer: data.note_to_payer ? (data.note_to_payer as string) : undefined,
    createTime: new Date(
      (data.create_time as string | null | undefined) ?? new Date().toISOString()
    ),
    updateTime: new Date(
      (data.update_time as string | null | undefined) ?? new Date().toISOString()
    ),
  };
}

export function mapToSubscription(data: Record<string, unknown>): PayPalSubscription {
  const subscriber = data.subscriber as Record<string, unknown> | undefined;
  const billingInfo = data.billing_info as Record<string, unknown> | undefined;
  const links = (data.links as Array<Record<string, unknown>>) ?? [];

  return {
    id: (data.id as string | null | undefined) ?? '',
    status: ((data.status as string | null | undefined) ??
      'APPROVAL_PENDING') as PayPalSubscription['status'],
    planId: (data.plan_id as string | null | undefined) ?? '',
    quantity: data.quantity ? (data.quantity as string) : undefined,
    subscriber: subscriber ? mapToPayer(subscriber) : undefined,
    billingInfo: billingInfo ? mapBillingInfo(billingInfo) : undefined,
    createTime: new Date(
      (data.create_time as string | null | undefined) ?? new Date().toISOString()
    ),
    updateTime: new Date(
      (data.update_time as string | null | undefined) ?? new Date().toISOString()
    ),
    links: links.map((link) => ({
      href: (link.href as string | null | undefined) ?? '',
      rel: (link.rel as string | null | undefined) ?? '',
      method: link.method ? (link.method as string) : undefined,
    })),
  };
}

function mapBillingInfo(billingInfo: Record<string, unknown>) {
  return {
    outstandingBalance: billingInfo.outstanding_balance
      ? {
          currencyCode:
            ((billingInfo.outstanding_balance as Record<string, unknown>).currency_code as
              | string
              | null
              | undefined) ?? 'GBP',
          value:
            ((billingInfo.outstanding_balance as Record<string, unknown>).value as
              | string
              | null
              | undefined) ?? '0.00',
        }
      : undefined,
    lastPayment: billingInfo.last_payment
      ? {
          amount: {
            currencyCode:
              ((
                (billingInfo.last_payment as Record<string, unknown>).amount as Record<
                  string,
                  unknown
                >
              )?.currency_code as string | undefined) ?? 'GBP',
            value:
              ((
                (billingInfo.last_payment as Record<string, unknown>).amount as Record<
                  string,
                  unknown
                >
              )?.value as string | undefined) ?? '0.00',
          },
          time: new Date(
            ((billingInfo.last_payment as Record<string, unknown>).time as
              | string
              | null
              | undefined) ?? new Date().toISOString()
          ),
        }
      : undefined,
    nextBillingTime: billingInfo.next_billing_time
      ? new Date(billingInfo.next_billing_time as string)
      : undefined,
    failedPaymentsCount: billingInfo.failed_payments_count
      ? Number(billingInfo.failed_payments_count)
      : undefined,
  };
}
