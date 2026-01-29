/**
 * Case RAG Tool - IFC-156
 *
 * Agent retrieval tool constrained by tenant/case permissions with:
 * - Citation and source tracing
 * - Prompt-injection hardening for retrieved content
 * - Human approval for external send actions
 *
 * Security:
 * - All queries scoped to tenant_id
 * - Case access verified via owner/assignee/role permissions
 * - Document ACL checked before retrieval
 * - Content sanitized to prevent prompt injection
 *
 * Performance target: <2s response time
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { PrismaClient } from '@intelliflow/db';

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * Citation reference for source tracing
 */
export interface Citation {
  id: string;
  sourceType: 'case' | 'document' | 'task' | 'note' | 'conversation';
  sourceId: string;
  title: string;
  retrievedAt: string;
  relevanceScore: number;
  snippet: string;
  metadata: Record<string, unknown>;
}

/**
 * Retrieved context with citations
 */
export interface RetrievedContext {
  content: string;
  citations: Citation[];
  totalSources: number;
  queryTimeMs: number;
  sanitized: boolean;
  caseId: string;
  tenantId: string;
}

/**
 * Case access permission result
 */
export interface CaseAccessResult {
  hasAccess: boolean;
  accessLevel: 'none' | 'view' | 'edit' | 'admin';
  reason: string;
}

/**
 * Input schema for the retrieve_case_context tool
 */
export const retrieveCaseContextInputSchema = z.object({
  caseId: z.string().uuid().describe('The ID of the case to retrieve context for'),
  query: z.string().min(1).max(1000).describe('The search query or question about the case'),
  includeDocuments: z.boolean().default(true).describe('Include case documents in retrieval'),
  includeTasks: z.boolean().default(true).describe('Include case tasks in retrieval'),
  includeNotes: z.boolean().default(true).describe('Include case notes/conversations in retrieval'),
  maxResults: z.number().min(1).max(50).default(10).describe('Maximum number of sources to retrieve'),
  minRelevanceScore: z.number().min(0).max(1).default(0.3).describe('Minimum relevance score threshold'),
});

export type RetrieveCaseContextInput = z.infer<typeof retrieveCaseContextInputSchema>;

/**
 * Output schema for the retrieve_case_context tool
 */
export const retrieveCaseContextOutputSchema = z.object({
  success: z.boolean(),
  context: z.string().optional(),
  citations: z.array(z.object({
    id: z.string(),
    sourceType: z.enum(['case', 'document', 'task', 'note', 'conversation']),
    sourceId: z.string(),
    title: z.string(),
    retrievedAt: z.string(),
    relevanceScore: z.number(),
    snippet: z.string(),
  })).optional(),
  totalSources: z.number().optional(),
  queryTimeMs: z.number().optional(),
  error: z.string().optional(),
  requiresApproval: z.boolean().default(false),
  approvalReason: z.string().optional(),
});

export type RetrieveCaseContextOutput = z.infer<typeof retrieveCaseContextOutputSchema>;

// ============================================================================
// Prompt Injection Hardening
// ============================================================================

/**
 * Content boundary markers to prevent injection attacks
 */
const CONTENT_BOUNDARY_START = '<<<RETRIEVED_CONTENT_START>>>';
const CONTENT_BOUNDARY_END = '<<<RETRIEVED_CONTENT_END>>>';

/**
 * Patterns that may indicate prompt injection attempts
 * Note: These patterns are checked BEFORE character escaping
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /forget\s+(everything|all|your).*?(train|instruct|rules?)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?:/i,
  /system\s*:\s*/i,
  /\[system\]/i,
  /\[user\]/i,
  /\[assistant\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /###\s*(instruction|system|user)/i,
];

/**
 * Dangerous characters that could break prompt structure
 * Note: The [CONTENT_FILTERED] marker's brackets are protected by using a placeholder
 */
