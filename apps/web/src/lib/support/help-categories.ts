/**
 * Help Center Categories — Static structural data
 *
 * These are real application content (CRM help category taxonomy),
 * not mock data. PG-044/045 will extend with article content.
 */

export interface HelpCategory {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
  readonly href: string;
  readonly articleCount: number;
  readonly popular: boolean;
  readonly order: number;
  readonly keywords: readonly string[];
}

export const DEFAULT_HELP_CATEGORIES: readonly HelpCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Quick start guides, onboarding steps, and first-time setup for IntelliFlow CRM',
    icon: 'rocket_launch',
    color: 'bg-blue-500',
    href: '/help-center/getting-started',
    articleCount: 5,
    popular: true,
    order: 0,
    keywords: ['setup', 'onboarding', 'quickstart', 'introduction', 'tutorial', 'first steps'],
  },
  {
    id: 'leads-contacts',
    title: 'Leads & Contacts',
    description: 'Managing leads, contacts, and accounts across your sales pipeline',
    icon: 'group',
    color: 'bg-emerald-500',
    href: '/help-center/leads-contacts',
    articleCount: 12,
    popular: true,
    order: 1,
    keywords: ['lead', 'contact', 'account', 'prospect', 'import', 'merge', 'deduplicate'],
  },
  {
    id: 'deals-pipeline',
    title: 'Deals & Pipeline',
    description: 'Tracking deals, managing pipeline stages, and forecasting revenue',
    icon: 'handshake',
    color: 'bg-violet-500',
    href: '/help-center/deals-pipeline',
    articleCount: 10,
    popular: true,
    order: 2,
    keywords: ['deal', 'pipeline', 'stage', 'forecast', 'opportunity', 'revenue', 'win rate'],
  },
  {
    id: 'email-calendar',
    title: 'Email & Calendar',
    description: 'Email integration, calendar sync, scheduling meetings, and templates',
    icon: 'mail',
    color: 'bg-amber-500',
    href: '/help-center/email-calendar',
    articleCount: 8,
    popular: false,
    order: 3,
    keywords: ['email', 'calendar', 'schedule', 'meeting', 'template', 'sync', 'integration'],
  },
  {
    id: 'tickets-cases',
    title: 'Tickets & Cases',
    description: 'Support ticket management, SLA policies, and case resolution workflows',
    icon: 'confirmation_number',
    color: 'bg-red-500',
    href: '/help-center/tickets-cases',
    articleCount: 7,
    popular: false,
    order: 4,
    keywords: ['ticket', 'case', 'support', 'sla', 'resolution', 'escalation', 'queue'],
  },
  {
    id: 'ai-features',
    title: 'AI Features',
    description: 'AI-powered insights, lead scoring, smart suggestions, and agent approvals',
    icon: 'smart_toy',
    color: 'bg-purple-500',
    href: '/help-center/ai-features',
    articleCount: 6,
    popular: false,
    order: 5,
    keywords: ['ai', 'artificial intelligence', 'scoring', 'suggestion', 'agent', 'automation'],
  },
  {
    id: 'settings-admin',
    title: 'Settings & Admin',
    description: 'System configuration, user management, roles, and permissions',
    icon: 'settings',
    color: 'bg-slate-500',
    href: '/help-center/settings-admin',
    articleCount: 9,
    popular: false,
    order: 6,
    keywords: ['settings', 'admin', 'user', 'role', 'permission', 'configuration', 'tenant'],
  },
  {
    id: 'billing',
    title: 'Billing',
    description: 'Subscription plans, invoices, payment methods, and usage tracking',
    icon: 'credit_card',
    color: 'bg-teal-500',
    href: '/help-center/billing',
    articleCount: 4,
    popular: false,
    order: 7,
    keywords: ['billing', 'invoice', 'payment', 'subscription', 'plan', 'pricing', 'usage'],
  },
] as const;
