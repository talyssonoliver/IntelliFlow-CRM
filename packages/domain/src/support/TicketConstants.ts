// Canonical enum values for Ticket domain - single source of truth
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const SLA_STATUSES = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED'] as const;

// Derive types from const arrays
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type SLAStatus = (typeof SLA_STATUSES)[number];
