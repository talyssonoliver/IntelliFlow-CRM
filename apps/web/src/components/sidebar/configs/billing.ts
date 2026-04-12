/**
 * Billing Sidebar Configuration
 *
 * Navigation structure for the billing portal module.
 *
 * @implements PG-025 (Billing Portal)
 */

import type { SidebarConfig } from '../sidebar-types';

export const billingSidebarConfig: SidebarConfig = {
  moduleId: 'billing',
  moduleTitle: 'Billing',
  moduleIcon: 'credit_card',
  showSettings: false, // Billing is already a settings-type page
  sections: [
    {
      id: 'billing',
      title: 'Billing',
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: 'dashboard',
          href: '/billing',
        },
        {
          id: 'invoices',
          label: 'Invoices',
          icon: 'receipt_long',
          href: '/billing/invoices',
        },
        {
          id: 'payment-methods',
          label: 'Payment Methods',
          icon: 'payments',
          href: '/billing/payment-methods',
        },
        {
          id: 'usage',
          label: 'Usage',
          icon: 'insights',
          href: '/billing/usage',
        },
        {
          id: 'subscriptions',
          label: 'Subscriptions',
          icon: 'autorenew',
          href: '/billing/subscriptions',
        },
        {
          id: 'receipts',
          label: 'Receipts',
          icon: 'receipt',
          href: '/billing/receipts',
        },
      ],
    },
    {
      id: 'plans',
      title: 'Plans',
      items: [
        {
          id: 'compare',
          label: 'Compare Plans',
          icon: 'compare',
          href: '/billing/plans',
        },
        {
          id: 'upgrade',
          label: 'Upgrade',
          icon: 'upgrade',
          href: '/billing/upgrade',
        },
        {
          id: 'cancel',
          label: 'Cancel',
          icon: 'cancel',
          href: '/billing/cancel',
        },
      ],
    },
    {
      id: 'settings',
      title: 'Settings',
      items: [
        {
          id: 'billing-settings',
          label: 'Billing Settings',
          icon: 'settings',
          href: '/billing/settings',
        },
      ],
    },
  ],
};
