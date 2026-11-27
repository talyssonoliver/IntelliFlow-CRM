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
  /** The columns that identify a row, when the model has no `id` (a composite key). */
  readonly keyColumns?: readonly string[];
  /** Columns holding a stored-file URL: the query string is dropped (it can carry a token). */
  readonly urlColumns?: readonly string[];
}

/**
 * One row per exported entity: `file name|Prisma model|description`. A plain table (not an array
 * of object literals) so adding an entity is one line, and the stored-file URL columns and the
 * composite keys that a few entities need are listed beside it.
 */
const ENTITY_TABLE = `
leads|Lead|Leads: contact details, source, status, score, tags and UTM attribution.
contacts|Contact|Contacts (people), their company link, status and tags.
accounts|Account|Accounts (companies): industry, size, region, tags and parent account.
deals|Opportunity|Deals (opportunities): value, stage, probability, expected and actual close dates.
deal_products|DealProduct|Line items (products) on each deal.
tasks|Task|Tasks with owner, assignee, due date, status and the lead, contact or deal they belong to.
case_tasks|CaseTask|Tasks that belong to a case.
lead_notes|LeadNote|Notes written on leads.
contact_notes|ContactNote|Notes written on contacts.
lead_activities|LeadActivity|The activity timeline of each lead (calls, emails, meetings, status changes).
contact_activities|ContactActivity|The activity timeline of each contact.
deal_activities|ActivityEvent|The activity timeline of each deal (stage changes, attachments, agent actions).
calendars|Calendar|Calendars and their owners.
calendar_events|CalendarEvent|Calendar events with attendees and location.
appointments|Appointment|Appointments and bookings, including booker details and recurrence.
appointment_attendees|AppointmentAttendee|Which users attend which appointment.
appointment_cases|AppointmentCase|Which cases each appointment is linked to.
case_types|CaseType|The case types your workspace defined; cases refer to them by caseTypeId.
event_types|EventType|The event types for public booking; appointments refer to them by eventTypeId.
workflow_definitions|WorkflowDefinition|Workflow definitions with their steps.
team_messages|TeamMessage|Team chat messages.
help_articles|HelpArticle|Help articles your workspace wrote (built-in articles are not exported).
help_article_sections|ArticleSection|The sections and their content of your help articles.
emails|EmailRecord|Email records the whole team may read: sender, recipients, subject, full body, delivery status and open/click counts. Company-mailbox mail, inbound mail nobody owns and mail logged to a lead or contact. Mail in a personal mailbox and drafts are private and not included. Mailbox credentials are not included.
email_attachments|EmailAttachment|Metadata of the attachments of the exported email (the attached files are in files/).
email_templates|EmailTemplate|Email templates.
email_signatures|EmailSignature|Email signatures.
chat_conversations|ChatConversation|Chat conversations with customers.
chat_messages|ChatMessage|Messages inside chat conversations.
call_records|CallRecord|Call log: numbers, duration, outcome, notes and transcript. Recording links are not included.
tickets|Ticket|Support tickets with status, priority, SLA dates and requester.
ticket_activities|TicketActivity|Replies, internal notes and system events on each ticket.
ticket_attachments|TicketAttachment|Metadata of files attached to tickets.
cases|Case|Cases (legal matters) with client, assignee, deadline and resolution.
documents|Document|Document library records: name, category, version and extracted text.
case_documents|CaseDocument|Case document records with version, classification, retention and signature details.
lead_files|LeadFile|Metadata of files attached to leads.
deal_files|DealFile|Metadata of files attached to deals.
pipeline_stages|PipelineStageConfig|Deal pipeline stage definitions: key, name, colour, order and probability.
lead_stages|LeadStageConfig|Lead stage definitions.
deal_win_loss_reasons|DealWinLossReason|Win and loss reasons offered on deals.
account_custom_fields|AccountCustomField|Custom field definitions for accounts.
lead_custom_fields|LeadCustomField|Custom field definitions for leads.
account_tags|AccountTag|Tags available on accounts.
contact_tags|ContactTag|Tags available on contacts.
deal_tags|DealTag|Tags available on deals.
ticket_tags|TicketTag|Tags available on tickets.
case_tags|CaseTag|Tags available on cases.
activity_comments|ActivityComment|Comments people wrote on activity timeline entries (activityId and activitySource say which entry).
activity_reactions|ActivityReaction|Emoji reactions on activity timeline entries.
sla_policies|SLAPolicy|SLA policies: response and resolution targets per priority; tickets refer to them by slaPolicyId.
ticket_categories|TicketCategory|Ticket categories (with nested parents and a default SLA policy).
ticket_next_steps|TicketNextStep|Next steps recorded on tickets.
related_tickets|RelatedTicket|Links between related tickets.
feedback_surveys|FeedbackSurvey|Customer feedback surveys and the answers received.
article_feedback|ArticleFeedback|Reader feedback on help articles.
deal_renewals|DealRenewal|Renewal records of deals.
document_shares|DocumentShare|Who each document was shared with, and with what permission.
document_tags|DocumentTag|Tags available on documents.
document_type_definitions|DocumentTypeDefinition|The document types your workspace defined.
document_retention_policies|DocumentRetentionPolicy|Document retention policies.
document_general_config|DocumentGeneralConfig|General document settings.
calendar_event_links|CalendarEventLink|Links between calendar events and the records they belong to.
availability_hours|AvailabilityHour|Weekly availability hours used for booking.
availability_closures|AvailabilityClosure|Closure dates (holidays, time off) used for booking.
appointment_settings|AppointmentSettings|Appointment and booking settings.
contact_types|ContactType|The contact types your workspace defined.
contact_type_default_tags|ContactTypeDefaultTag|Default tags applied to each contact type.
case_type_checklist_items|CaseTypeChecklistItem|Checklist items of each case type.
case_settings|CaseSettings|Case settings.
account_industry_options|AccountIndustryOption|Industry choices offered on accounts.
account_tier_definitions|AccountTierDefinition|Account tier definitions.
account_tier_config|AccountTierConfig|Account tier settings.
account_hierarchy_config|AccountHierarchyConfig|Account hierarchy settings.
account_territories|AccountTerritory|Account territories.
account_territory_members|AccountTerritoryMember|Who belongs to each account territory.
account_territory_rules|AccountTerritoryRule|Rules that assign accounts to territories.
account_required_fields|AccountRequiredField|Which account fields are required.
contact_required_fields|ContactRequiredField|Which contact fields are required.
deal_required_fields|DealRequiredField|Which deal fields are required.
case_required_fields|CaseRequiredField|Which case fields are required.
ticket_required_fields|TicketRequiredField|Which ticket fields are required.
document_required_fields|DocumentRequiredField|Which document fields are required.
account_duplicate_rules|AccountDuplicateRule|Duplicate detection rules for accounts.
contact_duplicate_rules|ContactDuplicateRule|Duplicate detection rules for contacts.
deal_duplicate_rules|DealDuplicateRule|Duplicate detection rules for deals.
case_duplicate_rules|CaseDuplicateRule|Duplicate detection rules for cases.
ticket_duplicate_rules|TicketDuplicateRule|Duplicate detection rules for tickets.
document_duplicate_rules|DocumentDuplicateRule|Duplicate detection rules for documents.
account_automation_settings|AccountAutomationSetting|Automation settings for accounts.
contact_automation_settings|ContactAutomationSetting|Automation settings for contacts.
lead_automation_settings|LeadAutomationSetting|Automation settings for leads.
deal_automation_settings|DealAutomationSetting|Automation settings for deals.
case_automation_settings|CaseAutomationSetting|Automation settings for cases.
ticket_automation_settings|TicketAutomationSetting|Automation settings for tickets.
document_automation_settings|DocumentAutomationSetting|Automation settings for documents.
task_automation_settings|TaskAutomationSetting|Automation settings for tasks.
task_automation_tags|TaskAutomationTag|Tags used by task automation.
task_settings|TaskSettings|Task settings.
lead_scoring_rules|LeadScoringRule|Lead scoring rules you configured.
deal_scoring_rules|DealScoringRule|Deal scoring rules you configured.
routing_rules|RoutingRule|Lead and ticket routing rules.
approval_policies|ApprovalPolicy|Approval policies.
approval_policy_assignments|ApprovalPolicyAssignment|Which approval policy applies to whom.
business_rules|BusinessRule|Business rules you configured.
custom_node_types|CustomNodeType|Custom workflow node types.
agent_skills|AgentSkill|Support agent skills.
agent_availability|AgentAvailability|Support agent availability.
report_definitions|ReportDefinition|Report definitions.
report_templates|ReportTemplate|Report templates.
report_schedules|ReportSchedule|Scheduled reports.
report_schedule_tags|ReportScheduleTag|Tags on scheduled reports.
report_settings|ReportSettings|Report settings.
dashboard_configs|DashboardConfig|Dashboard layouts and widgets.
notification_preferences|NotificationPreference|Notification preferences per user.
tenant_goal_defaults|TenantGoalDefault|Default goals of the workspace.
tenant_email_settings|TenantEmailSettings|Workspace email settings (tracking, bounce handling, reply-to).
case_document_acl|CaseDocumentACL|Who may access each case document.
notification_templates|NotificationTemplate|Notification templates your workspace customised.
task_automation_rules|TaskAutomationRule|Task automation rules: trigger, filter, schedule and actions. Webhook tokens and secrets are not included.
email_suppressions|EmailSuppression|Addresses your workspace no longer sends email to (hard bounces and ones added by hand), with the reason.
teams|Team|Teams.
team_members|TeamMember|Team membership.
`;

