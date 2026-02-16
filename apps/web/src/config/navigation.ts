/**
 * IntelliFlow CRM - Page Registry & Navigation Configuration
 *
 * Central source of truth for all page routes, navigation items,
 * and page metadata. Maps to PG-001 through PG-126 from Sprint_plan.csv.
 */

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: string;
  children?: NavItem[];
  taskId?: string; // Sprint plan reference (PG-XXX)
}

export interface PageMeta {
  taskId: string;
  title: string;
  description: string;
  route: string;
  group: 'public' | 'auth' | 'dashboard' | 'settings' | 'billing' | 'developer' | 'support' | 'legal' | 'system';
  sprint: number;
}

// ─── Public Site Navigation ──────────────────────────────────────────────────

export const publicNav: NavItem[] = [
  { label: 'Features', href: '/features', taskId: 'PG-002' },
  { label: 'Pricing', href: '/pricing', taskId: 'PG-003' },
  { label: 'About', href: '/about', taskId: 'PG-004' },
  { label: 'Blog', href: '/blog', taskId: 'PG-009' },
  { label: 'Contact', href: '/contact', taskId: 'PG-005' },
];

export const publicFooterNav = {
  product: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Security', href: '/security' },
    { label: 'Status', href: '/status' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Careers', href: '/careers' },
    { label: 'Press', href: '/press' },
    { label: 'Partners', href: '/partners' },
    { label: 'Contact', href: '/contact' },
  ],
  resources: [
    { label: 'Blog', href: '/blog' },
    { label: 'Help Center', href: '/support/help-center' },
    { label: 'API Docs', href: '/developers/api-docs' },
    { label: 'SDK Guides', href: '/developers/sdk' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' },
    { label: 'DPA', href: '/dpa' },
    { label: 'Acceptable Use', href: '/acceptable-use' },
  ],
};

// ─── Dashboard / CRM Sidebar Navigation ─────────────────────────────────────

export const dashboardNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', taskId: 'PG-058' },
  {
    label: 'Leads',
    href: '/leads',
    icon: 'Target',
    taskId: 'PG-059',
    children: [
      { label: 'All Leads', href: '/leads' },
      { label: 'New Lead', href: '/leads/new', taskId: 'PG-060' },
    ],
  },
  {
    label: 'Contacts',
    href: '/contacts',
    icon: 'Users',
    taskId: 'PG-064',
    children: [
      { label: 'All Contacts', href: '/contacts' },
      { label: 'New Contact', href: '/contacts/new', taskId: 'PG-065' },
    ],
  },
  {
    label: 'Accounts',
    href: '/accounts',
    icon: 'Building2',
    taskId: 'PG-069',
    children: [
      { label: 'All Accounts', href: '/accounts' },
      { label: 'New Account', href: '/accounts/new', taskId: 'PG-070' },
    ],
  },
  {
    label: 'Deals',
    href: '/deals',
    icon: 'Handshake',
    taskId: 'PG-074',
    children: [
      { label: 'All Deals', href: '/deals' },
      { label: 'New Deal', href: '/deals/new', taskId: 'PG-075' },
      { label: 'Pipeline', href: '/pipeline', taskId: 'PG-078' },
    ],
  },
  {
    label: 'Activities',
    href: '/activities',
    icon: 'Activity',
    taskId: 'PG-080',
    children: [
      { label: 'All Activities', href: '/activities' },
      { label: 'Calendar', href: '/calendar', taskId: 'PG-083' },
      { label: 'Tasks', href: '/tasks', taskId: 'PG-084' },
    ],
  },
  {
    label: 'Emails',
    href: '/emails',
    icon: 'Mail',
    taskId: 'PG-087',
    children: [
      { label: 'Inbox', href: '/emails' },
      { label: 'Compose', href: '/emails/compose', taskId: 'PG-088' },
      { label: 'Templates', href: '/emails/templates', taskId: 'PG-090' },
    ],
  },
  {
    label: 'Products',
    href: '/products',
    icon: 'Package',
    taskId: 'PG-091',
    children: [
      { label: 'All Products', href: '/products' },
      { label: 'New Product', href: '/products/new', taskId: 'PG-092' },
    ],
  },
  {
    label: 'Quotes',
    href: '/quotes',
    icon: 'FileText',
    taskId: 'PG-094',
    children: [
      { label: 'All Quotes', href: '/quotes' },
      { label: 'New Quote', href: '/quotes/new', taskId: 'PG-095' },
    ],
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: 'ShoppingCart',
    taskId: 'PG-097',
  },
  {
    label: 'Documents',
    href: '/documents',
    icon: 'FolderOpen',
    taskId: 'PG-099',
  },
  {
    label: 'Tickets',
    href: '/tickets',
    icon: 'Ticket',
    taskId: 'PG-101',
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: 'BarChart3',
    taskId: 'PG-086',
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: 'TrendingUp',
    taskId: 'PG-103',
    children: [
      { label: 'Overview', href: '/analytics' },
      { label: 'Lead Analytics', href: '/analytics/leads' },
      { label: 'Sales Analytics', href: '/analytics/sales' },
      { label: 'AI Insights', href: '/analytics/ai' },
    ],
  },
];

