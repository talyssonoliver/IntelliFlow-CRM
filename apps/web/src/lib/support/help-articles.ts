/**
 * Help Center Articles — Static structural data
 *
 * These are real application content (CRM help articles),
 * not mock data. Mirrors the help-categories.ts pattern.
 */

import { DEFAULT_HELP_CATEGORIES } from './help-categories';

// ─── Content Block Types ──────────────────────────────────────────────────

export type ContentBlock =
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'steps'; readonly items: readonly string[] }
  | { readonly type: 'tip'; readonly text: string }
  | { readonly type: 'warning'; readonly text: string }
  | { readonly type: 'info'; readonly text: string }
  | { readonly type: 'nav-path'; readonly path: readonly string[] };

// ─── Article Types ────────────────────────────────────────────────────────

export interface ArticleSection {
  readonly heading: string;
  /** Plain-text fallback (used when blocks is absent) */
  readonly content: string;
  /** Rich content blocks — preferred over content when present */
  readonly blocks?: readonly ContentBlock[];
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

// ─── Article Data ─────────────────────────────────────────────────────────

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
        blocks: [
          {
            type: 'steps',
            items: [
              'Visit the IntelliFlow CRM sign-up page and enter your work email',
              'Check your inbox for the verification email and click the activation link',
              'Set a strong password and complete your profile details',
              'You will be redirected to your new workspace dashboard',
            ],
          },
          {
            type: 'tip',
            text: 'Use your company email to get automatic team discovery — IntelliFlow can suggest colleagues from the same domain.',
          },
        ],
      },
      {
        heading: 'Configure Your Workspace',
        content:
          'After logging in, navigate to Settings > Workspace to set your company name, timezone, and default currency. Invite team members by entering their email addresses.',
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Workspace'] },
          {
            type: 'steps',
            items: [
              'Set your company name, logo, and timezone',
              'Choose your default currency and date format',
              'Invite team members by entering their email addresses',
              'Assign roles (Admin, Manager, Agent, or Viewer) to each member',
            ],
          },
          {
            type: 'info',
            text: 'Workspace settings apply to all users. Individual preferences like notification settings can be customized per user under their profile.',
          },
        ],
      },
      {
        heading: 'Import Your Data',
        content:
          'Go to Settings > Import to upload your existing contacts and deals via CSV. IntelliFlow maps common column headers automatically and flags any duplicates for review.',
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Import'] },
          {
            type: 'steps',
            items: [
              'Prepare a CSV file with your contacts, leads, or deals',
              'Upload the file — IntelliFlow auto-maps common headers (Name, Email, Phone, Company)',
              'Review the column mapping and adjust any mismatches',
              'Resolve flagged duplicates (merge, skip, or overwrite)',
              'Confirm and start the import — progress is shown in real time',
            ],
          },
          {
            type: 'tip',
            text: 'For large imports (10,000+ records), schedule the import during off-peak hours. IntelliFlow processes imports in the background so you can continue working.',
          },
        ],
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
        blocks: [
          {
            type: 'paragraph',
            text: 'The dashboard is your home screen — the first thing you see after logging in. It provides a real-time snapshot of your sales activity, tasks, and team performance.',
          },
          {
            type: 'info',
            text: 'The sidebar on the left lets you navigate between modules: Leads, Contacts, Deals, Tickets, Calendar, Documents, and Settings. It collapses automatically on smaller screens.',
          },
        ],
      },
      {
        heading: 'Customizing Widgets',
        content:
          'Click the "Customize" button to add, remove, or rearrange dashboard widgets. Each widget can be resized and configured to show the data most relevant to your role.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Click the "Customize" button in the top-right corner of the dashboard',
              'Browse available widgets: Revenue, Tasks, Pipeline, Activity Feed, and more',
              'Drag widgets to rearrange their position on the grid',
              'Click the gear icon on any widget to configure its data source and time range',
              'Click "Save Layout" to apply your changes',
            ],
          },
          {
            type: 'tip',
            text: 'Each user has their own dashboard layout. Admins can also create shared dashboard templates that team members can adopt.',
          },
        ],
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
        blocks: [
          {
            type: 'paragraph',
            text: 'IntelliFlow uses a role-based access control (RBAC) system with four built-in roles, each with specific permissions:',
          },
          {
            type: 'steps',
            items: [
              'Admin — Full system access: user management, billing, integrations, and all CRM data',
              "Manager — Team oversight: view team members' records, run reports, and approve AI actions",
              'Agent — Day-to-day CRM: create and edit leads, contacts, deals, and tickets assigned to them',
              'Viewer — Read-only access: view dashboards and reports without modifying data',
            ],
          },
          {
            type: 'warning',
            text: 'Only Admins can delete records, manage billing, or change system-wide settings. Assign the Admin role carefully.',
          },
        ],
      },
      {
        heading: 'Assigning Roles',
        content:
          'Navigate to Settings > Users & Roles to assign or change roles. Only Admins can modify role assignments. Changes take effect immediately — no logout required.',
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Users & Roles'] },
          {
            type: 'steps',
            items: [
              'Navigate to the Users & Roles settings page',
              'Find the user by name or email in the user list',
              'Click the role dropdown next to their name',
              'Select the new role — changes take effect immediately',
            ],
          },
          {
            type: 'info',
            text: 'Role changes are logged in the audit trail. The affected user does not need to log out — their permissions update in real time.',
          },
        ],
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
        blocks: [
          {
            type: 'steps',
            items: [
              'Click "+ New Lead" from the Leads page, or press Ctrl+L for quick create',
              'Enter contact details: name, email, phone, and company',
              'Select the lead source (e.g., Website, Referral, Event, Cold Outreach)',
              'Add initial notes or context about the lead',
              'Assign an owner — defaults to you if left blank',
            ],
          },
          {
            type: 'tip',
            text: 'Use the quick-create shortcut Ctrl+L from anywhere in IntelliFlow to capture a lead without leaving your current page.',
          },
        ],
      },
      {
        heading: 'Lead Qualification',
        content:
          'Use the lead scoring system to prioritize your pipeline. IntelliFlow AI automatically scores leads based on engagement, company fit, and behavioral signals. You can also manually adjust scores.',
        blocks: [
          {
            type: 'paragraph',
            text: 'IntelliFlow AI automatically scores every lead from 0–100 based on engagement signals, company fit, and behavioral patterns. Higher scores indicate higher conversion likelihood.',
          },
          {
            type: 'info',
            text: 'Scores update in real time as new data comes in — email opens, website visits, and form submissions all contribute to the score. You can also manually adjust scores with a reason note.',
          },
        ],
      },
      {
        heading: 'Converting Leads',
        content:
          'When a lead is ready, click "Convert" to create a Contact and optionally a Deal. All lead history and notes transfer to the new contact record.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Open the lead record and click the "Convert" button',
              'Review the pre-filled Contact details and make any adjustments',
              'Optionally create a Deal at the same time with an estimated value',
              'Confirm — all lead history, notes, and activity transfer automatically',
            ],
          },
          {
            type: 'warning',
            text: 'Lead conversion is a one-way action. Once converted, the lead becomes a Contact and cannot be reverted. Make sure qualification criteria are met before converting.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Contacts', 'Import'] },
          {
            type: 'steps',
            items: [
              'Prepare your CSV file with headers like Name, Email, Phone, and Company',
              'Click "Import" and upload the file (max 50MB, up to 100,000 rows)',
              'Review the auto-mapped columns — adjust any mismatches manually',
              'Preview the first 10 rows to verify data looks correct',
              'Click "Start Import" — progress updates in real time',
            ],
          },
          {
            type: 'tip',
            text: 'Download our CSV template from the import page for the best results. It includes all supported fields with example data.',
          },
        ],
      },
      {
        heading: 'Duplicate Detection',
        content:
          'During import, IntelliFlow checks for duplicates by email address and phone number. Duplicates are flagged for review — you can merge, skip, or overwrite.',
        blocks: [
          {
            type: 'paragraph',
            text: 'IntelliFlow checks every imported record against your existing database using email address and phone number as matching criteria.',
          },
          {
            type: 'info',
            text: 'When duplicates are found, you have three options: Merge (combine data from both records), Skip (keep existing, ignore import), or Overwrite (replace existing with imported data).',
          },
          {
            type: 'warning',
            text: 'Overwrite replaces all fields on the existing record with the imported data. Use this option carefully — there is no undo for overwritten contact data.',
          },
        ],
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
        blocks: [
          {
            type: 'paragraph',
            text: 'IntelliFlow ships with five default pipeline stages designed for typical B2B sales workflows:',
          },
          {
            type: 'steps',
            items: [
              'Prospecting — Initial outreach and interest identification',
              'Qualification — Confirming fit, budget, authority, need, and timeline',
              'Proposal — Sending formal proposals or quotes',
              'Negotiation — Discussing terms, pricing, and contract details',
              'Closed — Deal won or lost (final stage)',
            ],
          },
          { type: 'nav-path', path: ['Settings', 'Pipeline'] },
          {
            type: 'tip',
            text: 'You can create multiple pipelines for different business lines (e.g., "Enterprise Sales" and "SMB Sales"). Each pipeline has independent stages and win-rate tracking.',
          },
        ],
      },
      {
        heading: 'Moving Deals',
        content:
          'Drag and drop deals between stages in the Kanban view. You can also update the stage from the deal detail page. Stage changes are logged in the activity timeline.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Open the Deals module — the Kanban board is the default view',
              'Drag a deal card from one stage column to another',
              'Or open the deal detail page and change the stage from the dropdown',
              'Add an optional note explaining the stage change',
            ],
          },
          {
            type: 'info',
            text: "Every stage change is logged in the deal's activity timeline with a timestamp, the user who made the change, and any notes. This creates a complete audit trail.",
          },
        ],
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
        blocks: [
          {
            type: 'paragraph',
            text: "The Forecast dashboard gives you a clear view of projected revenue, weighted by each deal's probability of closing. IntelliFlow AI continuously adjusts these probabilities based on historical conversion rates and deal velocity.",
          },
          {
            type: 'info',
            text: 'Forecasts update in real time as deals move through stages, probabilities change, or close dates are adjusted. Filter by time period, pipeline, team, or individual rep.',
          },
        ],
      },
      {
        heading: 'Scenario Planning',
        content:
          'Create best-case, worst-case, and most-likely scenarios. IntelliFlow calculates each based on different probability weights and close-date assumptions.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Navigate to the Forecast page and click "Scenarios"',
              'Choose a scenario type: Best Case, Worst Case, or Most Likely',
              'Review the AI-calculated projections for each scenario',
              'Adjust individual deal probabilities or close dates to model "what if" situations',
              'Export the forecast as a PDF or share it with your team',
            ],
          },
          {
            type: 'tip',
            text: 'Use scenario planning in your weekly pipeline reviews. Comparing best-case and worst-case helps teams set realistic targets and identify at-risk deals.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Integrations', 'Email'] },
          {
            type: 'steps',
            items: [
              'Navigate to the Email integration settings page',
              'Click "Connect" and choose your provider (Gmail or Outlook)',
              'Sign in with your email credentials and authorize IntelliFlow',
              'Choose sync preferences: all emails or only CRM-related contacts',
              'Your inbox is now connected — emails begin syncing immediately',
            ],
          },
          {
            type: 'tip',
            text: 'You can connect multiple email accounts. Each team member should connect their own inbox for accurate per-user email tracking.',
          },
          {
            type: 'info',
            text: 'IntelliFlow only reads emails from addresses that match your CRM contacts. No personal emails are accessed or stored.',
          },
        ],
      },
      {
        heading: 'Email Tracking',
        content:
          'Once connected, emails sent to or from CRM contacts are automatically logged on their timeline. Open and click tracking is available for emails sent through IntelliFlow.',
        blocks: [
          {
            type: 'paragraph',
            text: 'Once your inbox is connected, IntelliFlow automatically logs all emails sent to or from your CRM contacts on their activity timeline.',
          },
          {
            type: 'steps',
            items: [
              'Emails are matched to contacts by email address automatically',
              'Open tracking shows when a recipient opens your email',
              'Click tracking records when they click links in your message',
              'Thread grouping keeps related emails together on the contact timeline',
            ],
          },
          {
            type: 'warning',
            text: 'Email open tracking uses a tracking pixel. Some email clients block these by default, so open rates may be lower than actual opens.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Integrations', 'Calendar'] },
          {
            type: 'steps',
            items: [
              'Navigate to the Calendar integration settings page',
              'Click "Connect" and choose Google Calendar or Outlook Calendar',
              'Authorize IntelliFlow to access your calendar',
              'Enable two-way sync — meetings appear in both IntelliFlow and your calendar',
            ],
          },
          {
            type: 'info',
            text: 'Two-way sync means creating a meeting in IntelliFlow adds it to your calendar, and meetings created in your calendar with CRM contacts are logged in IntelliFlow automatically.',
          },
        ],
      },
      {
        heading: 'Scheduling Meetings',
        content:
          'From any contact or deal page, click "Schedule Meeting" to create a calendar event. IntelliFlow checks availability and sends invitations automatically.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Open a contact or deal page and click "Schedule Meeting"',
              'Select a date and time — IntelliFlow shows your availability',
              'Add attendees (contacts are auto-suggested)',
              'Choose a meeting type: Video Call, Phone Call, or In-Person',
              'Send the invitation — attendees receive a calendar invite automatically',
            ],
          },
          {
            type: 'tip',
            text: 'Set up a booking link in Settings > Calendar > Booking Page. Share it with prospects so they can self-schedule meetings based on your real-time availability.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Support', 'Tickets'] },
          {
            type: 'steps',
            items: [
              'Click "New Ticket" from the Tickets page',
              'Enter a clear, descriptive subject line',
              'Write a detailed description of the issue',
              'Set the priority: Critical, High, Medium, or Low',
              'Select a category (e.g., Bug Report, Feature Request, Account Issue)',
              'Attach files if needed — up to 5 files, max 10MB each',
            ],
          },
          {
            type: 'tip',
            text: 'Include steps to reproduce the issue in your description. The more context you provide, the faster the support team can resolve it.',
          },
        ],
      },
      {
        heading: 'Ticket Lifecycle',
        content:
          'Tickets move through statuses: Open → In Progress → Waiting on Customer → Resolved → Closed. SLA timers track response and resolution deadlines.',
        blocks: [
          {
            type: 'paragraph',
            text: 'Every ticket follows a structured lifecycle with clear status transitions:',
          },
          {
            type: 'steps',
            items: [
              'Open — Ticket created and awaiting initial response',
              'In Progress — An agent is actively working on the issue',
              'Waiting on Customer — Additional information needed from the requester',
              'Resolved — The issue has been addressed, pending confirmation',
              'Closed — Resolution confirmed, ticket is archived',
            ],
          },
          {
            type: 'info',
            text: 'SLA timers start when a ticket is created. The timer pauses when the status is "Waiting on Customer" and resumes when the customer responds.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Support', 'SLA Policies'] },
          {
            type: 'steps',
            items: [
              'Navigate to the SLA Policies settings page',
              'Click "New Policy" to create a custom SLA policy',
              'Define response time targets for each priority level',
              'Define resolution time targets for each priority level',
              'Set escalation rules — who gets notified when SLAs are at risk',
              'Activate the policy and assign it to ticket categories',
            ],
          },
          {
            type: 'warning',
            text: 'SLA policies cannot be edited once tickets are associated with them. Create a new policy version instead and deactivate the old one.',
          },
        ],
      },
      {
        heading: 'SLA Monitoring',
        content:
          'The Support dashboard shows SLA compliance metrics. Tickets approaching their deadline are highlighted in yellow; breached tickets appear in red.',
        blocks: [
          {
            type: 'paragraph',
            text: 'The Support dashboard provides real-time SLA compliance visibility with color-coded indicators:',
          },
          {
            type: 'steps',
            items: [
              'Green — SLA on track, plenty of time remaining',
              'Yellow — SLA at risk, deadline approaching within 25% of the total time',
              'Red — SLA breached, response or resolution deadline has passed',
            ],
          },
          {
            type: 'tip',
            text: 'Set up automated email alerts for "at risk" tickets so managers can intervene before SLAs are breached. Configure alerts under Settings > Support > Notifications.',
          },
        ],
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
        blocks: [
          {
            type: 'paragraph',
            text: 'IntelliFlow AI assigns every lead a score from 0–100 based on a combination of engagement signals, company fit, and behavioral patterns. This score helps you prioritize the leads most likely to convert.',
          },
          {
            type: 'info',
            text: 'Scores are recalculated in real time as new interactions are recorded. A lead that opens three emails this week will see their score increase automatically.',
          },
        ],
      },
      {
        heading: 'Score Factors',
        content:
          'Key factors include email engagement, website visits, company size, industry fit, and historical conversion rates for similar leads.',
        blocks: [
          {
            type: 'paragraph',
            text: 'The AI model considers multiple weighted factors when calculating a lead score:',
          },
          {
            type: 'steps',
            items: [
              'Email engagement — open rates, click-throughs, and reply frequency',
              'Website activity — page visits, time on site, and content downloads',
              'Company fit — size, industry, location, and technology stack match',
              'Behavioral signals — meeting requests, demo bookings, and pricing page visits',
              'Historical patterns — conversion rates for leads with similar profiles',
            ],
          },
          {
            type: 'tip',
            text: 'Focus your outreach on leads scoring 70+ for the highest conversion rates. Leads scoring below 30 may benefit from nurture campaigns before direct outreach.',
          },
        ],
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
        blocks: [
          {
            type: 'paragraph',
            text: "IntelliFlow AI analyzes each deal's stage, contact engagement, and historical patterns to recommend your next best action — whether that's sending a follow-up email, scheduling a call, or updating the deal stage.",
          },
          {
            type: 'steps',
            items: [
              'Open any deal or contact page to see AI suggestions in the right panel',
              'Review the suggested action and the reasoning behind it',
              'Click "Accept" to execute the action, or "Dismiss" to skip it',
              'Provide feedback — this helps the AI learn your preferences over time',
            ],
          },
          {
            type: 'info',
            text: "Suggestions improve over time as the AI learns from your team's actions. The more feedback you provide, the more accurate the recommendations become.",
          },
        ],
      },
      {
        heading: 'Agent Approvals',
        content:
          'AI suggestions that involve automated actions (like sending emails) require agent approval. Review pending approvals in the Agent Approvals dashboard.',
        blocks: [
          {
            type: 'paragraph',
            text: 'When IntelliFlow AI recommends an automated action — like sending an email or updating a deal stage — it requires human approval before execution. This keeps you in control while benefiting from AI efficiency.',
          },
          { type: 'nav-path', path: ['Agent Approvals'] },
          {
            type: 'steps',
            items: [
              'Navigate to the Agent Approvals dashboard from the sidebar',
              "Review pending actions: see the AI's reasoning and the proposed action",
              'Approve to execute, Edit to modify before sending, or Reject to cancel',
              'Bulk-approve low-risk actions to save time',
            ],
          },
          {
            type: 'warning',
            text: 'All automated AI actions require approval by default. Admins can configure auto-approval rules for low-risk actions under Settings > AI > Automation Rules.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Workspace'] },
          {
            type: 'steps',
            items: [
              'Upload your company logo (recommended: 200x200px PNG or SVG)',
              'Set your company name — this appears in emails and reports',
              'Choose your timezone — all dates and times use this as default',
              'Select your default currency for deals and billing',
              'Configure your fiscal year start month for reporting',
            ],
          },
          {
            type: 'info',
            text: 'Workspace settings apply to all users. Changes to timezone or currency affect how data is displayed globally, but do not alter stored values.',
          },
        ],
      },
      {
        heading: 'Notification Preferences',
        content:
          'Each user can customize their notification preferences under Settings > Notifications. Choose between email, in-app, or both for different event types.',
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Notifications'] },
          {
            type: 'paragraph',
            text: 'Each user can customize which notifications they receive and how they receive them. Notification preferences are personal and do not affect other team members.',
          },
          {
            type: 'steps',
            items: [
              'Choose notification channels for each event type: Email, In-App, or Both',
              'Set quiet hours to pause non-critical notifications',
              'Configure digest frequency: Real-time, Hourly, or Daily summary',
              'Enable or disable desktop push notifications',
            ],
          },
          {
            type: 'tip',
            text: 'Use the daily digest for low-priority notifications and real-time delivery for critical items like SLA breaches and deal stage changes.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Integrations'] },
          {
            type: 'paragraph',
            text: 'IntelliFlow offers native integrations with popular business tools. Browse the integration marketplace to connect your tech stack:',
          },
          {
            type: 'steps',
            items: [
              'Email — Gmail, Outlook (two-way sync with contact timeline)',
              'Calendar — Google Calendar, Outlook Calendar (meeting scheduling)',
              'Communication — Slack (deal alerts, task notifications, team channels)',
              'Automation — Zapier (connect 5,000+ apps with no-code workflows)',
              'Storage — Google Drive, Dropbox (document attachment and sharing)',
            ],
          },
          {
            type: 'tip',
            text: 'Start with Email and Calendar integrations — they provide the most immediate value by automatically logging communications with your CRM contacts.',
          },
        ],
      },
      {
        heading: 'API Keys',
        content:
          'Generate API keys under Settings > Developer > API Keys. Keys can be scoped with specific permissions and set with expiration dates for security.',
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Developer', 'API Keys'] },
          {
            type: 'steps',
            items: [
              'Navigate to the API Keys page',
              'Click "Generate New Key" and give it a descriptive name',
              'Select permission scopes (read-only, read-write, or specific modules)',
              'Set an expiration date — recommended: 90 days for production keys',
              'Copy and securely store the key — it is only shown once',
            ],
          },
          {
            type: 'warning',
            text: 'API keys grant programmatic access to your CRM data. Never share keys in public repositories, emails, or chat. Rotate keys regularly and revoke any that may be compromised.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Billing', 'Plans'] },
          {
            type: 'paragraph',
            text: 'IntelliFlow offers three plans designed for teams of every size:',
          },
          {
            type: 'steps',
            items: [
              'Starter — Up to 5 users, 1GB storage, basic CRM features, email integration',
              'Professional — Up to 25 users, 10GB storage, AI scoring, pipeline forecasting, API access',
              'Enterprise — Unlimited users, unlimited storage, advanced AI, custom integrations, dedicated support',
            ],
          },
          {
            type: 'tip',
            text: 'Not sure which plan fits? Start with Starter (free 14-day trial) and upgrade as your team grows. All data carries over when you upgrade.',
          },
        ],
      },
      {
        heading: 'Upgrading or Downgrading',
        content:
          'Change your plan at any time from Settings > Billing. Upgrades take effect immediately with prorated billing. Downgrades take effect at the next billing cycle.',
        blocks: [
          {
            type: 'steps',
            items: [
              'Navigate to Settings > Billing and click "Change Plan"',
              'Select your new plan and review the pricing difference',
              'Confirm the change — upgrades apply immediately',
              'For downgrades, the current plan remains active until the billing cycle ends',
            ],
          },
          {
            type: 'info',
            text: 'Upgrades are prorated — you only pay the difference for the remaining days in your billing period. Downgrades do not generate refunds but your current plan stays active until expiry.',
          },
          {
            type: 'warning',
            text: 'Downgrading may disable features your team is currently using (e.g., AI scoring on Starter plan). Review the plan comparison before confirming.',
          },
        ],
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
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Billing', 'Payment'] },
          {
            type: 'steps',
            items: [
              'Navigate to the Payment settings page',
              'Click "Add Payment Method" to enter a new card or bank account',
              'For credit cards: enter your card number, expiry, and CVC',
              'For ACH transfers: available on annual plans — contact support to set up',
              'Set a default payment method for automatic billing',
            ],
          },
          {
            type: 'info',
            text: 'IntelliFlow uses Stripe for secure payment processing. Card details are encrypted and never stored on IntelliFlow servers.',
          },
        ],
      },
      {
        heading: 'Invoice History',
        content:
          'View and download past invoices from Settings > Billing > Invoices. Invoices are generated monthly and sent to the billing contact email on file.',
        blocks: [
          { type: 'nav-path', path: ['Settings', 'Billing', 'Invoices'] },
          {
            type: 'steps',
            items: [
              'Navigate to the Invoices page to view your complete billing history',
              'Click any invoice row to view the detailed breakdown',
              'Download invoices as PDF for your records or accounting',
              'Update the billing contact email to change who receives invoice notifications',
            ],
          },
          {
            type: 'tip',
            text: 'Invoices are generated on the 1st of each month. If you need a custom billing date or consolidated invoicing, contact our sales team.',
          },
        ],
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
