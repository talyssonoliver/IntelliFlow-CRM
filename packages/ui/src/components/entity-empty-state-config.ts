// ============================================
// Default configuration per CRM entity
// ============================================

export type EmptyStateEntity =
  | 'notes'
  | 'tasks'
  | 'chats'
  | 'appointments'
  | 'files'
  | 'emails'
  | 'timeline'
  | 'activity'
  | 'documents'
  | 'leads'
  | 'contacts'
  | 'accounts'
  | 'deals'
  | 'tickets'
  | 'cases'
  | 'pinned'
  | 'insights'
  | 'notifications'
  | 'comments'
  | 'invoices'
  | 'receipts'
  | 'payment-methods'
  | 'signatures'
  | 'agents'
  | 'rules'
  | 'reports'
  | 'search'
  | 'experiments'
  | 'products'
  | 'subscriptions';

/**
 * Variant controls which title/description is shown:
 * - 'empty'     — no items exist at all (default)
 * - 'selection' — nothing selected in a list-detail split view
 * - 'filtered'  — items exist but none match current search/filter
 * - 'folder'    — a container (folder, category) has no items
 */
export type EmptyStateVariant = 'empty' | 'selection' | 'filtered' | 'folder';

interface VariantText {
  title: string;
  description: string;
}

export interface EntityEmptyStateDefaults {
  /** Material Symbols icon name */
  icon: string;
  /** Default title (variant: 'empty') */
  title: string;
  /** Default description (variant: 'empty') */
  description: string;
  /** CTA label */
  ctaLabel: string;
  /** Keyboard shortcut hint */
  hotkey?: string;
  /** Suggested follow-up actions after first item */
  suggestions: string[];
  /** Composer placeholder text */
  composerPlaceholder: string;
  /** Variant-specific overrides */
  variants?: Partial<Record<Exclude<EmptyStateVariant, 'empty'>, VariantText>>;
}