// ─── Settings Sidebar Navigation ────────────────────────────────────────────

export const settingsNav: NavItem[] = [
  { label: 'General', href: '/settings', icon: 'Settings', taskId: 'PG-104' },
  { label: 'Profile', href: '/settings/profile', icon: 'User', taskId: 'PG-105' },
  { label: 'Account', href: '/settings/account', icon: 'Shield', taskId: 'PG-106' },
  { label: 'Organization', href: '/settings/organization', icon: 'Building', taskId: 'PG-107' },
  { label: 'Users & Teams', href: '/settings/users', icon: 'Users', taskId: 'PG-108' },
  { label: 'Roles & Permissions', href: '/settings/roles', icon: 'Lock', taskId: 'PG-110' },
  { label: 'API Keys', href: '/settings/api-keys', icon: 'Key', taskId: 'PG-113' },
  { label: 'Webhooks', href: '/settings/webhooks', icon: 'Webhook', taskId: 'PG-114' },
  { label: 'Integrations', href: '/settings/integrations', icon: 'Plug', taskId: 'PG-115' },
  { label: 'Notifications', href: '/settings/notifications', icon: 'Bell', taskId: 'PG-116' },
  { label: 'Import / Export', href: '/settings/import-export', icon: 'ArrowLeftRight', taskId: 'PG-117' },
  { label: 'Audit Log', href: '/settings/audit-log', icon: 'ScrollText', taskId: 'PG-118' },
  { label: 'Billing', href: '/settings/billing', icon: 'CreditCard', taskId: 'PG-119' },
  { label: 'Email Templates', href: '/settings/email-templates', icon: 'MailOpen', taskId: 'PG-120' },
  { label: 'Custom Fields', href: '/settings/custom-fields', icon: 'FormInput', taskId: 'PG-121' },
  { label: 'Workflows', href: '/settings/workflows', icon: 'GitBranch', taskId: 'PG-122' },
  { label: 'Security', href: '/settings/security', icon: 'ShieldCheck', taskId: 'PG-123' },
  { label: 'Appearance', href: '/settings/appearance', icon: 'Palette', taskId: 'PG-124' },
];

// ─── Developer Portal Navigation ────────────────────────────────────────────

export const developerNav: NavItem[] = [
  { label: 'API Documentation', href: '/developers/api-docs', icon: 'Book', taskId: 'PG-032' },
  { label: 'API Explorer', href: '/developers/api-explorer', icon: 'Code', taskId: 'PG-039' },
  { label: 'Webhooks', href: '/developers/webhooks', icon: 'Webhook', taskId: 'PG-034' },
  { label: 'SDK Guides', href: '/developers/sdk', icon: 'BookOpen', taskId: 'PG-036' },
  { label: 'Your Apps', href: '/developers/apps', icon: 'AppWindow', taskId: 'PG-037' },
  { label: 'Sandbox', href: '/developers/sandbox', icon: 'FlaskConical', taskId: 'PG-040' },
  { label: 'Changelog', href: '/developers/changelog', icon: 'History', taskId: 'PG-038' },
  { label: 'Status', href: '/developers/status', icon: 'Activity', taskId: 'PG-041' },
];