const DANGEROUS_CHARS_PATTERN = /[<>{}[\]\\`]/g;

/**
 * Placeholder used during sanitization to protect our markers
 * Uses only alphanumeric and underscore chars to avoid escaping
 */
const FILTERED_PLACEHOLDER = '___XFILTEREDX___';
const FILTERED_MARKER = '[CONTENT_FILTERED]';

/**
 * Sanitize retrieved content to prevent prompt injection
 */
export function sanitizeContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  let sanitized = content;

  // 1. Check for and neutralize injection patterns FIRST (before escaping)
  // Use a placeholder that won't be affected by escaping
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      // Replace the suspicious pattern with a placeholder
      sanitized = sanitized.replace(pattern, FILTERED_PLACEHOLDER);
    }
  }

  // 2. Remove or escape dangerous characters AFTER pattern matching
  sanitized = sanitized.replace(DANGEROUS_CHARS_PATTERN, (char) => {
    const escapeMap: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '{': '&#123;',
      '}': '&#125;',
      '[': '&#91;',
      ']': '&#93;',
      '\\': '&#92;',
      '`': '&#96;',
    };
    return escapeMap[char] || char;
  });

  // 3. Replace placeholders with the actual marker
  sanitized = sanitized.replaceAll(FILTERED_PLACEHOLDER, FILTERED_MARKER);

  // 4. Limit consecutive newlines to prevent structure manipulation
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

  // 5. Truncate excessively long content
  const MAX_CONTENT_LENGTH = 10000;
  if (sanitized.length > MAX_CONTENT_LENGTH) {
    sanitized = sanitized.slice(0, MAX_CONTENT_LENGTH) + '... [TRUNCATED]';
  }

  return sanitized;
}

/**
 * Wrap content with boundary markers for safe inclusion in prompts
 */
export function wrapWithBoundaries(content: string, sourceId: string): string {
  const sanitized = sanitizeContent(content);
  return `${CONTENT_BOUNDARY_START}[Source: ${sourceId}]\n${sanitized}\n${CONTENT_BOUNDARY_END}`;
}

/**
 * Check if content contains potential injection attempts
 */
export function detectInjectionAttempt(content: string): boolean {
  return INJECTION_PATTERNS.some(pattern => pattern.test(content));
}

// ============================================================================
// Retry & Resilience Utilities
// ============================================================================

/**
 * Retry a function with exponential backoff for reliability
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on permission errors
      if (lastError.message.includes('Access denied')) {
        throw lastError;
      }

      // Exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

// ============================================================================
// Case Access Control
// ============================================================================

/**
 * Verify user has access to a case
 */
