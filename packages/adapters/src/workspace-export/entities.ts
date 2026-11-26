/**
 * What a whole-workspace export contains: one CSV and one JSON per entity the tenant owns.
 *
 * Every entity is a tenant-owned Prisma model (a `tenantId` column; a test checks it against
 * TENANT_MODELS), exported with all of its scalar columns except the deny-list. The README in the
 * archive is generated from `description`, so a file is never in the ZIP without being explained.
 *
 * Not exported, and said so in the README: AI embeddings and derived scores, audit and security
 * logs, webhook and API-key tables, mailbox credentials, sessions, billing records (Stripe holds
 * the customer's invoices) and other platform plumbing that is not the customer's own data.
 */

export interface ExportEntity {
  /** File base name: data/<name>.csv and data/<name>.json. */
  readonly name: string;
  /** Prisma model name (key of TENANT_MODELS). */
  readonly model: string;
  /** What the file holds, for the README. */
  readonly description: string;
  /** Columns holding a stored-file URL: the query string is dropped (it can carry a token). */
  readonly urlColumns?: readonly string[];
}

export const EXPORT_ENTITIES: readonly ExportEntity[] = [
  // Sales records
  {
    name: 'leads',
    model: 'Lead',
    description: 'Leads: contact details, source, status, score, tags and UTM attribution.',
  },
  {
    name: 'contacts',
    model: 'Contact',
    description: 'Contacts (people), their company link, status and tags.',
  },
  {
    name: 'accounts',
    model: 'Account',
    description: 'Accounts (companies): industry, size, region, tags and parent account.',
  },
  {
    name: 'deals',
    model: 'Opportunity',
    description:
      'Deals (opportunities): value, stage, probability, expected and actual close dates.',
  },
  {
    name: 'deal_products',
    model: 'DealProduct',
    description: 'Line items (products) on each deal.',
  },
  {
    name: 'tasks',
    model: 'Task',
    description:
      'Tasks with owner, assignee, due date, status and the lead, contact or deal they belong to.',
  },
  { name: 'case_tasks', model: 'CaseTask', description: 'Tasks that belong to a case.' },
  // Notes and activity
  { name: 'lead_notes', model: 'LeadNote', description: 'Notes written on leads.' },
  { name: 'contact_notes', model: 'ContactNote', description: 'Notes written on contacts.' },
  {
    name: 'lead_activities',
    model: 'LeadActivity',
    description: 'The activity timeline of each lead (calls, emails, meetings, status changes).',
  },
  {
    name: 'contact_activities',
    model: 'ContactActivity',
    description: 'The activity timeline of each contact.',
  },
  {
    name: 'deal_activities',
    model: 'ActivityEvent',
    description: 'The activity timeline of each deal (stage changes, attachments, agent actions).',
  },
  // Calendar
  { name: 'calendars', model: 'Calendar', description: 'Calendars and their owners.' },
  {
    name: 'calendar_events',
    model: 'CalendarEvent',
    description: 'Calendar events with attendees and location.',
  },
  {
    name: 'appointments',
    model: 'Appointment',
    description: 'Appointments and bookings, including booker details and recurrence.',
  },
  {
    name: 'appointment_attendees',
    model: 'AppointmentAttendee',
    description: 'Which users attend which appointment.',
  },
  {
    name: 'appointment_cases',
    model: 'AppointmentCase',
    description: 'Which cases each appointment is linked to.',
  },
  // Email and messaging
  {
    name: 'emails',
    model: 'EmailRecord',
    description:
      'Email records: sender, recipients, subject, full body, delivery status and open/click counts. Mailbox credentials are not included.',
  },
  {
    name: 'email_attachments',
    model: 'EmailAttachment',
    description: 'Metadata of email attachments (the attached files are in files/).',
    urlColumns: ['fileUrl'],
  },
  { name: 'email_templates', model: 'EmailTemplate', description: 'Email templates.' },
  { name: 'email_signatures', model: 'EmailSignature', description: 'Email signatures.' },
  {
    name: 'chat_conversations',
    model: 'ChatConversation',
    description: 'Chat conversations with customers.',
  },
  {
    name: 'chat_messages',
    model: 'ChatMessage',
    description: 'Messages inside chat conversations.',
  },
  {
    name: 'call_records',
    model: 'CallRecord',
    description:
      'Call log: numbers, duration, outcome, notes and transcript. Recording links are not included.',
  },
  // Support
  {
    name: 'tickets',
    model: 'Ticket',
    description: 'Support tickets with status, priority, SLA dates and requester.',
  },
  {
    name: 'ticket_activities',
    model: 'TicketActivity',
    description: 'Replies, internal notes and system events on each ticket.',
  },
  {
    name: 'ticket_attachments',
    model: 'TicketAttachment',
    description: 'Metadata of files attached to tickets.',
    urlColumns: ['url'],
  },
  {
    name: 'cases',
    model: 'Case',
    description: 'Cases (legal matters) with client, assignee, deadline and resolution.',
  },
  // Files (metadata; the stored files themselves are under files/)
  {
    name: 'documents',
    model: 'Document',
    description: 'Document library records: name, category, version and extracted text.',
    urlColumns: ['fileUrl'],
  },
  {
    name: 'case_documents',
    model: 'CaseDocument',
    description:
      'Case document records with version, classification, retention and signature details.',
  },
  {
    name: 'lead_files',
    model: 'LeadFile',
    description: 'Metadata of files attached to leads.',
    urlColumns: ['url'],
  },
  {
    name: 'deal_files',
    model: 'DealFile',
    description: 'Metadata of files attached to deals.',
    urlColumns: ['url'],
  },
  // Configuration the customer set up
  {
    name: 'pipeline_stages',
    model: 'PipelineStageConfig',
    description: 'Deal pipeline stage definitions: key, name, colour, order and probability.',
  },
  { name: 'lead_stages', model: 'LeadStageConfig', description: 'Lead stage definitions.' },
  {
    name: 'deal_win_loss_reasons',
    model: 'DealWinLossReason',
    description: 'Win and loss reasons offered on deals.',
  },
  {
    name: 'account_custom_fields',
    model: 'AccountCustomField',
    description: 'Custom field definitions for accounts.',
  },
  {
    name: 'lead_custom_fields',
    model: 'LeadCustomField',
    description: 'Custom field definitions for leads.',
  },
  { name: 'account_tags', model: 'AccountTag', description: 'Tags available on accounts.' },
  { name: 'contact_tags', model: 'ContactTag', description: 'Tags available on contacts.' },
  { name: 'deal_tags', model: 'DealTag', description: 'Tags available on deals.' },
  { name: 'ticket_tags', model: 'TicketTag', description: 'Tags available on tickets.' },
  { name: 'case_tags', model: 'CaseTag', description: 'Tags available on cases.' },
  // People
  { name: 'teams', model: 'Team', description: 'Teams.' },
  { name: 'team_members', model: 'TeamMember', description: 'Team membership.' },
];