// ─── Complete Page Registry ─────────────────────────────────────────────────

export const pageRegistry: PageMeta[] = [
  // Public Pages (PG-001 to PG-014)
  { taskId: 'PG-001', title: 'Home', description: 'Landing page with hero, features, and CTA', route: '/', group: 'public', sprint: 11 },
  { taskId: 'PG-002', title: 'Features', description: 'Product features overview', route: '/features', group: 'public', sprint: 11 },
  { taskId: 'PG-003', title: 'Pricing', description: 'Pricing plans and comparison', route: '/pricing', group: 'public', sprint: 11 },
  { taskId: 'PG-004', title: 'About', description: 'Company information and team', route: '/about', group: 'public', sprint: 12 },
  { taskId: 'PG-005', title: 'Contact', description: 'Contact form and support info', route: '/contact', group: 'public', sprint: 12 },
  { taskId: 'PG-006', title: 'Partners', description: 'Partner program information', route: '/partners', group: 'public', sprint: 18 },
  { taskId: 'PG-007', title: 'Press', description: 'Press releases and media kit', route: '/press', group: 'public', sprint: 18 },
  { taskId: 'PG-008', title: 'Security', description: 'Security practices and compliance', route: '/security', group: 'public', sprint: 15 },
  { taskId: 'PG-009', title: 'Blog', description: 'Blog index with articles', route: '/blog', group: 'public', sprint: 14 },
  { taskId: 'PG-010', title: 'Blog Post', description: 'Individual blog article', route: '/blog/[slug]', group: 'public', sprint: 14 },
  { taskId: 'PG-011', title: 'Careers', description: 'Job openings and culture', route: '/careers', group: 'public', sprint: 20 },
  { taskId: 'PG-012', title: 'Career Detail', description: 'Individual job listing', route: '/careers/[id]', group: 'public', sprint: 20 },
  { taskId: 'PG-013', title: 'Landing Page', description: 'Dynamic landing page template', route: '/lp/[slug]', group: 'public', sprint: 16 },
  { taskId: 'PG-014', title: 'Status', description: 'System status and uptime', route: '/status', group: 'public', sprint: 17 },

  // Auth Pages (PG-015 to PG-024)
  { taskId: 'PG-015', title: 'Sign In', description: 'User login with email/password or SSO', route: '/login', group: 'auth', sprint: 11 },
  { taskId: 'PG-016', title: 'Sign Up', description: 'New account registration', route: '/signup', group: 'auth', sprint: 11 },
  { taskId: 'PG-017', title: 'Sign Up Success', description: 'Registration confirmation', route: '/signup/success', group: 'auth', sprint: 11 },
  { taskId: 'PG-018', title: 'Logout', description: 'Session termination', route: '/logout', group: 'auth', sprint: 11 },
  { taskId: 'PG-019', title: 'Forgot Password', description: 'Password reset request', route: '/forgot-password', group: 'auth', sprint: 12 },
  { taskId: 'PG-020', title: 'Reset Password', description: 'New password entry', route: '/reset-password/[token]', group: 'auth', sprint: 12 },
  { taskId: 'PG-021', title: 'MFA Setup', description: 'Multi-factor authentication setup', route: '/mfa/setup', group: 'auth', sprint: 16 },
  { taskId: 'PG-022', title: 'MFA Verify', description: 'MFA code verification', route: '/mfa/verify', group: 'auth', sprint: 16 },
  { taskId: 'PG-023', title: 'Verify Email', description: 'Email verification callback', route: '/verify-email/[token]', group: 'auth', sprint: 12 },
  { taskId: 'PG-024', title: 'SSO Callback', description: 'SSO/OAuth callback handler', route: '/auth/callback', group: 'auth', sprint: 16 },

  // Billing Pages (PG-025 to PG-031)
  { taskId: 'PG-025', title: 'Billing Portal', description: 'Billing overview and management', route: '/billing', group: 'billing', sprint: 19 },
  { taskId: 'PG-026', title: 'Checkout', description: 'Plan purchase and upgrade', route: '/billing/checkout', group: 'billing', sprint: 19 },
  { taskId: 'PG-027', title: 'Invoices', description: 'Invoice history list', route: '/billing/invoices', group: 'billing', sprint: 19 },
  { taskId: 'PG-028', title: 'Invoice Detail', description: 'Individual invoice view', route: '/billing/invoices/[id]', group: 'billing', sprint: 19 },
  { taskId: 'PG-029', title: 'Payment Methods', description: 'Manage payment methods', route: '/billing/payment-methods', group: 'billing', sprint: 19 },
  { taskId: 'PG-030', title: 'Subscriptions', description: 'Active subscriptions', route: '/billing/subscriptions', group: 'billing', sprint: 19 },
  { taskId: 'PG-031', title: 'Receipt', description: 'Individual payment receipt', route: '/billing/receipts/[id]', group: 'billing', sprint: 19 },

  // Developer Pages (PG-032 to PG-041)
  { taskId: 'PG-032', title: 'API Documentation', description: 'Interactive API reference', route: '/developers/api-docs', group: 'developer', sprint: 22 },
  { taskId: 'PG-033', title: 'API Endpoint Detail', description: 'Individual endpoint documentation', route: '/developers/api-docs/[endpoint]', group: 'developer', sprint: 22 },
  { taskId: 'PG-034', title: 'Webhooks Guide', description: 'Webhook configuration documentation', route: '/developers/webhooks', group: 'developer', sprint: 22 },
  { taskId: 'PG-035', title: 'Webhook Events', description: 'Webhook event reference', route: '/developers/webhooks/events', group: 'developer', sprint: 22 },
  { taskId: 'PG-036', title: 'SDK Guides', description: 'SDK documentation by language', route: '/developers/sdk', group: 'developer', sprint: 23 },
  { taskId: 'PG-037', title: 'Developer Apps', description: 'Manage developer applications', route: '/developers/apps', group: 'developer', sprint: 23 },
  { taskId: 'PG-038', title: 'Changelog', description: 'API changes and version history', route: '/developers/changelog', group: 'developer', sprint: 23 },
  { taskId: 'PG-039', title: 'API Explorer', description: 'Interactive API testing tool', route: '/developers/api-explorer', group: 'developer', sprint: 24 },
  { taskId: 'PG-040', title: 'Sandbox', description: 'API testing sandbox environment', route: '/developers/sandbox', group: 'developer', sprint: 24 },
  { taskId: 'PG-041', title: 'Developer Status', description: 'API status and health', route: '/developers/status', group: 'developer', sprint: 24 },

  // Support Pages (PG-042 to PG-048)
  { taskId: 'PG-042', title: 'Help Center', description: 'Help center home', route: '/support/help-center', group: 'support', sprint: 20 },
  { taskId: 'PG-043', title: 'Search Results', description: 'Help article search', route: '/support/search', group: 'support', sprint: 20 },
  { taskId: 'PG-044', title: 'Support Tickets', description: 'Ticket list', route: '/support/tickets', group: 'support', sprint: 20 },
  { taskId: 'PG-045', title: 'New Ticket', description: 'Create support ticket', route: '/support/tickets/new', group: 'support', sprint: 20 },
  { taskId: 'PG-046', title: 'Ticket Detail', description: 'Individual ticket view', route: '/support/tickets/[id]', group: 'support', sprint: 20 },
  { taskId: 'PG-047', title: 'Live Chat', description: 'Real-time support chat', route: '/support/chat', group: 'support', sprint: 21 },
  { taskId: 'PG-048', title: 'Knowledge Base Article', description: 'Help article', route: '/support/knowledge-base/[slug]', group: 'support', sprint: 20 },

  // Legal Pages (PG-049 to PG-053)
  { taskId: 'PG-049', title: 'Privacy Policy', description: 'Data privacy policy', route: '/privacy', group: 'legal', sprint: 15 },
  { taskId: 'PG-050', title: 'Terms of Service', description: 'Service terms and conditions', route: '/terms', group: 'legal', sprint: 15 },
  { taskId: 'PG-051', title: 'Cookie Policy', description: 'Cookie usage policy', route: '/cookies', group: 'legal', sprint: 15 },
  { taskId: 'PG-052', title: 'Data Processing Agreement', description: 'DPA for enterprises', route: '/dpa', group: 'legal', sprint: 22 },
  { taskId: 'PG-053', title: 'Acceptable Use Policy', description: 'Platform usage rules', route: '/acceptable-use', group: 'legal', sprint: 22 },

  // System Pages (PG-054 to PG-057)
  { taskId: 'PG-054', title: 'Onboarding', description: 'New user onboarding wizard', route: '/onboarding', group: 'system', sprint: 13 },
  { taskId: 'PG-055', title: '404 Not Found', description: 'Page not found', route: '/404', group: 'system', sprint: 11 },
  { taskId: 'PG-056', title: '500 Error', description: 'Server error page', route: '/500', group: 'system', sprint: 11 },
  { taskId: 'PG-057', title: 'Maintenance', description: 'Scheduled maintenance notice', route: '/maintenance', group: 'system', sprint: 17 },

  // Core CRM Pages (PG-058 to PG-103)
  { taskId: 'PG-058', title: 'Dashboard', description: 'CRM dashboard with KPIs and widgets', route: '/dashboard', group: 'dashboard', sprint: 5 },
  { taskId: 'PG-059', title: 'Leads List', description: 'Lead management with filtering and AI scoring', route: '/leads', group: 'dashboard', sprint: 5 },
  { taskId: 'PG-060', title: 'New Lead', description: 'Lead creation form', route: '/leads/new', group: 'dashboard', sprint: 5 },
  { taskId: 'PG-061', title: 'Lead Detail', description: 'Individual lead profile', route: '/leads/[id]', group: 'dashboard', sprint: 6 },
  { taskId: 'PG-062', title: 'Lead Edit', description: 'Edit lead information', route: '/leads/[id]/edit', group: 'dashboard', sprint: 6 },
  { taskId: 'PG-063', title: 'Lead AI Score', description: 'AI scoring detail and history', route: '/leads/[id]/score', group: 'dashboard', sprint: 7 },
  { taskId: 'PG-064', title: 'Contacts List', description: 'Contact management', route: '/contacts', group: 'dashboard', sprint: 5 },
  { taskId: 'PG-065', title: 'New Contact', description: 'Contact creation form', route: '/contacts/new', group: 'dashboard', sprint: 5 },
  { taskId: 'PG-066', title: 'Contact Detail', description: 'Individual contact profile', route: '/contacts/[id]', group: 'dashboard', sprint: 6 },
  { taskId: 'PG-067', title: 'Contact Edit', description: 'Edit contact information', route: '/contacts/[id]/edit', group: 'dashboard', sprint: 6 },
  { taskId: 'PG-068', title: 'Contact Merge', description: 'Merge duplicate contacts', route: '/contacts/[id]/merge', group: 'dashboard', sprint: 10 },
  { taskId: 'PG-069', title: 'Accounts List', description: 'Account/company management', route: '/accounts', group: 'dashboard', sprint: 6 },
  { taskId: 'PG-070', title: 'New Account', description: 'Account creation form', route: '/accounts/new', group: 'dashboard', sprint: 6 },
  { taskId: 'PG-071', title: 'Account Detail', description: 'Individual account profile', route: '/accounts/[id]', group: 'dashboard', sprint: 7 },
  { taskId: 'PG-072', title: 'Account Edit', description: 'Edit account information', route: '/accounts/[id]/edit', group: 'dashboard', sprint: 7 },
  { taskId: 'PG-073', title: 'Account Contacts', description: 'Contacts under account', route: '/accounts/[id]/contacts', group: 'dashboard', sprint: 7 },
  { taskId: 'PG-074', title: 'Deals List', description: 'Deal management', route: '/deals', group: 'dashboard', sprint: 8 },
  { taskId: 'PG-075', title: 'New Deal', description: 'Deal creation form', route: '/deals/new', group: 'dashboard', sprint: 8 },
  { taskId: 'PG-076', title: 'Deal Detail', description: 'Individual deal view', route: '/deals/[id]', group: 'dashboard', sprint: 8 },
  { taskId: 'PG-077', title: 'Deal Edit', description: 'Edit deal information', route: '/deals/[id]/edit', group: 'dashboard', sprint: 8 },
  { taskId: 'PG-078', title: 'Pipeline Board', description: 'Kanban-style deal pipeline', route: '/pipeline', group: 'dashboard', sprint: 9 },
  { taskId: 'PG-079', title: 'Deal Timeline', description: 'Deal activity timeline', route: '/deals/[id]/timeline', group: 'dashboard', sprint: 9 },
  { taskId: 'PG-080', title: 'Activities List', description: 'Activity feed and management', route: '/activities', group: 'dashboard', sprint: 7 },
  { taskId: 'PG-081', title: 'New Activity', description: 'Log new activity', route: '/activities/new', group: 'dashboard', sprint: 7 },
  { taskId: 'PG-082', title: 'Activity Detail', description: 'Individual activity view', route: '/activities/[id]', group: 'dashboard', sprint: 7 },
  { taskId: 'PG-083', title: 'Calendar', description: 'Activity calendar view', route: '/calendar', group: 'dashboard', sprint: 10 },
  { taskId: 'PG-084', title: 'Tasks', description: 'Task management', route: '/tasks', group: 'dashboard', sprint: 8 },
  { taskId: 'PG-085', title: 'Task Detail', description: 'Individual task view', route: '/tasks/[id]', group: 'dashboard', sprint: 8 },
  { taskId: 'PG-086', title: 'Reports', description: 'Custom report builder', route: '/reports', group: 'dashboard', sprint: 12 },
  { taskId: 'PG-087', title: 'Email Inbox', description: 'Email management', route: '/emails', group: 'dashboard', sprint: 10 },
  { taskId: 'PG-088', title: 'Compose Email', description: 'Email composition with AI', route: '/emails/compose', group: 'dashboard', sprint: 10 },
  { taskId: 'PG-089', title: 'Email Detail', description: 'Individual email view', route: '/emails/[id]', group: 'dashboard', sprint: 10 },
  { taskId: 'PG-090', title: 'Email Templates', description: 'Email template management', route: '/emails/templates', group: 'dashboard', sprint: 11 },
  { taskId: 'PG-091', title: 'Products List', description: 'Product catalog', route: '/products', group: 'dashboard', sprint: 13 },
  { taskId: 'PG-092', title: 'New Product', description: 'Product creation form', route: '/products/new', group: 'dashboard', sprint: 13 },
  { taskId: 'PG-093', title: 'Product Detail', description: 'Individual product view', route: '/products/[id]', group: 'dashboard', sprint: 13 },
  { taskId: 'PG-094', title: 'Quotes List', description: 'Quote management', route: '/quotes', group: 'dashboard', sprint: 14 },
  { taskId: 'PG-095', title: 'New Quote', description: 'Quote creation form', route: '/quotes/new', group: 'dashboard', sprint: 14 },
  { taskId: 'PG-096', title: 'Quote Detail', description: 'Individual quote view', route: '/quotes/[id]', group: 'dashboard', sprint: 14 },
  { taskId: 'PG-097', title: 'Orders List', description: 'Order management', route: '/orders', group: 'dashboard', sprint: 15 },
  { taskId: 'PG-098', title: 'Order Detail', description: 'Individual order view', route: '/orders/[id]', group: 'dashboard', sprint: 15 },
  { taskId: 'PG-099', title: 'Documents', description: 'Document management', route: '/documents', group: 'dashboard', sprint: 16 },
  { taskId: 'PG-100', title: 'Document Detail', description: 'Individual document view', route: '/documents/[id]', group: 'dashboard', sprint: 16 },
  { taskId: 'PG-101', title: 'Tickets', description: 'Internal ticket management', route: '/tickets', group: 'dashboard', sprint: 17 },
  { taskId: 'PG-102', title: 'Ticket Detail', description: 'Individual ticket view', route: '/tickets/[id]', group: 'dashboard', sprint: 17 },
  { taskId: 'PG-103', title: 'Analytics', description: 'Analytics overview', route: '/analytics', group: 'dashboard', sprint: 12 },

  // Settings Pages (PG-104 to PG-124)
  { taskId: 'PG-104', title: 'Settings', description: 'Settings overview', route: '/settings', group: 'settings', sprint: 13 },
  { taskId: 'PG-105', title: 'Profile', description: 'User profile settings', route: '/settings/profile', group: 'settings', sprint: 13 },
  { taskId: 'PG-106', title: 'Account', description: 'Account settings', route: '/settings/account', group: 'settings', sprint: 13 },
  { taskId: 'PG-107', title: 'Organization', description: 'Organization settings', route: '/settings/organization', group: 'settings', sprint: 14 },
  { taskId: 'PG-108', title: 'Users', description: 'User management', route: '/settings/users', group: 'settings', sprint: 14 },
  { taskId: 'PG-109', title: 'Invite User', description: 'Invite new user', route: '/settings/users/new', group: 'settings', sprint: 14 },
  { taskId: 'PG-110', title: 'Roles', description: 'Role management', route: '/settings/roles', group: 'settings', sprint: 15 },
  { taskId: 'PG-111', title: 'New Role', description: 'Create new role', route: '/settings/roles/new', group: 'settings', sprint: 15 },
  { taskId: 'PG-112', title: 'Role Detail', description: 'Role permissions detail', route: '/settings/roles/[id]', group: 'settings', sprint: 15 },
  { taskId: 'PG-113', title: 'API Keys', description: 'API key management', route: '/settings/api-keys', group: 'settings', sprint: 16 },
  { taskId: 'PG-114', title: 'Webhooks', description: 'Webhook configuration', route: '/settings/webhooks', group: 'settings', sprint: 16 },
  { taskId: 'PG-115', title: 'Integrations', description: 'Third-party integrations', route: '/settings/integrations', group: 'settings', sprint: 17 },
  { taskId: 'PG-116', title: 'Notifications', description: 'Notification preferences', route: '/settings/notifications', group: 'settings', sprint: 14 },
  { taskId: 'PG-117', title: 'Import / Export', description: 'Data import and export', route: '/settings/import-export', group: 'settings', sprint: 18 },
  { taskId: 'PG-118', title: 'Audit Log', description: 'Activity audit trail', route: '/settings/audit-log', group: 'settings', sprint: 18 },
  { taskId: 'PG-119', title: 'Billing Settings', description: 'Billing configuration', route: '/settings/billing', group: 'settings', sprint: 19 },
  { taskId: 'PG-120', title: 'Email Templates', description: 'Email template settings', route: '/settings/email-templates', group: 'settings', sprint: 17 },
  { taskId: 'PG-121', title: 'Custom Fields', description: 'Custom field definitions', route: '/settings/custom-fields', group: 'settings', sprint: 18 },
  { taskId: 'PG-122', title: 'Workflows', description: 'Workflow automation', route: '/settings/workflows', group: 'settings', sprint: 19 },
  { taskId: 'PG-123', title: 'Security Settings', description: 'Security configuration', route: '/settings/security', group: 'settings', sprint: 16 },
  { taskId: 'PG-124', title: 'Appearance', description: 'Theme and display preferences', route: '/settings/appearance', group: 'settings', sprint: 14 },
];
