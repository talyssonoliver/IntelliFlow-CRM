import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  SLA_STATUSES,
  type TicketPriority,
  type TicketStatus,
  type SLAStatus,
} from '@intelliflow/domain';
import type {
  TicketActivity,
  TicketAttachment,
  TicketDetailData,
  TicketListItem,
  TicketRelated,
} from '@/components/tickets/types';
import { normalizeAvatarSource } from '@/lib/shared/avatar-utils';
import { formatTimeAgo } from '@/lib/shared/date-utils';

type UnknownRecord = Record<string, unknown>;

const DEFAULT_RESPONSE_TARGETS: Record<TicketPriority, number> = {
  CRITICAL: 15,
  HIGH: 60,
  MEDIUM: 240,
  LOW: 480,
};

const DEFAULT_RESOLUTION_TARGETS: Record<TicketPriority, number> = {
  CRITICAL: 120,
  HIGH: 480,
  MEDIUM: 1440,
  LOW: 4320,
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function firstNonEmpty(values: string[], fallback = ''): string {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isUuidOrCuid(value: string): boolean {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
  const isCuid = /^c[a-z0-9]{8,}$/i.test(value);
  return isUuid || isCuid;
}

function sanitizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (isUuidOrCuid(trimmed)) {
    return '';
  }

  // Discard placeholders/identifiers such as "0" or all-digit values.
  if (!/\p{L}/u.test(trimmed)) {
    return '';
  }

  return trimmed;
}

function sanitizeAssigneeTitle(value: unknown, fallback = 'Support Agent'): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (isUuidOrCuid(trimmed)) {
    return fallback;
  }

  if (!/\p{L}/u.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function toTicketStatus(value: unknown): TicketStatus {
  if (typeof value === 'string' && (TICKET_STATUSES as readonly string[]).includes(value)) {
    return value as TicketStatus;
  }
  return 'OPEN';
}

function toTicketPriority(value: unknown): TicketPriority {
  if (typeof value === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(value)) {
    return value as TicketPriority;
  }
  return 'MEDIUM';
}

function toSlaStatus(value: unknown): SLAStatus | null {
  if (typeof value === 'string' && (SLA_STATUSES as readonly string[]).includes(value)) {
    return value as SLAStatus;
  }
  return null;
}

function inferSlaStatus(
  status: TicketStatus,
  resolutionRemaining: number,
  resolutionDue: Date | null
): SLAStatus {
  if (status === 'RESOLVED' || status === 'CLOSED') {
    return 'MET';
  }
  if (!resolutionDue) {
    return 'ON_TRACK';
  }
  if (resolutionRemaining < 0) {
    return 'BREACHED';
  }
  if (resolutionRemaining <= 120) {
    return 'AT_RISK';
  }
  return 'ON_TRACK';
}

function getResponseTarget(priority: TicketPriority, policy: UnknownRecord): number {
  switch (priority) {
    case 'CRITICAL':
      return asNumber(policy.criticalResponseMinutes, DEFAULT_RESPONSE_TARGETS.CRITICAL);
    case 'HIGH':
      return asNumber(policy.highResponseMinutes, DEFAULT_RESPONSE_TARGETS.HIGH);
    case 'MEDIUM':
      return asNumber(policy.mediumResponseMinutes, DEFAULT_RESPONSE_TARGETS.MEDIUM);
    case 'LOW':
      return asNumber(policy.lowResponseMinutes, DEFAULT_RESPONSE_TARGETS.LOW);
  }
}

function getResolutionTarget(priority: TicketPriority, policy: UnknownRecord): number {
  switch (priority) {
    case 'CRITICAL':
      return asNumber(policy.criticalResolutionMinutes, DEFAULT_RESOLUTION_TARGETS.CRITICAL);
    case 'HIGH':
      return asNumber(policy.highResolutionMinutes, DEFAULT_RESOLUTION_TARGETS.HIGH);
    case 'MEDIUM':
      return asNumber(policy.mediumResolutionMinutes, DEFAULT_RESOLUTION_TARGETS.MEDIUM);
    case 'LOW':
      return asNumber(policy.lowResolutionMinutes, DEFAULT_RESOLUTION_TARGETS.LOW);
  }
}

function minutesUntil(dueAt: Date | null): number {
  if (!dueAt) {
    return 0;
  }
  return Math.floor((dueAt.getTime() - Date.now()) / (1000 * 60));
}

function minutesBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) {
    return null;
  }
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60)));
}

