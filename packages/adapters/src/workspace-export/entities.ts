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
  {
    name: 'case_types',
    model: 'CaseType',
    description: 'The case types your workspace defined; cases refer to them by caseTypeId.',
  },
  {
    name: 'event_types',
    model: 'EventType',
    description: 'The event types for public booking; appointments refer to them by eventTypeId.',
  },
  {
    name: 'workflow_definitions',
    model: 'WorkflowDefinition',
    description: 'Workflow definitions with their steps.',
  },
  {
    name: 'team_messages',
    model: 'TeamMessage',
    description: 'Team chat messages.',
  },
  {
    name: 'help_articles',
    model: 'HelpArticle',
    description: 'Help articles your workspace wrote (built-in articles are not exported).',
  },
  {
    name: 'help_article_sections',
    model: 'ArticleSection',
    description: 'The sections and their content of your help articles.',
  },
  // Email and messaging
  {
    name: 'emails',
    model: 'EmailRecord',
    description:
      'Email records the whole team may read: sender, recipients, subject, full body, delivery status ' +
      'and open/click counts. Company-mailbox mail, inbound mail nobody owns and mail logged to a ' +
      'lead or contact. Mail in a personal mailbox and drafts are private and not included. ' +
      'Mailbox credentials are not included.',
  },
  {
    name: 'email_attachments',
    model: 'EmailAttachment',
    description:
      'Metadata of the attachments of the exported email (the attached files are in files/).',
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
  // Further records and the configuration your workspace set up. Every tenant model is either
  // here or in excluded-models.ts with a reason (a test enforces it).
  {
    name: 'activity_comments',
    model: 'ActivityComment',
    description:
      'Comments people wrote on activity timeline entries (activityId and activitySource say which entry).',
  },
  {
    name: 'activity_reactions',
    model: 'ActivityReaction',
    description: 'Emoji reactions on activity timeline entries.',
  },
  {
    name: 'sla_policies',
    model: 'SLAPolicy',
    description:
      'SLA policies: response and resolution targets per priority; tickets refer to them by slaPolicyId.',
  },
  {
    name: 'ticket_categories',
    model: 'TicketCategory',
    description: 'Ticket categories (with nested parents and a default SLA policy).',
  },
  {
    name: 'ticket_next_steps',
    model: 'TicketNextStep',
    description: 'Next steps recorded on tickets.',
  },
  {
    name: 'related_tickets',
    model: 'RelatedTicket',
    description: 'Links between related tickets.',
  },
  {
    name: 'feedback_surveys',
    model: 'FeedbackSurvey',
    description: 'Customer feedback surveys and the answers received.',
  },
  {
    name: 'article_feedback',
    model: 'ArticleFeedback',
    description: 'Reader feedback on help articles.',
  },
  { name: 'deal_renewals', model: 'DealRenewal', description: 'Renewal records of deals.' },
  {
    name: 'document_shares',
    model: 'DocumentShare',
    description: 'Who each document was shared with, and with what permission.',
  },
  { name: 'document_tags', model: 'DocumentTag', description: 'Tags available on documents.' },
  {
    name: 'document_type_definitions',
    model: 'DocumentTypeDefinition',
    description: 'The document types your workspace defined.',
  },
  {
    name: 'document_retention_policies',
    model: 'DocumentRetentionPolicy',
    description: 'Document retention policies.',
  },
  {
    name: 'document_general_config',
    model: 'DocumentGeneralConfig',
    description: 'General document settings.',
  },
  {
    name: 'calendar_event_links',
    model: 'CalendarEventLink',
    description: 'Links between calendar events and the records they belong to.',
  },
  {
    name: 'availability_hours',
    model: 'AvailabilityHour',
    description: 'Weekly availability hours used for booking.',
  },
  {
    name: 'availability_closures',
    model: 'AvailabilityClosure',
    description: 'Closure dates (holidays, time off) used for booking.',
  },
  {
    name: 'appointment_settings',
    model: 'AppointmentSettings',
    description: 'Appointment and booking settings.',
  },
  {
    name: 'contact_types',
    model: 'ContactType',
    description: 'The contact types your workspace defined.',
  },
  {
    name: 'contact_type_default_tags',
    model: 'ContactTypeDefaultTag',
    description: 'Default tags applied to each contact type.',
  },
  {
    name: 'case_type_checklist_items',
    model: 'CaseTypeChecklistItem',
    description: 'Checklist items of each case type.',
  },
  { name: 'case_settings', model: 'CaseSettings', description: 'Case settings.' },
  {
    name: 'account_industry_options',
    model: 'AccountIndustryOption',
    description: 'Industry choices offered on accounts.',
  },
  {
    name: 'account_tier_definitions',
    model: 'AccountTierDefinition',
    description: 'Account tier definitions.',
  },
  {
    name: 'account_tier_config',
    model: 'AccountTierConfig',
    description: 'Account tier settings.',
  },
  {
    name: 'account_hierarchy_config',
    model: 'AccountHierarchyConfig',
    description: 'Account hierarchy settings.',
  },
  { name: 'account_territories', model: 'AccountTerritory', description: 'Account territories.' },
  {
    name: 'account_territory_members',
    model: 'AccountTerritoryMember',
    description: 'Who belongs to each account territory.',
  },
  {
    name: 'account_territory_rules',
    model: 'AccountTerritoryRule',
    description: 'Rules that assign accounts to territories.',
  },
  {
    name: 'account_required_fields',
    model: 'AccountRequiredField',
    description: 'Which account fields are required.',
  },
  {
    name: 'contact_required_fields',
    model: 'ContactRequiredField',
    description: 'Which contact fields are required.',
  },
  {
    name: 'deal_required_fields',
    model: 'DealRequiredField',
    description: 'Which deal fields are required.',
  },
  {
    name: 'case_required_fields',
    model: 'CaseRequiredField',
    description: 'Which case fields are required.',
  },
  {
    name: 'ticket_required_fields',
    model: 'TicketRequiredField',
    description: 'Which ticket fields are required.',
  },
  {
    name: 'document_required_fields',
    model: 'DocumentRequiredField',
    description: 'Which document fields are required.',
  },
  {
    name: 'account_duplicate_rules',
    model: 'AccountDuplicateRule',
    description: 'Duplicate detection rules for accounts.',
  },
  {
    name: 'contact_duplicate_rules',
    model: 'ContactDuplicateRule',
    description: 'Duplicate detection rules for contacts.',
  },
  {
    name: 'deal_duplicate_rules',
    model: 'DealDuplicateRule',
    description: 'Duplicate detection rules for deals.',
  },
  {
    name: 'case_duplicate_rules',
    model: 'CaseDuplicateRule',
    description: 'Duplicate detection rules for cases.',
  },
  {
    name: 'ticket_duplicate_rules',
    model: 'TicketDuplicateRule',
    description: 'Duplicate detection rules for tickets.',
  },
  {
    name: 'document_duplicate_rules',
    model: 'DocumentDuplicateRule',
    description: 'Duplicate detection rules for documents.',
  },
  {
    name: 'account_automation_settings',
    model: 'AccountAutomationSetting',
    description: 'Automation settings for accounts.',
  },
  {
    name: 'contact_automation_settings',
    model: 'ContactAutomationSetting',
    description: 'Automation settings for contacts.',
  },
  {
    name: 'lead_automation_settings',
    model: 'LeadAutomationSetting',
    description: 'Automation settings for leads.',
  },
  {
    name: 'deal_automation_settings',
    model: 'DealAutomationSetting',
    description: 'Automation settings for deals.',
  },
  {
    name: 'case_automation_settings',
    model: 'CaseAutomationSetting',
    description: 'Automation settings for cases.',
  },
  {
    name: 'ticket_automation_settings',
    model: 'TicketAutomationSetting',
    description: 'Automation settings for tickets.',
  },
  {
    name: 'document_automation_settings',
    model: 'DocumentAutomationSetting',
    description: 'Automation settings for documents.',
  },
  {
    name: 'task_automation_settings',
    model: 'TaskAutomationSetting',
    description: 'Automation settings for tasks.',
  },
  {
    name: 'task_automation_tags',
    model: 'TaskAutomationTag',
    description: 'Tags used by task automation.',
  },
  { name: 'task_settings', model: 'TaskSettings', description: 'Task settings.' },
  {
    name: 'lead_scoring_rules',
    model: 'LeadScoringRule',
    description: 'Lead scoring rules you configured.',
  },
  {
    name: 'deal_scoring_rules',
    model: 'DealScoringRule',
    description: 'Deal scoring rules you configured.',
  },
  { name: 'routing_rules', model: 'RoutingRule', description: 'Lead and ticket routing rules.' },
  { name: 'approval_policies', model: 'ApprovalPolicy', description: 'Approval policies.' },
  {
    name: 'approval_policy_assignments',
    model: 'ApprovalPolicyAssignment',
    description: 'Which approval policy applies to whom.',
  },
  { name: 'business_rules', model: 'BusinessRule', description: 'Business rules you configured.' },
  {
    name: 'custom_node_types',
    model: 'CustomNodeType',
    description: 'Custom workflow node types.',
  },
  { name: 'agent_skills', model: 'AgentSkill', description: 'Support agent skills.' },
  {
    name: 'agent_availability',
    model: 'AgentAvailability',
    description: 'Support agent availability.',
  },
  { name: 'report_definitions', model: 'ReportDefinition', description: 'Report definitions.' },
  { name: 'report_templates', model: 'ReportTemplate', description: 'Report templates.' },
  { name: 'report_schedules', model: 'ReportSchedule', description: 'Scheduled reports.' },
  {
    name: 'report_schedule_tags',
    model: 'ReportScheduleTag',
    description: 'Tags on scheduled reports.',
  },
  { name: 'report_settings', model: 'ReportSettings', description: 'Report settings.' },
  {
    name: 'dashboard_configs',
    model: 'DashboardConfig',
    description: 'Dashboard layouts and widgets.',
  },
  {
    name: 'notification_preferences',
    model: 'NotificationPreference',
    description: 'Notification preferences per user.',
  },
  {
    name: 'tenant_goal_defaults',
    model: 'TenantGoalDefault',
    description: 'Default goals of the workspace.',
  },
  {
    name: 'tenant_email_settings',
    model: 'TenantEmailSettings',
    description: 'Workspace email settings (tracking, bounce handling, reply-to).',
  },
  {
    name: 'case_document_acl',
    model: 'CaseDocumentACL',
    description: 'Who may access each case document.',
  },
  {
    name: 'notification_templates',
    model: 'NotificationTemplate',
    description: 'Notification templates your workspace customised.',
  },
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