export const ENTITY_EMPTY_STATE_CONFIG: Record<EmptyStateEntity, EntityEmptyStateDefaults> = {
  notes: {
    icon: 'sticky_note_2',
    title: 'No notes yet',
    description: 'Capture important details, meeting summaries, or quick thoughts.',
    ctaLabel: 'Add a note',
    hotkey: 'N',
    suggestions: ['Pin this note', 'Add a tag', 'Mention a teammate'],
    composerPlaceholder: 'Start typing your note...',
    variants: {
      filtered: { title: 'No notes found', description: 'Try a different search term or filter.' },
    },
  },
  tasks: {
    icon: 'task_alt',
    title: 'No tasks yet',
    description: 'Stay organized by creating tasks with due dates and assignees.',
    ctaLabel: 'Create a task',
    hotkey: 'T',
    suggestions: ['Add a due date', 'Assign to someone', 'Set priority'],
    composerPlaceholder: 'What needs to be done?',
    variants: {
      filtered: { title: 'No tasks found', description: 'Try adjusting your filters or create a new task.' },
      selection: { title: 'No task selected', description: 'Select a task from the list to view details.' },
    },
  },
  chats: {
    icon: 'chat_bubble',
    title: 'No messages yet',
    description: 'Start a conversation with your team about this record.',
    ctaLabel: 'Send a message',
    hotkey: 'C',
    suggestions: ['Mention a teammate', 'Attach a file', 'Add an emoji'],
    composerPlaceholder: 'Type a message...',
    variants: {
      selection: { title: 'No conversation selected', description: 'Select a conversation to view messages.' },
    },
  },
  appointments: {
    icon: 'calendar_month',
    title: 'No appointments yet',
    description: 'Schedule meetings, calls, or follow-ups to keep things on track.',
    ctaLabel: 'Schedule appointment',
    hotkey: 'A',
    suggestions: ['Set a reminder', 'Invite attendees', 'Add location'],
    composerPlaceholder: 'Appointment title...',
    variants: {
      filtered: { title: 'No appointments found', description: 'Try adjusting your date range or filters.' },
    },
  },
  files: {
    icon: 'attach_file',
    title: 'No files attached',
    description: 'Upload contracts, proposals, or any relevant documents.',
    ctaLabel: 'Upload a file',
    suggestions: ['Add a description', 'Tag the file', 'Share with team'],
    composerPlaceholder: 'Drop files here or click to browse...',
  },
  emails: {
    icon: 'mail',
    title: 'No emails yet',
    description: 'Track email conversations linked to this record.',
    ctaLabel: 'Compose email',
    hotkey: 'E',
    suggestions: ['Use a template', 'Schedule send', 'Add CC/BCC'],
    composerPlaceholder: 'Subject line...',
    variants: {
      selection: { title: 'No email selected', description: 'Select an email from the list to view its thread.' },
      folder: { title: 'No emails in this folder', description: 'Emails you send and receive will appear here.' },
      filtered: { title: 'No results found', description: 'Try a different search term.' },
    },
  },
  timeline: {
    icon: 'timeline',
    title: 'No activity yet',
    description: 'All interactions and changes will appear here automatically.',
    ctaLabel: 'Log an activity',
    suggestions: ['Filter by type', 'Export timeline', 'Add a comment'],
    composerPlaceholder: 'Describe the activity...',
  },
  activity: {
    icon: 'local_activity',
    title: 'No recent activity',
    description: 'Activities like calls, meetings, and updates will show up here.',
    ctaLabel: 'Log activity',
    suggestions: ['Log a call', 'Record meeting notes', 'Add follow-up'],
    composerPlaceholder: 'What happened?',
    variants: {
      filtered: { title: 'No activities found', description: 'No activities match your filters.' },
    },
  },
  documents: {
    icon: 'description',
    title: 'No documents yet',
    description: 'Create or link proposals, contracts, and other business documents.',
    ctaLabel: 'Create document',
    hotkey: 'D',
    suggestions: ['Use a template', 'Request signature', 'Share externally'],
    composerPlaceholder: 'Document title...',
    variants: {
      selection: { title: 'No document selected', description: 'Select a document from the list to view details.' },
      filtered: { title: 'No documents found', description: 'Try a different search term or filter.' },
    },
  },
  leads: {
    icon: 'person_add',
    title: 'No leads yet',
    description: 'Start building your pipeline by adding leads from any source.',
    ctaLabel: 'Add a lead',
    suggestions: ['Import from CSV', 'Add manually', 'Connect a form'],
    composerPlaceholder: 'Lead name...',
    variants: {
      selection: { title: 'No lead selected', description: 'Select a lead from the list to view details.' },
      filtered: { title: 'No leads found', description: 'Try adjusting your search or filters.' },
    },
  },
  contacts: {
    icon: 'contacts',
    title: 'No contacts yet',
    description: 'Add contacts to keep track of your relationships and interactions.',
    ctaLabel: 'Add a contact',
    suggestions: ['Import contacts', 'Sync from email', 'Add manually'],
    composerPlaceholder: 'Contact name...',
    variants: {
      selection: { title: 'No contact selected', description: 'Select a contact from the list to view details.' },
      filtered: { title: 'No contacts found', description: 'No contacts match your search criteria.' },
    },
  },
  accounts: {
    icon: 'domain',
    title: 'No accounts yet',
    description: 'Create accounts to manage your company relationships and hierarchies.',
    ctaLabel: 'Create account',
    suggestions: ['Add contacts', 'Link opportunities', 'Set account tier'],
    composerPlaceholder: 'Company name...',
    variants: {
      filtered: { title: 'No accounts found', description: 'Try adjusting your search or filters.' },
    },
  },
  deals: {
    icon: 'handshake',
    title: 'No deals yet',
    description: 'Track your sales pipeline from qualification through to close.',
    ctaLabel: 'Create a deal',
    suggestions: ['Set expected close date', 'Add products', 'Assign owner'],
    composerPlaceholder: 'Deal name...',
    variants: {
      selection: { title: 'No deal selected', description: 'Select a deal from the list to view details.' },
      filtered: { title: 'No deals found', description: 'Try adjusting your search or filters.' },
    },
  },
  tickets: {
    icon: 'confirmation_number',
    title: 'No tickets yet',
    description: 'Manage customer support requests and track resolution times.',
    ctaLabel: 'Create ticket',
    suggestions: ['Set priority', 'Assign agent', 'Add SLA policy'],
    composerPlaceholder: 'Ticket subject...',
    variants: {
      selection: { title: 'No ticket selected', description: 'Select a ticket from the list to view details.' },
      filtered: { title: 'No tickets found', description: 'No tickets match your filters.' },
    },
  },
  cases: {
    icon: 'gavel',
    title: 'No cases yet',
    description: 'Track legal matters, disputes, and compliance cases in one place.',
    ctaLabel: 'Open a case',
    suggestions: ['Attach evidence', 'Set deadlines', 'Add stakeholders'],
    composerPlaceholder: 'Case title...',
    variants: {
      selection: { title: 'No case selected', description: 'Select a case from the list to view details.' },
      filtered: { title: 'No cases found', description: 'No cases match your search criteria.' },
    },
  },
  pinned: {
    icon: 'push_pin',
    title: 'No pinned items',
    description: 'Pin your most important records for quick access from the dashboard.',
    ctaLabel: 'Pin an item',
    suggestions: ['Pin a lead', 'Pin a deal', 'Pin a contact'],
    composerPlaceholder: 'Search to pin...',
  },
  insights: {
    icon: 'lightbulb',
    title: 'No insights yet',
    description: 'AI-powered insights will appear here as your CRM data grows.',
    ctaLabel: 'Explore insights',
    suggestions: ['Check lead scores', 'View churn risks', 'See recommendations'],
    composerPlaceholder: 'Search insights...',
    variants: {
      filtered: { title: 'No insights found', description: 'No insights match your current filter. Try a different one.' },
    },
  },
  notifications: {
    icon: 'notifications',
    title: 'No notifications',
    description: "You're all caught up! New notifications will appear here.",
    ctaLabel: 'View settings',
    suggestions: ['Check notification preferences', 'Enable push notifications'],
    composerPlaceholder: '',
    variants: {
      filtered: { title: 'No notifications found', description: 'No notifications match your filters.' },
    },
  },
  comments: {
    icon: 'comment',
    title: 'No comments yet',
    description: 'Be the first to add a comment.',
    ctaLabel: 'Add a comment',
    suggestions: ['Mention a teammate', 'Add a reaction'],
    composerPlaceholder: 'Write a comment...',
  },
  invoices: {
    icon: 'receipt_long',
    title: 'No invoices yet',
    description: 'When you subscribe to a plan or make payments, your invoices will appear here.',
    ctaLabel: 'View plans',
    suggestions: [],
    composerPlaceholder: '',
  },
  receipts: {
    icon: 'receipt',
    title: 'No receipts yet',
    description: 'When you make payments, your receipts will appear here.',
    ctaLabel: 'View billing',
    suggestions: [],
    composerPlaceholder: '',
  },
  'payment-methods': {
    icon: 'credit_card',
    title: 'No payment methods',
    description: 'Add a payment method to manage your subscription and billing.',
    ctaLabel: 'Add payment method',
    suggestions: [],
    composerPlaceholder: '',
  },
  signatures: {
    icon: 'draw',
    title: 'No signatures yet',
    description: 'Request a signature to get started.',
    ctaLabel: 'Request signature',
    suggestions: [],
    composerPlaceholder: '',
  },
  agents: {
    icon: 'smart_toy',
    title: 'No active agents',
    description: 'AI agents will appear here once configured and running.',
    ctaLabel: 'Configure agents',
    suggestions: [],
    composerPlaceholder: '',
    variants: {
      filtered: { title: 'No agents found', description: 'No agents match your current filters.' },
    },
  },
  rules: {
    icon: 'rule',
    title: 'No rules configured',
    description: 'Create your first rule to start automating workflows.',
    ctaLabel: 'Create rule',
    suggestions: [],
    composerPlaceholder: 'Rule name...',
  },
  reports: {
    icon: 'assessment',
    title: 'No reports available',
    description: 'Reports will be generated during pipeline execution.',
    ctaLabel: 'Generate reports',
    suggestions: [],
    composerPlaceholder: '',
  },
  search: {
    icon: 'search_off',
    title: 'No results found',
    description: 'Try different keywords or broader filters.',
    ctaLabel: 'Clear search',
    suggestions: [],
    composerPlaceholder: '',
  },
  experiments: {
    icon: 'science',
    title: 'No experiments yet',
    description: 'Create your first A/B experiment to get started.',
    ctaLabel: 'Create experiment',
    suggestions: [],
    composerPlaceholder: 'Experiment name...',
  },
  products: {
    icon: 'inventory_2',
    title: 'No products added',
    description: 'Add products or line items to this deal.',
    ctaLabel: 'Add product',
    suggestions: [],
    composerPlaceholder: 'Product name...',
  },
  subscriptions: {
    icon: 'credit_card_off',
    title: 'No active subscription',
    description: 'Choose a plan to get started with IntelliFlow CRM and unlock powerful features.',
    ctaLabel: 'View plans',
    suggestions: [],
    composerPlaceholder: '',
  },
};