function toDisplayTime(date: Date | null): string {
  if (!date) {
    return 'Unknown';
  }
  return formatTimeAgo(date);
}

function toActivityType(activityType: string, content: string): TicketActivity['type'] {
  switch (activityType) {
    case 'CUSTOMER_MESSAGE':
      return 'customer_message';
    case 'AGENT_REPLY':
      return 'agent_reply';
    case 'INTERNAL_NOTE':
      return 'internal_note';
    case 'SLA_ALERT':
      return 'sla_breach';
    case 'STATUS_CHANGE':
      return content.toLowerCase().includes('priority') ? 'priority_change' : 'system_event';
    case 'ASSIGNMENT':
    case 'SYSTEM_EVENT':
    default:
      return 'system_event';
  }
}

function toActivityRole(authorRole: string): TicketActivity['author']['role'] {
  const normalized = authorRole.toLowerCase();
  if (normalized.includes('customer')) {
    return 'customer';
  }
  if (normalized.includes('agent') || normalized.includes('support')) {
    return 'agent';
  }
  if (normalized.includes('devops')) {
    return 'devops';
  }
  return 'system';
}

function inferAttachmentType(name: string, fileType: string): string {
  const lowerName = name.toLowerCase();
  const lowerType = fileType.toLowerCase();

  if (lowerType.includes('pdf') || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }

  if (
    lowerType.includes('image') ||
    lowerType.includes('png') ||
    lowerType.includes('jpg') ||
    lowerType.includes('jpeg') ||
    lowerType.includes('gif') ||
    lowerType.includes('webp') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.gif') ||
    lowerName.endsWith('.webp')
  ) {
    return 'image';
  }

  return 'file';
}

function initialsFromName(name: string): string {
  const pieces = name.split(' ').filter(Boolean);
  if (pieces.length === 0) {
    return 'U';
  }
  if (pieces.length === 1) {
    return pieces[0].charAt(0).toUpperCase();
  }
  return `${pieces[0].charAt(0)}${pieces[1].charAt(0)}`.toUpperCase();
}

function parseSuggestedSolutions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string');
      }
    } catch {
      // Keep as single line suggestion when not valid JSON.
      return value.length > 0 ? [value] : [];
    }
  }

  return [];
}

function inferCompanyFromEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return '';
  }

  const domain = email
    .slice(atIndex + 1)
    .trim()
    .toLowerCase();
  const base = domain.split('.')[0] || '';
  if (!base) {
    return '';
  }

  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function parseSentiment(value: unknown): 'positive' | 'neutral' | 'negative' {
  if (value === 'positive' || value === 'neutral' || value === 'negative') {
    return value;
  }
  return 'neutral';
}

function inferEscalationRisk(slaStatus: SLAStatus): 'low' | 'medium' | 'high' {
  if (slaStatus === 'BREACHED') {
    return 'high';
  }
  if (slaStatus === 'AT_RISK') {
    return 'medium';
  }
  return 'low';
}

function normalizeChannel(value: unknown): string {
  const channel = asString(value, 'PORTAL').toLowerCase();
  if (channel === 'email' || channel === 'phone' || channel === 'chat' || channel === 'portal') {
    return channel;
  }
  return 'portal';
}

function mapActivities(rawActivities: unknown, ticketId: string): TicketActivity[] {
  const entries = Array.isArray(rawActivities) ? rawActivities : [];

  return entries.map((entry, index) => {
    const activity = asRecord(entry);
    const authorName = asString(activity.authorName, 'System');
    const authorRole = asString(activity.authorRole, 'System');
    const content = asString(activity.content, '');
    const channel = asString(activity.channel, '').toLowerCase();
    const timestamp = asDate(activity.timestamp);

    return {
      id: asString(activity.id, `${ticketId}-activity-${index + 1}`),
      type: toActivityType(asString(activity.type), content),
      author: {
        name: authorName,
        role: toActivityRole(authorRole),
        avatar: normalizeAvatarSource(asOptionalString(activity.authorAvatar)) ?? undefined,
      },
      content: content || 'Activity recorded',
      timestamp: timestamp ? timestamp.toLocaleString() : 'Unknown',
      metadata: channel
        ? {
            via: channel,
          }
        : undefined,
    };
  });
}

