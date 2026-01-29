/**
 * Entity Mappers
 *
 * Maps domain entities to API response DTOs.
 * This provides a clean separation between domain models and API contracts.
 */

import { Lead, Contact, Account, Opportunity, Task } from '@intelliflow/domain';

/**
 * Map Lead domain entity to API response
 */
export function mapLeadToResponse(lead: Lead) {
  return {
    id: lead.id.value,
    email: lead.email.value,
    firstName: lead.firstName ?? null,
    lastName: lead.lastName ?? null,
    company: lead.company ?? null,
    title: lead.title ?? null,
    phone: lead.phone ?? null,
    source: lead.source,
    status: lead.status,
    score: lead.score.value,
    scoreConfidence: lead.score.confidence,
    scoreTier: lead.score.tier,
    ownerId: lead.ownerId,
    tenantId: lead.tenantId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

/**
 * Map Contact domain entity to API response
 */
export function mapContactToResponse(contact: Contact) {
  return {
    id: contact.id.value,
    email: contact.email.value,
    firstName: contact.firstName,
    lastName: contact.lastName,
    title: contact.title ?? null,
    phone: contact.phone ?? null,
    department: contact.department ?? null,
    status: contact.status,
    accountId: contact.accountId ?? null,
    leadId: contact.leadId ?? null,
    ownerId: contact.ownerId,
    tenantId: contact.tenantId,
    // Extended fields (IFC-089 form support)
    streetAddress: contact.streetAddress ?? null,
    city: contact.city ?? null,
    zipCode: contact.zipCode ?? null,
    company: contact.company ?? null,
    linkedInUrl: contact.linkedInUrl ?? null,
    contactType: contact.contactType ?? null,
    tags: contact.tags ?? [],
    contactNotes: contact.contactNotes ?? null,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

/**
 * Map Account domain entity to API response
 */
export function mapAccountToResponse(account: Account) {
  return {
    id: account.id.value,
    name: account.name,
    website: account.website ?? null,
    industry: account.industry ?? null,
    employees: account.employees ?? null,
    revenue: account.revenue ?? null,
    description: account.description ?? null,
    ownerId: account.ownerId,
    tenantId: account.tenantId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/**
 * Map Opportunity domain entity to API response
 */
export function mapOpportunityToResponse(opportunity: Opportunity) {
  return {
    id: opportunity.id.value,
    name: opportunity.name,
    value: opportunity.value.amount,
    currency: opportunity.value.currency,
    probability: opportunity.probability.value,
    stage: opportunity.stage,
    expectedCloseDate: opportunity.expectedCloseDate ?? null,
    accountId: opportunity.accountId,
    contactId: opportunity.contactId ?? null,
    ownerId: opportunity.ownerId,
    tenantId: opportunity.tenantId,
    weightedValue: opportunity.weightedValue.amount,
    isClosed: opportunity.isClosed,
    isWon: opportunity.isWon,
    isLost: opportunity.isLost,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
  };
}

/**
 * Map Task domain entity to API response
 */
export function mapTaskToResponse(task: Task) {
  return {
    id: task.id.value,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    completedAt: task.completedAt ?? null,
    leadId: task.leadId ?? null,
    contactId: task.contactId ?? null,
    opportunityId: task.opportunityId ?? null,
    ownerId: task.ownerId,
    tenantId: task.tenantId,
    isCompleted: task.isCompleted,
    isCancelled: task.isCancelled,
    isOverdue: task.isOverdue,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}
