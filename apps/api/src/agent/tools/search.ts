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

/**
 * Search Leads Tool
 *
 * Searches for leads based on various criteria including status, source, score range, etc.
 * This is a read-only operation and does not require approval.
 */
export const searchLeadsTool: AgentToolDefinition<LeadSearchInput, LeadSearchResult[]> = {
  name: 'search_leads',
  description: 'Search for leads in the CRM based on status, source, score, owner, or free text query',
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

      // In a real implementation, this would call the LeadService.
      // For now, we simulate the search response.
      // The actual implementation would inject the LeadService via dependency injection.

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

      // Placeholder response - in production this would query the database via LeadService
      const results: LeadSearchResult[] = [];

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

      // Placeholder response - in production this would query the database via ContactService
      const results: ContactSearchResult[] = [];

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
export const searchOpportunitiesTool: AgentToolDefinition<OpportunitySearchInput, OpportunitySearchResult[]> = {
  name: 'search_opportunities',
  description: 'Search for opportunities/deals in the CRM based on stage, value, account, close date, or free text query',
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

      // Placeholder response - in production this would query the database via OpportunityService
      const results: OpportunitySearchResult[] = [];

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
  description: 'Search across multiple CRM entities (leads, contacts, opportunities) with a single query',
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
          { query: input.query, limit: input.limit },
          context
        );
        if (leadResult.success && leadResult.data) {
          results.leads = leadResult.data;
        }
      }

      if (input.entityTypes.includes('CONTACT') && context.allowedEntityTypes.includes('CONTACT')) {
        const contactResult = await searchContactsTool.execute(
          { query: input.query, limit: input.limit },
          context
        );
        if (contactResult.success && contactResult.data) {
          results.contacts = contactResult.data;
        }
      }

      if (input.entityTypes.includes('OPPORTUNITY') && context.allowedEntityTypes.includes('OPPORTUNITY')) {
        const oppResult = await searchOpportunitiesTool.execute(
          { query: input.query, limit: input.limit },
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