function mapAttachments(rawAttachments: unknown, ticketId: string): TicketAttachment[] {
  const entries = Array.isArray(rawAttachments) ? rawAttachments : [];

  return entries.map((entry, index) => {
    const attachment = asRecord(entry);
    const name = asString(attachment.name, `Attachment ${index + 1}`);
    const fileType = asString(attachment.fileType);

    return {
      id: asString(attachment.id, `${ticketId}-attachment-${index + 1}`),
      name,
      size: asString(attachment.size, 'Unknown size'),
      type: inferAttachmentType(name, fileType),
      uploader: asString(attachment.uploader, 'Support Team'),
    };
  });
}

function mapRelatedTickets(rawRelated: unknown): TicketRelated[] {
  const entries = Array.isArray(rawRelated) ? rawRelated : [];
  return entries.map((entry) => {
    const related = asRecord(entry);
    return {
      id: asString(related.relatedId, asString(related.id, 'unknown-related')),
      subject: asString(related.relatedSubject, asString(related.subject, 'Related ticket')),
      status: toTicketStatus(related.relatedStatus ?? related.status),
      similarity: asNumber(related.similarity, 0),
    };
  });
}

function inferFirstResponseAt(
  explicitFirstResponseAt: Date | null,
  rawActivities: unknown
): Date | null {
  if (explicitFirstResponseAt) {
    return explicitFirstResponseAt;
  }

  if (!Array.isArray(rawActivities)) {
    return null;
  }

  let earliestAgentReplyAt: Date | null = null;

  for (const rawActivity of rawActivities) {
    const activity = asRecord(rawActivity);
    if (asString(activity.type) !== 'AGENT_REPLY') {
      continue;
    }

    const timestamp = asDate(activity.timestamp);
    if (!timestamp) {
      continue;
    }

    if (!earliestAgentReplyAt || timestamp.getTime() < earliestAgentReplyAt.getTime()) {
      earliestAgentReplyAt = timestamp;
    }
  }

  return earliestAgentReplyAt;
}

