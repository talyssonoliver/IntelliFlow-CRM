/**
 * Help Center Articles — Static structural data
 *
 * These are real application content (CRM help articles),
 * not mock data. Mirrors the help-categories.ts pattern.
 */

import { DEFAULT_HELP_CATEGORIES } from './help-categories';

export interface ArticleSection {
  readonly heading: string;
  readonly content: string;
}

export interface HelpArticle {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly categoryId: string;
  readonly excerpt: string;
  readonly sections: readonly ArticleSection[];
  readonly readTimeMinutes: number;
  readonly lastUpdatedAt: string;
  readonly keywords: readonly string[];
  readonly relatedArticleIds: readonly string[];
  readonly order: number;
}

export const DEFAULT_HELP_ARTICLES: readonly HelpArticle[] = [
  // ─── Getting Started ───────────────────────────────────────────────────
  {
    id: 'gs-001',
    slug: 'quick-start-guide',
    title: 'Quick Start Guide',
    categoryId: 'getting-started',
    excerpt: 'Get up and running with IntelliFlow CRM in minutes.',
    sections: [
      {
        heading: 'Create Your Account',
        content:
          'Sign up at the IntelliFlow CRM portal with your work email. You will receive a verification email — click the link to activate your account and set your password.',
      },
      {
        heading: 'Configure Your Workspace',
        content:
          'After logging in, navigate to Settings > Workspace to set your company name, timezone, and default currency. Invite team members by entering their email addresses.',
      },
      {
        heading: 'Import Your Data',
        content:
          'Go to Settings > Import to upload your existing contacts and deals via CSV. IntelliFlow maps common column headers automatically and flags any duplicates for review.',
      },
    ],
    readTimeMinutes: 4,
    lastUpdatedAt: '2026-03-01',
    keywords: ['setup', 'onboarding', 'quickstart', 'account', 'import'],
    relatedArticleIds: ['gs-002', 'gs-003'],
    order: 0,
  },
  {
    id: 'gs-002',
    slug: 'navigating-the-dashboard',
    title: 'Navigating the Dashboard',
    categoryId: 'getting-started',
    excerpt: 'Learn how to use the IntelliFlow dashboard to monitor your sales activity.',
    sections: [
      {
        heading: 'Dashboard Overview',
        content:
          'The dashboard is your home screen. It shows key metrics like open deals, upcoming tasks, and recent activity. Use the sidebar to navigate between modules.',
      },
      {
        heading: 'Customizing Widgets',
        content:
          'Click the "Customize" button to add, remove, or rearrange dashboard widgets. Each widget can be resized and configured to show the data most relevant to your role.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['dashboard', 'navigation', 'widgets', 'home'],
    relatedArticleIds: ['gs-001', 'gs-003'],
    order: 1,
  },
  {
    id: 'gs-003',
    slug: 'user-roles-and-permissions',
    title: 'User Roles and Permissions',
    categoryId: 'getting-started',
    excerpt: 'Understand the different user roles and what permissions each role grants.',
    sections: [
      {
        heading: 'Role Types',
        content:
          'IntelliFlow has four built-in roles: Admin, Manager, Agent, and Viewer. Admins have full system access. Managers can manage their teams. Agents handle day-to-day CRM operations. Viewers have read-only access.',
      },
      {
        heading: 'Assigning Roles',
        content:
          'Navigate to Settings > Users & Roles to assign or change roles. Only Admins can modify role assignments. Changes take effect immediately — no logout required.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['roles', 'permissions', 'admin', 'access', 'security'],
    relatedArticleIds: ['gs-001'],
    order: 2,
  },

  // ─── Leads & Contacts ─────────────────────────────────────────────────
  {
    id: 'lc-001',
    slug: 'creating-and-managing-leads',
    title: 'Creating and Managing Leads',
    categoryId: 'leads-contacts',
    excerpt: 'Learn how to create, qualify, and convert leads in IntelliFlow.',
    sections: [
      {
        heading: 'Creating a Lead',
        content:
          'Click "+ New Lead" from the Leads page or use the quick-create shortcut (Ctrl+L). Fill in the contact details, source, and initial notes. The lead is automatically assigned to you unless you specify another owner.',
      },
      {
        heading: 'Lead Qualification',
        content:
          'Use the lead scoring system to prioritize your pipeline. IntelliFlow AI automatically scores leads based on engagement, company fit, and behavioral signals. You can also manually adjust scores.',
      },
      {
        heading: 'Converting Leads',
        content:
          'When a lead is ready, click "Convert" to create a Contact and optionally a Deal. All lead history and notes transfer to the new contact record.',
      },
    ],
    readTimeMinutes: 5,
    lastUpdatedAt: '2026-03-01',
    keywords: ['lead', 'create', 'qualify', 'convert', 'scoring'],
    relatedArticleIds: ['lc-002'],
    order: 0,
  },
  {
    id: 'lc-002',
    slug: 'importing-contacts',
    title: 'Importing Contacts',
    categoryId: 'leads-contacts',
    excerpt: 'Import contacts from CSV files or integrate with external sources.',
    sections: [
      {
        heading: 'CSV Import',
        content:
          'Go to Contacts > Import and upload your CSV file. IntelliFlow auto-maps common headers (Name, Email, Phone, Company). Review the mapping, resolve duplicates, and confirm the import.',
      },
      {
        heading: 'Duplicate Detection',
        content:
          'During import, IntelliFlow checks for duplicates by email address and phone number. Duplicates are flagged for review — you can merge, skip, or overwrite.',
      },
    ],
    readTimeMinutes: 4,
    lastUpdatedAt: '2026-02-28',
    keywords: ['import', 'csv', 'contacts', 'duplicate', 'merge'],
    relatedArticleIds: ['lc-001'],
    order: 1,
  },

  // ─── Deals & Pipeline ─────────────────────────────────────────────────
  {
    id: 'dp-001',
    slug: 'managing-your-pipeline',
    title: 'Managing Your Pipeline',
    categoryId: 'deals-pipeline',
    excerpt: 'Organize and track deals through your sales pipeline stages.',
    sections: [
      {
        heading: 'Pipeline Stages',
        content:
          'IntelliFlow comes with default stages: Prospecting, Qualification, Proposal, Negotiation, and Closed. Navigate to Settings > Pipeline to customize stages for your sales process.',
      },
      {
        heading: 'Moving Deals',
        content:
          'Drag and drop deals between stages in the Kanban view. You can also update the stage from the deal detail page. Stage changes are logged in the activity timeline.',
      },
    ],
    readTimeMinutes: 4,
    lastUpdatedAt: '2026-03-01',
    keywords: ['pipeline', 'stages', 'kanban', 'deals', 'forecast'],
    relatedArticleIds: ['dp-002'],
    order: 0,
  },
  {
    id: 'dp-002',
    slug: 'deal-forecasting',
    title: 'Deal Forecasting',
    categoryId: 'deals-pipeline',
    excerpt: 'Use AI-powered forecasting to predict revenue and pipeline health.',
    sections: [
      {
        heading: 'Forecast Dashboard',
        content:
          'The Forecast dashboard shows projected revenue by period, weighted by deal probability. AI adjusts probabilities based on historical conversion rates and deal velocity.',
      },
      {
        heading: 'Scenario Planning',
        content:
          'Create best-case, worst-case, and most-likely scenarios. IntelliFlow calculates each based on different probability weights and close-date assumptions.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['forecast', 'revenue', 'prediction', 'ai', 'scenario'],
    relatedArticleIds: ['dp-001'],
    order: 1,
  },

  // ─── Email & Calendar ─────────────────────────────────────────────────
  {
    id: 'ec-001',
    slug: 'email-integration-setup',
    title: 'Email Integration Setup',
    categoryId: 'email-calendar',
    excerpt: 'Connect your email provider to IntelliFlow for seamless communication tracking.',
    sections: [
      {
        heading: 'Connecting Gmail or Outlook',
        content:
          'Go to Settings > Integrations > Email and click "Connect". Choose Gmail or Outlook and authorize IntelliFlow to access your inbox. Only CRM-related emails are synced.',
      },
      {
        heading: 'Email Tracking',
        content:
          'Once connected, emails sent to or from CRM contacts are automatically logged on their timeline. Open and click tracking is available for emails sent through IntelliFlow.',
      },
    ],
    readTimeMinutes: 4,
    lastUpdatedAt: '2026-02-28',
    keywords: ['email', 'gmail', 'outlook', 'integration', 'tracking'],
    relatedArticleIds: ['ec-002'],
    order: 0,
  },
  {
    id: 'ec-002',
    slug: 'calendar-sync',
    title: 'Calendar Sync',
    categoryId: 'email-calendar',
    excerpt: 'Sync your calendar to schedule meetings and track appointments.',
    sections: [
      {
        heading: 'Calendar Connection',
        content:
          'Navigate to Settings > Integrations > Calendar and connect your Google or Outlook calendar. Two-way sync ensures meetings appear in both your calendar and IntelliFlow.',
      },
      {
        heading: 'Scheduling Meetings',
        content:
          'From any contact or deal page, click "Schedule Meeting" to create a calendar event. IntelliFlow checks availability and sends invitations automatically.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['calendar', 'sync', 'meetings', 'schedule', 'google', 'outlook'],
    relatedArticleIds: ['ec-001'],
    order: 1,
  },

  // ─── Tickets & Cases ───────────────────────────────────────────────────
  {
    id: 'tc-001',
    slug: 'creating-support-tickets',
    title: 'Creating Support Tickets',
    categoryId: 'tickets-cases',
    excerpt: 'Learn how to create and manage support tickets for customer issues.',
    sections: [
      {
        heading: 'Creating a Ticket',
        content:
          'Navigate to Support > Tickets and click "New Ticket". Fill in the subject, description, priority, and category. Attach files if needed (max 10MB per file, up to 5 files).',
      },
      {
        heading: 'Ticket Lifecycle',
        content:
          'Tickets move through statuses: Open → In Progress → Waiting on Customer → Resolved → Closed. SLA timers track response and resolution deadlines.',
      },
    ],
    readTimeMinutes: 4,
    lastUpdatedAt: '2026-03-01',
    keywords: ['ticket', 'support', 'create', 'sla', 'priority'],
    relatedArticleIds: ['tc-002'],
    order: 0,
  },
  {
    id: 'tc-002',
    slug: 'sla-policies',
    title: 'SLA Policies',
    categoryId: 'tickets-cases',
    excerpt: 'Configure and monitor service level agreements for your support team.',
    sections: [
      {
        heading: 'Setting Up SLAs',
        content:
          'Go to Settings > Support > SLA Policies to define response and resolution time targets. SLAs can vary by priority level (Critical, High, Medium, Low).',
      },
      {
        heading: 'SLA Monitoring',
        content:
          'The Support dashboard shows SLA compliance metrics. Tickets approaching their deadline are highlighted in yellow; breached tickets appear in red.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['sla', 'policy', 'response time', 'resolution', 'compliance'],
    relatedArticleIds: ['tc-001'],
    order: 1,
  },

  // ─── AI Features ───────────────────────────────────────────────────────
  {
    id: 'ai-001',
    slug: 'ai-lead-scoring',
    title: 'AI Lead Scoring',
    categoryId: 'ai-features',
    excerpt: 'Understand how IntelliFlow AI scores and prioritizes your leads.',
    sections: [
      {
        heading: 'How Scoring Works',
        content:
          'IntelliFlow AI analyzes lead engagement, company data, and behavioral patterns to assign a score from 0-100. Higher scores indicate higher likelihood of conversion.',
      },
      {
        heading: 'Score Factors',
        content:
          'Key factors include email engagement, website visits, company size, industry fit, and historical conversion rates for similar leads.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-03-01',
    keywords: ['ai', 'scoring', 'lead', 'prediction', 'machine learning'],
    relatedArticleIds: ['ai-002'],
    order: 0,
  },
  {
    id: 'ai-002',
    slug: 'smart-suggestions',
    title: 'Smart Suggestions',
    categoryId: 'ai-features',
    excerpt: 'Get AI-powered suggestions for next best actions on deals and contacts.',
    sections: [
      {
        heading: 'Next Best Action',
        content:
          'IntelliFlow AI analyzes deal stage, contact engagement, and historical patterns to suggest your next action — whether it is sending a follow-up, scheduling a call, or updating the deal stage.',
      },
      {
        heading: 'Agent Approvals',
        content:
          'AI suggestions that involve automated actions (like sending emails) require agent approval. Review pending approvals in the Agent Approvals dashboard.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['ai', 'suggestions', 'automation', 'next action', 'agent'],
    relatedArticleIds: ['ai-001'],
    order: 1,
  },

  // ─── Settings & Admin ──────────────────────────────────────────────────
  {
    id: 'sa-001',
    slug: 'workspace-configuration',
    title: 'Workspace Configuration',
    categoryId: 'settings-admin',
    excerpt: 'Configure your IntelliFlow workspace settings and preferences.',
    sections: [
      {
        heading: 'General Settings',
        content:
          'Access Settings > Workspace to configure your company name, logo, timezone, and default currency. These settings apply to all users in your workspace.',
      },
      {
        heading: 'Notification Preferences',
        content:
          'Each user can customize their notification preferences under Settings > Notifications. Choose between email, in-app, or both for different event types.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['settings', 'workspace', 'configuration', 'notifications', 'preferences'],
    relatedArticleIds: ['sa-002'],
    order: 0,
  },
  {
    id: 'sa-002',
    slug: 'managing-integrations',
    title: 'Managing Integrations',
    categoryId: 'settings-admin',
    excerpt: 'Connect third-party tools and manage API integrations.',
    sections: [
      {
        heading: 'Available Integrations',
        content:
          'IntelliFlow integrates with Gmail, Outlook, Slack, Zapier, and more. Navigate to Settings > Integrations to browse and connect available services.',
      },
      {
        heading: 'API Keys',
        content:
          'Generate API keys under Settings > Developer > API Keys. Keys can be scoped with specific permissions and set with expiration dates for security.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['integrations', 'api', 'connect', 'third-party', 'zapier', 'slack'],
    relatedArticleIds: ['sa-001'],
    order: 1,
  },

  // ─── Billing ───────────────────────────────────────────────────────────
  {
    id: 'bl-001',
    slug: 'subscription-plans',
    title: 'Subscription Plans',
    categoryId: 'billing',
    excerpt: 'Compare plans and manage your IntelliFlow subscription.',
    sections: [
      {
        heading: 'Plan Comparison',
        content:
          'IntelliFlow offers Starter, Professional, and Enterprise plans. Each includes different user limits, storage, and AI feature access. Compare plans at Settings > Billing > Plans.',
      },
      {
        heading: 'Upgrading or Downgrading',
        content:
          'Change your plan at any time from Settings > Billing. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next billing cycle.',
      },
    ],
    readTimeMinutes: 3,
    lastUpdatedAt: '2026-02-28',
    keywords: ['billing', 'subscription', 'plan', 'upgrade', 'pricing'],
    relatedArticleIds: ['bl-002'],
    order: 0,
  },
  {
    id: 'bl-002',
    slug: 'payment-and-invoices',
    title: 'Payment and Invoices',
    categoryId: 'billing',
    excerpt: 'Manage payment methods and access your billing history.',
    sections: [
      {
        heading: 'Payment Methods',
        content:
          'Add or update payment methods at Settings > Billing > Payment. IntelliFlow accepts major credit cards and ACH bank transfers for annual plans.',
      },
      {
        heading: 'Invoice History',
        content:
          'View and download past invoices from Settings > Billing > Invoices. Invoices are generated monthly and sent to the billing contact email on file.',
      },
    ],
    readTimeMinutes: 2,
    lastUpdatedAt: '2026-02-28',
    keywords: ['payment', 'invoice', 'credit card', 'billing history', 'receipt'],
    relatedArticleIds: ['bl-001'],
    order: 1,
  },
] as const;

// ─── Lookup Helpers ──────────────────────────────────────────────────────

export function getArticleBySlug(slug: string): HelpArticle | undefined {
  return DEFAULT_HELP_ARTICLES.find((a) => a.slug === slug);
}

export function getArticlesByCategory(categoryId: string): HelpArticle[] {
  return DEFAULT_HELP_ARTICLES.filter((a) => a.categoryId === categoryId);
}

export function getRelatedArticles(article: HelpArticle): HelpArticle[] {
  if (article.relatedArticleIds.length === 0) return [];
  return DEFAULT_HELP_ARTICLES.filter(
    (a) => article.relatedArticleIds.includes(a.id) && a.id !== article.id
  ).slice(0, 3);
}

// Re-export category lookup for convenience
export function getCategoryById(categoryId: string) {
  return DEFAULT_HELP_CATEGORIES.find((c) => c.id === categoryId);
}
