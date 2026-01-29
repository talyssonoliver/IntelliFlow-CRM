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
      ],
    },
  ],
};