export async function verifyCaseAccess(
  prisma: PrismaClient,
  caseId: string,
  userId: string,
  tenantId: string
): Promise<CaseAccessResult> {
  try {
    // Fetch the case with tenant scoping
    const caseRecord = await prisma.case.findFirst({
      where: {
        id: caseId,
        tenantId: tenantId,
      },
      select: {
        id: true,
        assignedTo: true,
        clientId: true,
        status: true,
      },
    });

    if (!caseRecord) {
      return {
        hasAccess: false,
        accessLevel: 'none',
        reason: 'Case not found or not in tenant',
      };
    }

    // Check if user is assigned to the case
    if (caseRecord.assignedTo === userId) {
      return {
        hasAccess: true,
        accessLevel: 'edit',
        reason: 'User is assigned to case',
      };
    }

    // Check user roles for admin access
    const userRoles = await prisma.userRoleAssignment.findMany({
      where: {
        userId: userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        role: true,
      },
    });

    const roleNames = userRoles.map(ur => ur.role.name);

    if (roleNames.includes('ADMIN')) {
      return {
        hasAccess: true,
        accessLevel: 'admin',
        reason: 'User has admin role',
      };
    }

    if (roleNames.includes('MANAGER')) {
      return {
        hasAccess: true,
        accessLevel: 'view',
        reason: 'User has manager role',
      };
    }

    // Check team membership (simplified)
    // In production, check if user is in the same team as the case assignee

    return {
      hasAccess: false,
      accessLevel: 'none',
      reason: 'User does not have access to this case',
    };
  } catch (error) {
    return {
      hasAccess: false,
      accessLevel: 'none',
      reason: `Access check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// Case Context Retrieval
// ============================================================================

/**
 * Retrieve case details
 */
async function retrieveCaseDetails(
  prisma: PrismaClient,
  caseId: string,
  tenantId: string
): Promise<Citation | null> {
  const caseRecord = await prisma.case.findFirst({
    where: {
      id: caseId,
      tenantId: tenantId,
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      deadline: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!caseRecord) return null;

  const content = [
    `Case: ${caseRecord.title}`,
    `Status: ${caseRecord.status}`,
    `Priority: ${caseRecord.priority}`,
    caseRecord.description ? `Description: ${caseRecord.description}` : '',
    caseRecord.deadline ? `Deadline: ${caseRecord.deadline.toISOString()}` : '',
  ].filter(Boolean).join('\n');

  return {
    id: `case-${caseRecord.id}`,
    sourceType: 'case',
    sourceId: caseRecord.id,
    title: caseRecord.title,
    retrievedAt: new Date().toISOString(),
    relevanceScore: 1.0, // Case details always highly relevant
    snippet: sanitizeContent(content),
    metadata: {
      status: caseRecord.status,
      priority: caseRecord.priority,
    },
  };
}

/**
 * Retrieve case documents with ACL check
 */
async function retrieveCaseDocuments(
  prisma: PrismaClient,
  caseId: string,
  tenantId: string,
  userId: string,
  query: string,
  maxResults: number
): Promise<Citation[]> {
  // Get document IDs attached to the case
  const caseWithDocs = await prisma.case.findFirst({
    where: {
      id: caseId,
      tenantId: tenantId,
    },
    select: {
      documentIds: true,
    },
  });

  if (!caseWithDocs || !caseWithDocs.documentIds.length) {
    return [];
  }

  // Fetch documents with ACL
  const documents = await prisma.caseDocument.findMany({
    where: {
      id: { in: caseWithDocs.documentIds },
      tenant_id: tenantId,
      deleted_at: null,
      is_latest_version: true,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    include: {
      acl: true,
    },
    take: maxResults,
    orderBy: { updated_at: 'desc' },
  });

  // Filter by ACL
  const accessibleDocs = documents.filter(doc => {
    const hasAccess = doc.acl.some(
      acl =>
        (acl.principal_type === 'USER' && acl.principal_id === userId) ||
        acl.principal_type === 'TENANT'
    );
    return hasAccess || doc.created_by === userId;
  });

  return accessibleDocs.map(doc => ({
    id: `doc-${doc.id}`,
    sourceType: 'document' as const,
    sourceId: doc.id,
    title: doc.title,
    retrievedAt: new Date().toISOString(),
    relevanceScore: calculateRelevance(query, `${doc.title} ${doc.description || ''}`),
    snippet: sanitizeContent(doc.description || doc.title),
    metadata: {
      documentType: doc.document_type,
      classification: doc.classification,
      version: `${doc.version_major}.${doc.version_minor}.${doc.version_patch}`,
    },
  }));
}

/**
 * Retrieve case tasks
 */
async function retrieveCaseTasks(
  prisma: PrismaClient,
  caseId: string,
  tenantId: string,
  query: string,
  maxResults: number
): Promise<Citation[]> {
  const caseTasks = await prisma.caseTask.findMany({
    where: {
      caseId: caseId,
      case: {
        tenantId: tenantId,
      },
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: maxResults,
    orderBy: { updatedAt: 'desc' },
  });

  return caseTasks.map(task => ({
    id: `task-${task.id}`,
    sourceType: 'task' as const,
    sourceId: task.id,
    title: task.title,
    retrievedAt: new Date().toISOString(),
    relevanceScore: calculateRelevance(query, `${task.title} ${task.description || ''}`),
    snippet: sanitizeContent(`${task.title}: ${task.description || 'No description'} [Status: ${task.status}]`),
    metadata: {
      status: task.status,
      dueDate: task.dueDate?.toISOString(),
      priority: task.priority,
    },
  }));
}

/**
 * Retrieve case-related conversations/notes
 */
async function retrieveCaseConversations(
  prisma: PrismaClient,
  caseId: string,
  tenantId: string,
  userId: string,
  query: string,
  maxResults: number
): Promise<Citation[]> {
  const conversations = await prisma.conversationRecord.findMany({
    where: {
      tenantId: tenantId,
      contextType: 'CASE',
      contextId: caseId,
      status: { not: 'DELETED' },
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { summary: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: maxResults,
    orderBy: { startedAt: 'desc' },
  });

  return conversations.map(conv => ({
    id: `conv-${conv.id}`,
    sourceType: 'conversation' as const,
    sourceId: conv.id,
    title: conv.title || `Conversation ${conv.sessionId.slice(0, 8)}`,
    retrievedAt: new Date().toISOString(),
    relevanceScore: calculateRelevance(query, `${conv.title || ''} ${conv.summary || ''}`),
    snippet: sanitizeContent(conv.summary || conv.title || 'No summary available'),
    metadata: {
      agentName: conv.agentName,
      messageCount: conv.messageCount,
      status: conv.status,
    },
  }));
}

/**
 * Calculate relevance score for a query against content
 */
function calculateRelevance(query: string, content: string): number {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const contentLower = content.toLowerCase();

  let matchCount = 0;
  for (const term of queryTerms) {
    if (contentLower.includes(term)) {
      matchCount++;
    }
  }

  return queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
}

// ============================================================================
// Main Tool Implementation
// ============================================================================

/**
 * Retrieve case context with citations and source tracing
 */
export async function retrieveCaseContext(
  prisma: PrismaClient,
  input: RetrieveCaseContextInput,
  userId: string,
  tenantId: string
): Promise<RetrievedContext> {
  const startTime = Date.now();

  // Verify case access with retry for transient failures
  const accessResult = await withRetry(
    () => verifyCaseAccess(prisma, input.caseId, userId, tenantId)
  );
  if (!accessResult.hasAccess) {
    throw new Error(`Access denied: ${accessResult.reason}`);
  }

  const citations: Citation[] = [];

  // Run retrievals in PARALLEL for better performance (target <2s)
  const retrievalPromises: Promise<Citation[]>[] = [];

  // 1. Always retrieve case details
  retrievalPromises.push(
    retrieveCaseDetails(prisma, input.caseId, tenantId).then(c => c ? [c] : [])
  );

  // 2. Retrieve documents if requested
  if (input.includeDocuments) {
    retrievalPromises.push(
      retrieveCaseDocuments(
        prisma,
        input.caseId,
        tenantId,
        userId,
        input.query,
        input.maxResults
      )
    );
  }

  // 3. Retrieve tasks if requested
  if (input.includeTasks) {
    retrievalPromises.push(
      retrieveCaseTasks(
        prisma,
        input.caseId,
        tenantId,
        input.query,
        Math.floor(input.maxResults / 2)
      )
    );
  }

  // 4. Retrieve conversations/notes if requested
  if (input.includeNotes) {
    retrievalPromises.push(
      retrieveCaseConversations(
        prisma,
        input.caseId,
        tenantId,
        userId,
        input.query,
        Math.floor(input.maxResults / 2)
      )
    );
  }

  // Execute all retrievals in parallel with error resilience
  const results = await Promise.allSettled(retrievalPromises);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      citations.push(...result.value);
    }
    // Skip failed retrievals - partial results are acceptable
  }

  // Filter by relevance score and sort
  const filteredCitations = citations
    .filter(c => c.relevanceScore >= input.minRelevanceScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, input.maxResults);

  // Build combined content with boundary markers
  const contentParts = filteredCitations.map(citation =>
    wrapWithBoundaries(citation.snippet, citation.id)
  );

  const queryTimeMs = Date.now() - startTime;

  // Log retrieval for audit
  await logRetrieval(prisma, {
    caseId: input.caseId,
    userId,
    tenantId,
    query: input.query,
    resultCount: filteredCitations.length,
    queryTimeMs,
  });

  return {
    content: contentParts.join('\n\n'),
    citations: filteredCitations,
    totalSources: filteredCitations.length,
    queryTimeMs,
    sanitized: true,
    caseId: input.caseId,
    tenantId,
  };
}

/**
 * Log retrieval operation for audit
 */
async function logRetrieval(
  prisma: PrismaClient,
  data: {
    caseId: string;
    userId: string;
    tenantId: string;
    query: string;
    resultCount: number;
    queryTimeMs: number;
  }
): Promise<void> {
  try {
    await prisma.auditLogEntry.create({
      data: {
        tenantId: data.tenantId,
        eventType: 'CaseRAGRetrieval',
        eventId: `rag_${Date.now()}`,
        actorType: 'USER',
        actorId: data.userId,
        resourceType: 'case',
        resourceId: data.caseId,
        action: 'READ',
        actionResult: 'SUCCESS',
        metadata: {
          query: data.query,
          resultCount: data.resultCount,
          queryTimeMs: data.queryTimeMs,
        },
      },
    });
  } catch {
    // Don't fail retrieval if audit logging fails
    console.error('Failed to log RAG retrieval audit');
  }
}

// ============================================================================
// Human Approval for External Actions
// ============================================================================

export interface ApprovalRequest {
  id: string;
  toolName: string;
  action: string;
  caseId: string;
  userId: string;
  tenantId: string;
  content: string;
  recipients?: string[];
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * Check if an action requires human approval
 */
export function requiresApproval(action: string): boolean {
  const approvalRequiredActions = [
    'send_email',
    'share_externally',
    'export_case',
    'delete_document',
    'change_case_status',
  ];
  return approvalRequiredActions.includes(action);
}

/**
 * Request human approval for an external action
 */
export async function requestApproval(
  prisma: PrismaClient,
  request: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'status'>
): Promise<ApprovalRequest> {
  const approvalRequest: ApprovalRequest = {
    id: `approval_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    ...request,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };

  // Store in database for persistence
  await prisma.pendingApproval.create({
    data: {
      id: approvalRequest.id,
      tenantId: request.tenantId,
      userId: request.userId,
      toolName: request.toolName,
      action: request.action,
      resourceType: 'case',
      resourceId: request.caseId,
      content: request.content,
      recipients: request.recipients || [],
      status: 'PENDING',
    },
  });

  return approvalRequest;
}

// ============================================================================
// LangChain Tool Factory
// ============================================================================

/**
 * Create the retrieve_case_context LangChain tool
 */
export function createRetrieveCaseContextTool(
  prisma: PrismaClient,
  userId: string,
  tenantId: string
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'retrieve_case_context',
    description: `Retrieve relevant context from a legal case including documents, tasks, and notes.
Use this tool when you need to answer questions about a specific case or find relevant information.
The tool returns sanitized content with source citations for traceability.
All retrievals are permission-checked and audit-logged.`,
    schema: retrieveCaseContextInputSchema,
    func: async (input: RetrieveCaseContextInput): Promise<string> => {
      try {
        const result = await retrieveCaseContext(prisma, input, userId, tenantId);

        // Format output with citations
        const output: RetrieveCaseContextOutput = {
          success: true,
          context: result.content,
          citations: result.citations.map(c => ({
            id: c.id,
            sourceType: c.sourceType,
            sourceId: c.sourceId,
            title: c.title,
            retrievedAt: c.retrievedAt,
            relevanceScore: c.relevanceScore,
            snippet: c.snippet,
          })),
          totalSources: result.totalSources,
          queryTimeMs: result.queryTimeMs,
          requiresApproval: false,
        };

        return JSON.stringify(output);
      } catch (error) {
        const output: RetrieveCaseContextOutput = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          requiresApproval: false,
        };
        return JSON.stringify(output);
      }
    },
  });
}