/** Columns that hold a stored-file URL, by file name. */
const URL_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  email_attachments: ['fileUrl'],
  ticket_attachments: ['url'],
  documents: ['fileUrl'],
  lead_files: ['url'],
  deal_files: ['url'],
};

/** The key columns of the models that have no `id`, by file name. */
const KEY_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  contact_type_default_tags: ['contactTypeId', 'contactTagId'],
};

export const EXPORT_ENTITIES: readonly ExportEntity[] = ENTITY_TABLE.trim()
  .split('\n')
  .map((line) => {
    const [name, model, description] = line.split('|') as [string, string, string];
    const entity: ExportEntity = { name, model, description };
    const urlColumns = URL_COLUMNS[name];
    const keyColumns = KEY_COLUMNS[name];
    return { ...entity, ...(urlColumns && { urlColumns }), ...(keyColumns && { keyColumns }) };
  });

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

/**
 * The email-attachments bucket, named as the storage adapter names it (the same env override and
 * default), so the export and the adapter that wrote the files can never disagree.
 */
export function resolveEmailAttachmentsBucket(
  env: Record<string, string | undefined> = process.env
): string {
  return env['EMAIL_ATTACHMENTS_BUCKET'] || 'email-attachments';
}

/** Private buckets whose `<tenantId>/` folder is copied into files/. */
export function defaultExportFileBuckets(
  emailAttachmentsBucket: string = resolveEmailAttachmentsBucket()
): readonly string[] {
  return [emailAttachmentsBucket, 'case-documents'];
}