/**
 * The users of the workspace. A user row is not tenant-filtered by the tenant client (members of
 * a tenant can live in another home tenant), so they are read by explicit predicate, and exported
 * with an allow-list of columns instead of a deny-list.
 */
export const USER_EXPORT = {
  name: 'users',
  model: 'User',
  description:
    'Users of the workspace (home users and members): name, email, role, locale, last sign-in. ' +
    'No password, session, MFA or billing data.',
  columns: [
    'id',
    'email',
    'name',
    'givenName',
    'familyName',
    'role',
    'timezone',
    'locale',
    'phone',
    'company',
    'department',
    'location',
    'emailVerified',
    'lastSignInAt',
    'signInCount',
    'createdAt',
    'updatedAt',
    // No home tenantId: a member's home workspace is another customer's id.
  ],
} as const;

export const MEMBERSHIP_EXPORT = {
  name: 'memberships',
  model: 'TenantMembership',
  description: 'Who has access to the workspace, with role, source, expiry and revocation.',
  columns: [
    'id',
    'userId',
    'tenantId',
    'role',
    'source',
    'pinned',
    'expiresAt',
    'revokedAt',
    'createdAt',
    'updatedAt',
  ],
} as const;

/** The workspace's own record (name, slug, plan), written as workspace.json. */
export const TENANT_COLUMNS = [
  'id',
  'name',
  'slug',
  'status',
  'plan',
  'trialEndsAt',
  'createdAt',
  'updatedAt',
] as const;

/** Private buckets whose `<tenantId>/` folder is copied into files/. */
export const DEFAULT_EXPORT_FILE_BUCKETS: readonly string[] = [
  'email-attachments',
  'case-documents',
];
