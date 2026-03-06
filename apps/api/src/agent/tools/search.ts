/**
 * Search Agent Tools
 *
 * IFC-139: Agent tools for searching leads, contacts, and opportunities/deals
 *
 * These tools allow AI agents to search CRM data through application services,
 * following hexagonal architecture by calling use cases rather than repositories directly.
 *
 * Search operations are read-only and do not require human approval.
 */

import { z } from 'zod';
import {
  AgentToolDefinition,
  AgentToolResult,
  AgentAuthContext,
  ActionPreview,
  LeadSearchInput,
  LeadSearchInputSchema,
  ContactSearchInput,
  ContactSearchInputSchema,
  OpportunitySearchInput,
  OpportunitySearchInputSchema,
} from '../types';
import { agentLogger } from '../logger';

/**
 * Combined search input schema for multi-entity search
 */
export const CombinedSearchInputSchema = z.object({
  entityTypes: z.array(z.enum(['LEAD', 'CONTACT', 'OPPORTUNITY'])).min(1),
  query: z.string().min(1).max(500),
  limit: z.number().min(1).max(100).default(20),
});

export type CombinedSearchInput = z.infer<typeof CombinedSearchInputSchema>;

/**
 * Lead search result structure
 */
export interface LeadSearchResult {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  status: string;
  source: string;
  score: number;
  ownerId: string;
  createdAt: Date;
}

/**
 * Contact search result structure
 */
export interface ContactSearchResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title?: string;
  phone?: string;
  accountId?: string;
  accountName?: string;
  ownerId: string;
  createdAt: Date;
}

/**
 * Opportunity search result structure
 */
export interface OpportunitySearchResult {
  id: string;
  name: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  closeDate?: Date;
  accountId?: string;
  accountName?: string;
  ownerId: string;
  createdAt: Date;
}

// ── Where-clause builders (extracted to reduce cognitive complexity) ──