/**
 * Create a send_case_email tool that requires approval
 */
export function createSendCaseEmailTool(
  prisma: PrismaClient,
  userId: string,
  tenantId: string
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'send_case_email',
    description: `Send an email related to a case. This action requires human approval before the email is sent.
Use this tool when you need to send communication about a case to external parties.`,
    schema: z.object({
      caseId: z.string().uuid().describe('The case ID this email relates to'),
      to: z.string().email().describe('Recipient email address'),
      subject: z.string().min(1).max(200).describe('Email subject'),
      body: z.string().min(1).max(10000).describe('Email body content'),
    }),
    func: async (input): Promise<string> => {
      // This action always requires approval
      const approval = await requestApproval(prisma, {
        toolName: 'send_case_email',
        action: 'send_email',
        caseId: input.caseId,
        userId,
        tenantId,
        content: `Subject: ${input.subject}\n\nTo: ${input.to}\n\n${input.body}`,
        recipients: [input.to],
      });

      return JSON.stringify({
        success: false,
        requiresApproval: true,
        approvalId: approval.id,
        approvalReason: 'External email communication requires human approval',
        message: 'Email queued for approval. A human reviewer will approve or reject this action.',
      });
    },
  });
}

export default {
  createRetrieveCaseContextTool,
  createSendCaseEmailTool,
  retrieveCaseContext,
  sanitizeContent,
  wrapWithBoundaries,
  detectInjectionAttempt,
  verifyCaseAccess,
  requiresApproval,
  requestApproval,
};