function formatMinutesCompact(totalMinutes: number): string {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function inferPredictedResolutionTime(
  rawPredictedResolutionTime: unknown,
  status: TicketStatus,
  resolutionRemaining: number,
  resolutionDue: Date | null,
  resolutionTarget: number
): string {
  const configured = asString(rawPredictedResolutionTime).trim();
  if (configured && configured.toLowerCase() !== 'unknown') {
    return configured;
  }

  if (status === 'RESOLVED' || status === 'CLOSED') {
    return 'Resolved';
  }

  if (!resolutionDue) {
    return `~${formatMinutesCompact(resolutionTarget)} target`;
  }

  if (resolutionRemaining < 0) {
    return `Overdue by ${formatMinutesCompact(Math.abs(resolutionRemaining))}`;
  }

  if (resolutionRemaining === 0) {
    return 'Due now';
  }

  return `${formatMinutesCompact(resolutionRemaining)} remaining`;
}

export function mapTicketToListItem(rawTicket: unknown): TicketListItem {
  const ticket = asRecord(rawTicket);
  const assignee = asRecord(ticket.assignee);

  const status = toTicketStatus(ticket.status);
  const priority = toTicketPriority(ticket.priority);
  const responseDue = asDate(ticket.slaResponseDue);
  const resolutionDue = asDate(ticket.slaResolutionDue);
  const createdAt = asDate(ticket.createdAt);
  const updatedAt = asDate(ticket.updatedAt);
  const resolutionRemaining = minutesUntil(resolutionDue);
  const normalizedSlaStatus =
    toSlaStatus(ticket.slaStatus) ?? inferSlaStatus(status, resolutionRemaining, resolutionDue);

  const assigneeName = firstNonEmpty(
    [
      sanitizeDisplayName(ticket.assigneeName),
      sanitizeDisplayName(assignee.name),
      sanitizeDisplayName(ticket.assignee),
    ],
    ''
  );
  const assigneeAvatar =
    normalizeAvatarSource(asOptionalString(ticket.assigneeAvatar)) ??
    (assigneeName ? initialsFromName(assigneeName) : null);

  return {
    id: asString(ticket.id, 'unknown-ticket'),
    ticketNumber: asString(ticket.ticketNumber, 'unknown-ticket'),
    subject: asString(ticket.subject, 'Untitled ticket'),
    status,
    priority,
    slaStatus: normalizedSlaStatus,
    slaTimeRemaining: resolutionRemaining,
    slaResponseDue: responseDue ? responseDue.toISOString() : null,
    slaResolutionDue: resolutionDue ? resolutionDue.toISOString() : null,
    contactName: asString(ticket.contactName, 'Unknown Customer'),
    contactEmail: asString(ticket.contactEmail, 'unknown@example.com'),
    assignee: assigneeName || null,
    assigneeAvatar,
    category: asString(ticket.category, '') || null,
    channel: normalizeChannel(ticket.channel),
    createdAt: toDisplayTime(createdAt),
    updatedAt: toDisplayTime(updatedAt),
  };
}

export function mapTicketListItems(rawTickets: unknown): TicketListItem[] {
  if (!Array.isArray(rawTickets)) {
    return [];
  }
  return rawTickets.map(mapTicketToListItem);
}

export function mapTicketToDetailData(rawTicket: unknown): TicketDetailData {
  const ticket = asRecord(rawTicket);
  const account = asRecord(ticket.account);
  const contact = asRecord(ticket.contact);
  const assignee = asRecord(ticket.assignee);
  const policy = asRecord(ticket.slaPolicy);

  const id = asString(ticket.id, 'unknown-ticket');
  const status = toTicketStatus(ticket.status);
  const priority = toTicketPriority(ticket.priority);
  const responseDue = asDate(ticket.slaResponseDue);
  const resolutionDue = asDate(ticket.slaResolutionDue);
  const createdAt = asDate(ticket.createdAt);
  const updatedAt = asDate(ticket.updatedAt);
  const firstResponseAt = asDate(ticket.firstResponseAt);
  const inferredFirstResponseAt = inferFirstResponseAt(firstResponseAt, ticket.activities);
  const resolvedAt = asDate(ticket.resolvedAt);

  const firstResponseTarget = getResponseTarget(priority, policy);
  const resolutionTarget = getResolutionTarget(priority, policy);
  const firstResponseActual = minutesBetween(createdAt, inferredFirstResponseAt);
  const firstResponseMet =
    firstResponseActual !== null
      ? responseDue
        ? Boolean(
            inferredFirstResponseAt && inferredFirstResponseAt.getTime() <= responseDue.getTime()
          )
        : firstResponseActual <= firstResponseTarget
      : false;
  const resolutionRemaining = minutesUntil(resolutionDue);
  const normalizedSlaStatus =
    toSlaStatus(ticket.slaStatus) ?? inferSlaStatus(status, resolutionRemaining, resolutionDue);

  const assigneeName = firstNonEmpty(
    [
      sanitizeDisplayName(ticket.assigneeName),
      sanitizeDisplayName(assignee.name),
      sanitizeDisplayName(ticket.assignee),
    ],
    ''
  );
  const assigneeTitle = sanitizeAssigneeTitle(ticket.assigneeTitle);
  const assigneeAvatar =
    normalizeAvatarSource(asOptionalString(ticket.assigneeAvatar)) ??
    (assigneeName ? initialsFromName(assigneeName) : null);

  const accountName = firstNonEmpty(
    [
      asString(ticket.accountName),
      asString(account.name),
      asString(ticket.contactCompany),
      asString(contact.company),
      asString(ticket.company),
      inferCompanyFromEmail(asString(ticket.contactEmail)),
    ],
    'Account'
  );
  const activities = mapActivities(ticket.activities, id);
  const attachments = mapAttachments(ticket.attachments, id);
  const relatedTickets = mapRelatedTickets(ticket.relatedTickets);

  const aiInsight = asRecord(ticket.aiInsight);
  const aiSuggestedSolutions = parseSuggestedSolutions(aiInsight.suggestedSolutions);

  return {
    id,
    ticketNumber: asString(ticket.ticketNumber, id),
    subject: asString(ticket.subject, 'Untitled ticket'),
    status,
    priority,
    slaStatus: normalizedSlaStatus,
    slaTimeRemaining: resolutionRemaining,
    slaResponseDue: responseDue ? responseDue.toISOString() : null,
    slaResolutionDue: resolutionDue ? resolutionDue.toISOString() : null,
    contactName: asString(ticket.contactName, 'Unknown Customer'),
    contactEmail: asString(ticket.contactEmail, 'unknown@example.com'),
    assignee: assigneeName || null,
    assigneeAvatar,
    category: asString(ticket.category, '') || null,
    channel: normalizeChannel(ticket.channel),
    createdAt: toDisplayTime(createdAt),
    updatedAt: toDisplayTime(updatedAt),

    description: asString(ticket.description, 'No description provided.'),
    tags: asStringArray(ticket.tags),
    type: asString(ticket.type, 'Support'),
    customer: {
      id: firstNonEmpty([asString(ticket.contactId), asString(contact.id)], 'unknown-contact'),
      name: asString(ticket.contactName, 'Unknown Customer'),
      email: asString(ticket.contactEmail, 'unknown@example.com'),
      phone: asString(ticket.contactPhone, 'Not provided'),
      title: asString(ticket.contactTitle, 'Customer'),
      company: accountName,
      avatar: normalizeAvatarSource(asOptionalString(ticket.contactAvatar)) ?? undefined,
      isVIP: asBoolean(ticket.contactIsVIP, false),
      totalTickets: asNumber(ticket.customerTotalTickets, 0),
    },
    account: {
      id: firstNonEmpty(
        [asString(ticket.accountId), asString(account.id), asString(ticket.tenantId)],
        'unknown-account'
      ),
      name: accountName,
      industry: asString(ticket.accountIndustry, 'Unknown'),
      tier: asString(ticket.accountTier, 'Standard'),
    },
    assigneeInfo: assigneeName
      ? {
          name: assigneeName,
          title: assigneeTitle,
          avatar: normalizeAvatarSource(asOptionalString(ticket.assigneeAvatar)) ?? undefined,
        }
      : null,
    activities,
    nextSteps: (Array.isArray(ticket.nextSteps) ? ticket.nextSteps : []).map((entry, index) => {
      const step = asRecord(entry);
      return {
        id: asString(step.id, `${id}-step-${index + 1}`),
        title: asString(step.title, `Step ${index + 1}`),
        dueDate: asString(step.dueDate, 'No due date'),
        completed: asBoolean(step.completed, false),
      };
    }),
    relatedTickets,
    sla: {
      firstResponse: {
        target: firstResponseTarget,
        actual: firstResponseActual,
        met: firstResponseMet,
      },
      resolution: {
        target: resolutionTarget,
        remaining: resolutionRemaining,
        status: normalizedSlaStatus,
      },
    },
    aiInsights: {
      suggestedSolutions:
        aiSuggestedSolutions.length > 0
          ? aiSuggestedSolutions
          : ['Collect additional details and verify reproduction steps.'],
      sentiment: parseSentiment(aiInsight.sentiment),
      predictedResolutionTime: inferPredictedResolutionTime(
        aiInsight.predictedResolutionTime,
        status,
        resolutionRemaining,
        resolutionDue,
        resolutionTarget
      ),
      similarResolvedTickets: asNumber(aiInsight.similarResolvedTickets, relatedTickets.length),
      escalationRisk:
        aiInsight.escalationRisk === 'low' ||
        aiInsight.escalationRisk === 'medium' ||
        aiInsight.escalationRisk === 'high'
          ? aiInsight.escalationRisk
          : inferEscalationRisk(normalizedSlaStatus),
    },
    firstResponseAt: inferredFirstResponseAt ? inferredFirstResponseAt.toISOString() : null,
    resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
    attachments,
  };
}