function buildLeadWhere(input: LeadSearchInput, tenantId?: string): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (tenantId) where.tenantId = tenantId;
  if (input.status && input.status.length > 0) where.status = { in: input.status };
  if (input.source && input.source.length > 0) where.source = { in: input.source };
  if (input.ownerId) where.ownerId = input.ownerId;

  if (input.minScore !== undefined || input.maxScore !== undefined) {
    const scoreFilter: Record<string, number> = {};
    if (input.minScore !== undefined) scoreFilter.gte = input.minScore;
    if (input.maxScore !== undefined) scoreFilter.lte = input.maxScore;
    where.score = scoreFilter;
  }

  if (input.query) {
    where.OR = [
      { email: { contains: input.query, mode: 'insensitive' } },
      { firstName: { contains: input.query, mode: 'insensitive' } },
      { lastName: { contains: input.query, mode: 'insensitive' } },
      { company: { contains: input.query, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildContactWhere(input: ContactSearchInput, tenantId?: string): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (tenantId) where.tenantId = tenantId;
  if (input.accountId) where.accountId = input.accountId;
  if (input.ownerId) where.ownerId = input.ownerId;

  if (input.hasEmail !== undefined) where.email = input.hasEmail ? { not: null } : null;
  if (input.hasPhone !== undefined) where.phone = input.hasPhone ? { not: null } : null;

  if (input.query) {
    where.OR = [
      { email: { contains: input.query, mode: 'insensitive' } },
      { firstName: { contains: input.query, mode: 'insensitive' } },
      { lastName: { contains: input.query, mode: 'insensitive' } },
    ];
  }

  return where;
}

function buildOpportunityWhere(
  input: OpportunitySearchInput,
  tenantId?: string
): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (tenantId) where.tenantId = tenantId;
  if (input.stage && input.stage.length > 0) where.stage = { in: input.stage };
  if (input.ownerId) where.ownerId = input.ownerId;
  if (input.accountId) where.accountId = input.accountId;

  if (input.minValue !== undefined || input.maxValue !== undefined) {
    const valueFilter: Record<string, number> = {};
    if (input.minValue !== undefined) valueFilter.gte = input.minValue;
    if (input.maxValue !== undefined) valueFilter.lte = input.maxValue;
    where.value = valueFilter;
  }

  if (input.closeDateFrom || input.closeDateTo) {
    const closeFilter: Record<string, Date> = {};
    if (input.closeDateFrom) closeFilter.gte = input.closeDateFrom;
    if (input.closeDateTo) closeFilter.lte = input.closeDateTo;
    where.expectedCloseDate = closeFilter;
  }

  if (input.query) {
    where.OR = [
      { name: { contains: input.query, mode: 'insensitive' } },
      { description: { contains: input.query, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ── Prisma query helpers (extracted to reduce cognitive complexity) ──

async function queryLeads(
  prisma: NonNullable<AgentAuthContext['prisma']>,
  input: LeadSearchInput,
  tenantId?: string
): Promise<LeadSearchResult[]> {
  const where = buildLeadWhere(input, tenantId);
  const rows = await prisma.lead.findMany({
    where,
    take: input.limit,
    skip: input.offset,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
      title: true,
      status: true,
      source: true,
      score: true,
      ownerId: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    company: row.company ?? undefined,
    title: row.title ?? undefined,
    status: row.status,
    source: row.source,
    score: row.score,
    ownerId: row.ownerId ?? '',
    createdAt: row.createdAt,
  }));
}

async function queryContacts(
  prisma: NonNullable<AgentAuthContext['prisma']>,
  input: ContactSearchInput,
  tenantId?: string
): Promise<ContactSearchResult[]> {
  const where = buildContactWhere(input, tenantId);
  const rows = await prisma.contact.findMany({
    where,
    take: input.limit,
    skip: input.offset,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      title: true,
      phone: true,
      accountId: true,
      ownerId: true,
      createdAt: true,
      account: {
        select: { name: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    title: row.title ?? undefined,
    phone: row.phone ?? undefined,
    accountId: row.accountId ?? undefined,
    accountName: row.account?.name ?? undefined,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
  }));
}

async function queryOpportunities(
  prisma: NonNullable<AgentAuthContext['prisma']>,
  input: OpportunitySearchInput,
  tenantId?: string
): Promise<OpportunitySearchResult[]> {
  const where = buildOpportunityWhere(input, tenantId);
  const rows = await prisma.opportunity.findMany({
    where,
    take: input.limit,
    skip: input.offset,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      stage: true,
      value: true,
      probability: true,
      expectedCloseDate: true,
      accountId: true,
      ownerId: true,
      createdAt: true,
      account: {
        select: { name: true },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    stage: row.stage,
    value: Number(row.value),
    currency: 'USD', // Opportunity model does not store currency; defaulting to USD
    probability: row.probability,
    closeDate: row.expectedCloseDate ?? undefined,
    accountId: row.accountId ?? undefined,
    accountName: row.account?.name ?? undefined,
    ownerId: row.ownerId ?? '',
    createdAt: row.createdAt,
  }));
}

/**
 * Search Leads Tool
 *
 * Searches for leads based on various criteria including status, source, score range, etc.
 * This is a read-only operation and does not require approval.
 */
export const searchLeadsTool: AgentToolDefinition<LeadSearchInput, LeadSearchResult[]> = {
  name: 'search_leads',
  description:
    'Search for leads in the CRM based on status, source, score, owner, or free text query',
  actionType: 'SEARCH',
  entityTypes: ['LEAD'],
  requiresApproval: false,
  inputSchema: LeadSearchInputSchema,

  async execute(
    input: LeadSearchInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<LeadSearchResult[]>> {
    const startTime = performance.now();

    try {
      // Validate authorization
      if (!context.allowedEntityTypes.includes('LEAD')) {
        return {
          success: false,
          error: 'Not authorized to search leads',
          requiresApproval: false,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Query real lead data via Prisma when available, scoped to tenant
      const results = context.prisma
        ? await queryLeads(context.prisma, input, context.tenantId)
        : [];

      // Log the search action
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_leads',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
      });

      return {
        success: true,
        data: results,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_leads',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input,
        success: false,
        error: errorMessage,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
      });

      return {
        success: false,
        error: errorMessage,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    }
  },

  async generatePreview(
    input: LeadSearchInput,
    _context: AgentAuthContext
  ): Promise<ActionPreview> {
    const criteria: string[] = [];
    if (input.query) criteria.push(`query: "${input.query}"`);
    if (input.status?.length) criteria.push(`status: ${input.status.join(', ')}`);
    if (input.source?.length) criteria.push(`source: ${input.source.join(', ')}`);
    if (input.minScore !== undefined) criteria.push(`min score: ${input.minScore}`);
    if (input.maxScore !== undefined) criteria.push(`max score: ${input.maxScore}`);
    if (input.ownerId) criteria.push(`owner: ${input.ownerId}`);

    return {
      summary: `Search leads with criteria: ${criteria.length > 0 ? criteria.join(', ') : 'all leads'}`,
      changes: [],
      affectedEntities: [],
      estimatedImpact: 'LOW',
    };
  },
};

/**
 * Search Contacts Tool
 *
 * Searches for contacts based on various criteria including account, owner, etc.
 * This is a read-only operation and does not require approval.
 */
export const searchContactsTool: AgentToolDefinition<ContactSearchInput, ContactSearchResult[]> = {
  name: 'search_contacts',
  description: 'Search for contacts in the CRM based on account, owner, or free text query',
  actionType: 'SEARCH',
  entityTypes: ['CONTACT'],
  requiresApproval: false,
  inputSchema: ContactSearchInputSchema,

  async execute(
    input: ContactSearchInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<ContactSearchResult[]>> {
    const startTime = performance.now();

    try {
      // Validate authorization
      if (!context.allowedEntityTypes.includes('CONTACT')) {
        return {
          success: false,
          error: 'Not authorized to search contacts',
          requiresApproval: false,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Query real contact data via Prisma when available, scoped to tenant
      const results = context.prisma
        ? await queryContacts(context.prisma, input, context.tenantId)
        : [];

      // Log the search action
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_contacts',
        actionType: 'SEARCH',
        entityType: 'CONTACT',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
      });

      return {
        success: true,
        data: results,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_contacts',
        actionType: 'SEARCH',
        entityType: 'CONTACT',
        input,
        success: false,
        error: errorMessage,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
      });

      return {
        success: false,
        error: errorMessage,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    }
  },

  async generatePreview(
    input: ContactSearchInput,
    _context: AgentAuthContext
  ): Promise<ActionPreview> {
    const criteria: string[] = [];
    if (input.query) criteria.push(`query: "${input.query}"`);
    if (input.accountId) criteria.push(`account: ${input.accountId}`);
    if (input.ownerId) criteria.push(`owner: ${input.ownerId}`);
    if (input.hasEmail !== undefined) criteria.push(`has email: ${input.hasEmail}`);
    if (input.hasPhone !== undefined) criteria.push(`has phone: ${input.hasPhone}`);

    return {
      summary: `Search contacts with criteria: ${criteria.length > 0 ? criteria.join(', ') : 'all contacts'}`,
      changes: [],
      affectedEntities: [],
      estimatedImpact: 'LOW',
    };
  },
};

/**
 * Search Opportunities/Deals Tool
 *
 * Searches for opportunities based on stage, value, account, close date, etc.
 * This is a read-only operation and does not require approval.
 */
export const searchOpportunitiesTool: AgentToolDefinition<
  OpportunitySearchInput,
  OpportunitySearchResult[]
> = {
  name: 'search_opportunities',
  description:
    'Search for opportunities/deals in the CRM based on stage, value, account, close date, or free text query',
  actionType: 'SEARCH',
  entityTypes: ['OPPORTUNITY'],
  requiresApproval: false,
  inputSchema: OpportunitySearchInputSchema,

  async execute(
    input: OpportunitySearchInput,
    context: AgentAuthContext
  ): Promise<AgentToolResult<OpportunitySearchResult[]>> {
    const startTime = performance.now();

    try {
      // Validate authorization
      if (!context.allowedEntityTypes.includes('OPPORTUNITY')) {
        return {
          success: false,
          error: 'Not authorized to search opportunities',
          requiresApproval: false,
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Query real opportunity data via Prisma when available, scoped to tenant
      const results = context.prisma
        ? await queryOpportunities(context.prisma, input, context.tenantId)
        : [];

      // Log the search action
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_opportunities',
        actionType: 'SEARCH',
        entityType: 'OPPORTUNITY',
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
      });

      return {
        success: true,
        data: results,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_opportunities',
        actionType: 'SEARCH',
        entityType: 'OPPORTUNITY',
        input,
        success: false,
        error: errorMessage,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
      });

      return {
        success: false,
        error: errorMessage,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    }
  },

  async generatePreview(
    input: OpportunitySearchInput,
    _context: AgentAuthContext
  ): Promise<ActionPreview> {
    const criteria: string[] = [];
    if (input.query) criteria.push(`query: "${input.query}"`);
    if (input.stage?.length) criteria.push(`stage: ${input.stage.join(', ')}`);
    if (input.minValue !== undefined) criteria.push(`min value: ${input.minValue}`);
    if (input.maxValue !== undefined) criteria.push(`max value: ${input.maxValue}`);
    if (input.accountId) criteria.push(`account: ${input.accountId}`);
    if (input.ownerId) criteria.push(`owner: ${input.ownerId}`);
    if (input.closeDateFrom) criteria.push(`close date from: ${input.closeDateFrom.toISOString()}`);
    if (input.closeDateTo) criteria.push(`close date to: ${input.closeDateTo.toISOString()}`);

    return {
      summary: `Search opportunities with criteria: ${criteria.length > 0 ? criteria.join(', ') : 'all opportunities'}`,
      changes: [],
      affectedEntities: [],
      estimatedImpact: 'LOW',
    };
  },
};

/**
 * Combined Search Tool
 *
 * Searches across multiple entity types with a single query.
 * Useful for AI agents that need to find relevant information across the CRM.
 */
export const combinedSearchTool: AgentToolDefinition<
  CombinedSearchInput,
  {
    leads?: LeadSearchResult[];
    contacts?: ContactSearchResult[];
    opportunities?: OpportunitySearchResult[];
  }
> = {
  name: 'search_crm',
  description:
    'Search across multiple CRM entities (leads, contacts, opportunities) with a single query',
  actionType: 'SEARCH',
  entityTypes: ['LEAD', 'CONTACT', 'OPPORTUNITY'],
  requiresApproval: false,
  inputSchema: CombinedSearchInputSchema,

  async execute(
    input: CombinedSearchInput,
    context: AgentAuthContext
  ): Promise<
    AgentToolResult<{
      leads?: LeadSearchResult[];
      contacts?: ContactSearchResult[];
      opportunities?: OpportunitySearchResult[];
    }>
  > {
    const startTime = performance.now();

    try {
      const results: {
        leads?: LeadSearchResult[];
        contacts?: ContactSearchResult[];
        opportunities?: OpportunitySearchResult[];
      } = {};

      // Search each requested entity type
      if (input.entityTypes.includes('LEAD') && context.allowedEntityTypes.includes('LEAD')) {
        const leadResult = await searchLeadsTool.execute(
          { query: input.query, limit: input.limit, offset: 0 },
          context
        );
        if (leadResult.success && leadResult.data) {
          results.leads = leadResult.data;
        }
      }

      if (input.entityTypes.includes('CONTACT') && context.allowedEntityTypes.includes('CONTACT')) {
        const contactResult = await searchContactsTool.execute(
          { query: input.query, limit: input.limit, offset: 0 },
          context
        );
        if (contactResult.success && contactResult.data) {
          results.contacts = contactResult.data;
        }
      }

      if (
        input.entityTypes.includes('OPPORTUNITY') &&
        context.allowedEntityTypes.includes('OPPORTUNITY')
      ) {
        const oppResult = await searchOpportunitiesTool.execute(
          { query: input.query, limit: input.limit, offset: 0 },
          context
        );
        if (oppResult.success && oppResult.data) {
          results.opportunities = oppResult.data;
        }
      }

      // Log the combined search
      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_crm',
        actionType: 'SEARCH',
        entityType: 'LEAD', // Primary entity for logging
        input,
        success: true,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
        metadata: { entityTypes: input.entityTypes },
      });

      return {
        success: true,
        data: results,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await agentLogger.log({
        userId: context.userId,
        agentSessionId: context.agentSessionId,
        toolName: 'search_crm',
        actionType: 'SEARCH',
        entityType: 'LEAD',
        input,
        success: false,
        error: errorMessage,
        durationMs: performance.now() - startTime,
        approvalRequired: false,
      });

      return {
        success: false,
        error: errorMessage,
        requiresApproval: false,
        executionTimeMs: performance.now() - startTime,
      };
    }
  },

  async generatePreview(
    input: CombinedSearchInput,
    _context: AgentAuthContext
  ): Promise<ActionPreview> {
    return {
      summary: `Search ${input.entityTypes.join(', ')} for: "${input.query}"`,
      changes: [],
      affectedEntities: [],
      estimatedImpact: 'LOW',
    };
  },
};

/**
 * Export all search tools
 */
export const searchTools = {
  searchLeadsTool,
  searchContactsTool,
  searchOpportunitiesTool,
  combinedSearchTool,
};
