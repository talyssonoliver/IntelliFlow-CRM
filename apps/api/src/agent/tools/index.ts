/**
 * Agent Tools Index
 *
 * IFC-139: Central export for all agent tools
 *
 * This module exports all available agent tools that can be used by
 * AI agents to interact with the CRM system.
 */

// Search tools (read-only, no approval required)
export { searchTools, searchLeadsTool, searchContactsTool, searchOpportunitiesTool, combinedSearchTool } from './search';
export type { LeadSearchResult, ContactSearchResult, OpportunitySearchResult, CombinedSearchInput } from './search';

// Create tools (require approval)
export { createTools, createCaseTool, createAppointmentTool } from './create';
export type { CreatedCaseResult, CreatedAppointmentResult } from './create';

// Update tools (require approval)
export { updateTools, updateCaseTool, updateAppointmentTool } from './update';
export type { UpdatedCaseResult, UpdatedAppointmentResult } from './update';

// Draft message tool (requires approval)
export { draftMessageTools, draftMessageTool } from './draft-message';
export type { DraftedMessageResult } from './draft-message';

import { AgentToolDefinition } from '../types';
import { searchLeadsTool, searchContactsTool, searchOpportunitiesTool, combinedSearchTool } from './search';
import { createCaseTool, createAppointmentTool } from './create';
import { updateCaseTool, updateAppointmentTool } from './update';
import { draftMessageTool } from './draft-message';

/**
 * Registry of all available agent tools
 * Maps tool names to their definitions for runtime lookup
 */
export const agentToolRegistry: Map<string, AgentToolDefinition<unknown, unknown>> = new Map([
  // Search tools (no approval required)
  ['search_leads', searchLeadsTool as AgentToolDefinition<unknown, unknown>],
  ['search_contacts', searchContactsTool as AgentToolDefinition<unknown, unknown>],
  ['search_opportunities', searchOpportunitiesTool as AgentToolDefinition<unknown, unknown>],
  ['search_crm', combinedSearchTool as AgentToolDefinition<unknown, unknown>],

  // Create tools (approval required)
  ['create_case', createCaseTool as AgentToolDefinition<unknown, unknown>],
  ['create_appointment', createAppointmentTool as AgentToolDefinition<unknown, unknown>],

  // Update tools (approval required)
  ['update_case', updateCaseTool as AgentToolDefinition<unknown, unknown>],
  ['update_appointment', updateAppointmentTool as AgentToolDefinition<unknown, unknown>],

  // Draft tools (approval required)
  ['draft_message', draftMessageTool as AgentToolDefinition<unknown, unknown>],
]);

/**
 * Get a tool by name from the registry
 */
export function getAgentTool(name: string): AgentToolDefinition<unknown, unknown> | undefined {
  return agentToolRegistry.get(name);
}

/**
 * Get all available tool names
 */
export function getAvailableToolNames(): string[] {
  return Array.from(agentToolRegistry.keys());
}

/**
 * Get tools by action type
 */
export function getToolsByActionType(actionType: 'SEARCH' | 'CREATE' | 'UPDATE' | 'DELETE' | 'DRAFT'): AgentToolDefinition<unknown, unknown>[] {
  return Array.from(agentToolRegistry.values()).filter(tool => tool.actionType === actionType);
}

/**
 * Get tools that require approval
 */
export function getToolsRequiringApproval(): AgentToolDefinition<unknown, unknown>[] {
  return Array.from(agentToolRegistry.values()).filter(tool => tool.requiresApproval);
}

/**
 * Get tools that don't require approval
 */
export function getToolsNotRequiringApproval(): AgentToolDefinition<unknown, unknown>[] {
  return Array.from(agentToolRegistry.values()).filter(tool => !tool.requiresApproval);
}

/**
 * Tool metadata for documentation/UI
 */
export const toolMetadata = {
  categories: {
    search: {
      name: 'Search',
      description: 'Read-only search operations across CRM entities',
      requiresApproval: false,
      tools: ['search_leads', 'search_contacts', 'search_opportunities', 'search_crm'],
    },
    create: {
      name: 'Create',
      description: 'Create new entities in the CRM',
      requiresApproval: true,
      tools: ['create_case', 'create_appointment'],
    },
    update: {
      name: 'Update',
      description: 'Update existing entities in the CRM',
      requiresApproval: true,
      tools: ['update_case', 'update_appointment'],
    },
    draft: {
      name: 'Draft',
      description: 'Draft messages for review before sending',
      requiresApproval: true,
      tools: ['draft_message'],
    },
  },
};
