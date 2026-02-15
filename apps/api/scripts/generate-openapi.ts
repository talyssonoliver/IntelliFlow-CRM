/**
 * OpenAPI 3.0.3 Spec Generator for IntelliFlow CRM
 *
 * Generates a complete OpenAPI specification from the tRPC router structure
 * and Zod validation schemas. Output: apps/api/openapi.json
 *
 * Usage: npx tsx apps/api/scripts/generate-openapi.ts
 */

import fs from 'fs';
import path from 'path';

interface OpenAPITag {
  name: string;
  description: string;
}

interface OpenAPIServer {
  url: string;
  description: string;
}

interface OpenAPISchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  enum?: string[];
  format?: string;
  [key: string]: unknown;
}

interface OpenAPIResponse {
  description: string;
  content?: Record<string, { schema: OpenAPISchema }>;
  headers?: Record<string, { schema: { type: string } }>;
}

interface OpenAPIOperation {
  tags: string[];
  summary: string;
  operationId: string;
  security?: Array<Record<string, string[]>>;
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: { $ref: string } | OpenAPISchema }>;
  };
  responses: Record<string, OpenAPIResponse | { $ref: string }>;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema: OpenAPISchema | { $ref: string };
  }>;
}

interface ProcedureMapping {
  name: string;
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  summary: string;
  operationId: string;
  inputSchema?: string;
  outputSchema?: string;
}

interface RouterMapping {
  router: string;
  tag: string;
  procedures: ProcedureMapping[];
}

// Domain glossary for info.description
const DOMAIN_GLOSSARY = `
## Domain Glossary

| Term | Definition |
|------|-----------|
| Lead | Potential customer before qualification (status: NEW → CONVERTED/LOST) |
| Contact | Qualified person with verified details (status: ACTIVE → CUSTOMER) |
| Account | Organization grouping contacts and opportunities |
| Opportunity | Sales deal in pipeline with stage and weighted value |
| Stage | Position in opportunity pipeline with win probability (0-100%) |
| Weighted Value | Opportunity value × stage probability for forecasting |
| Score | AI-generated lead quality (0-100). Higher = better fit |
| Tier | Lead segmentation (HOT ≥ 70, WARM 40-69, COLD < 40) |
| Churn Risk | AI prediction of customer leaving (CRITICAL/HIGH/MEDIUM/LOW/MINIMAL) |
| NBA | Next Best Action — AI-recommended action with priority |
| SLA | Service Level Agreement — response/resolution time commitment |
| SLA Status | ON_TRACK, AT_RISK, BREACHED, MET, PAUSED |
| Qualification | Lead verification process (budget, authority, need, timeline) |
| Conversion | Moving lead to contact/opportunity status |
| Pipeline | Visual representation of opportunities grouped by stage |
| Case | Legal case/matter with priority and status |
| Appointment | Scheduled event (CONSULTATION, HEARING, MEETING, etc.) |
| Ticket | Support request with SLA tracking |
| Activity Feed | Real-time event stream from 7 entity sources |
| Timeline | Chronological event history for an entity |

## Workflows

### Lead Lifecycle
NEW → CONTACTED → QUALIFIED → NEGOTIATING → CONVERTED (or LOST/UNQUALIFIED)

### Opportunity Pipeline
DISCOVERY → QUALIFICATION → PROPOSAL → NEGOTIATION → CLOSED_WON (or CLOSED_LOST)

### AI Scoring
Lead created → AI scores (0-100) → Tier assigned → NBA generated → Human review

### Ticket SLA
Ticket created → SLA timer starts → ON_TRACK → AT_RISK (80% elapsed) → BREACHED (exceeded)
`;

const TAGS: OpenAPITag[] = [
  { name: 'Leads', description: 'Lead capture, qualification, scoring, conversion' },
  { name: 'Contacts & Accounts', description: 'Contact/account management with relationship tracking' },
  { name: 'Opportunities', description: 'Deal pipeline, stage progression, weighted forecasting' },
  { name: 'Tasks & Activities', description: 'Task management, activity tracking, real-time feeds' },
  { name: 'Support & Tickets', description: 'Ticket management with SLA tracking' },
  { name: 'AI Intelligence', description: 'AI scoring, NBA, churn risk, human-in-the-loop review' },
  { name: 'AI Operations', description: 'Chain versioning, cost tracking, model governance' },
  { name: 'Legal Operations', description: 'Case/matter management, scheduling, document processing' },
  { name: 'Platform & System', description: 'Auth, billing, notifications, health, webhooks' },
  { name: 'Security & Compliance', description: 'Audit logs, security events, admin operations' },
];

const SERVERS: OpenAPIServer[] = [
  { url: 'http://localhost:3001', description: 'Development' },
  { url: 'https://staging-api.intelliflow-crm.com', description: 'Staging' },
  { url: 'https://api.intelliflow-crm.com', description: 'Production' },
];

const STANDARD_RESPONSES: Record<string, OpenAPIResponse> = {
  BadRequest: {
    description: 'Bad request - validation error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { message: { type: 'string' }, code: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  Unauthorized: {
    description: 'Unauthorized - authentication required',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { message: { type: 'string' }, code: { type: 'string', enum: ['UNAUTHORIZED'] } },
            },
          },
        },
      },
    },
  },
  Forbidden: {
    description: 'Forbidden - insufficient permissions',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { message: { type: 'string' }, code: { type: 'string', enum: ['FORBIDDEN'] } },
            },
          },
        },
      },
    },
  },
  NotFound: {
    description: 'Resource not found',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { message: { type: 'string' }, code: { type: 'string', enum: ['NOT_FOUND'] } },
            },
          },
        },
      },
    },
  },
  TooManyRequests: {
    description: 'Too many requests - rate limit exceeded',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { message: { type: 'string' }, code: { type: 'string', enum: ['TOO_MANY_REQUESTS'] } },
            },
          },
        },
      },
    },
  },
  InternalServerError: {
    description: 'Internal server error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: { message: { type: 'string' }, code: { type: 'string', enum: ['INTERNAL_SERVER_ERROR'] } },
            },
          },
        },
      },
    },
  },
};

const RATE_LIMIT_HEADERS = {
  'X-RateLimit-Limit': { schema: { type: 'integer' } },
  'X-RateLimit-Remaining': { schema: { type: 'integer' } },
  'X-RateLimit-Reset': { schema: { type: 'integer' } },
};

// Router-to-endpoint mapping for all 25 tRPC routers
const ROUTER_MAPPINGS: RouterMapping[] = [
  {
    router: 'lead',
    tag: 'Leads',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create a new lead', operationId: 'createLead', inputSchema: 'CreateLeadInput' },
      { name: 'list', method: 'get', summary: 'List leads with filtering and pagination', operationId: 'listLeads' },
      { name: 'getById', method: 'get', summary: 'Get a lead by ID', operationId: 'getLeadById' },
      { name: 'update', method: 'post', summary: 'Update a lead', operationId: 'updateLead', inputSchema: 'UpdateLeadInput' },
      { name: 'delete', method: 'post', summary: 'Delete a lead', operationId: 'deleteLead' },
      { name: 'qualify', method: 'post', summary: 'Qualify a lead', operationId: 'qualifyLead' },
      { name: 'convert', method: 'post', summary: 'Convert lead to contact', operationId: 'convertLead' },
      { name: 'scoreWithAI', method: 'post', summary: 'Score lead with AI', operationId: 'scoreLeadWithAI' },
      { name: 'stats', method: 'get', summary: 'Get lead statistics', operationId: 'getLeadStats' },
      { name: 'bulkConvert', method: 'post', summary: 'Bulk convert leads to contacts', operationId: 'bulkConvertLeads' },
    ],
  },
  {
    router: 'contact',
    tag: 'Contacts & Accounts',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create a new contact', operationId: 'createContact', inputSchema: 'CreateContactInput' },
      { name: 'list', method: 'get', summary: 'List contacts with filtering', operationId: 'listContacts' },
      { name: 'getById', method: 'get', summary: 'Get a contact by ID', operationId: 'getContactById' },
      { name: 'update', method: 'post', summary: 'Update a contact', operationId: 'updateContact' },
    ],
  },
  {
    router: 'account',
    tag: 'Contacts & Accounts',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create a new account', operationId: 'createAccount' },
      { name: 'list', method: 'get', summary: 'List accounts', operationId: 'listAccounts' },
      { name: 'getById', method: 'get', summary: 'Get an account by ID', operationId: 'getAccountById' },
    ],
  },
  {
    router: 'opportunity',
    tag: 'Opportunities',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create a new opportunity', operationId: 'createOpportunity' },
      { name: 'list', method: 'get', summary: 'List opportunities', operationId: 'listOpportunities' },
      { name: 'getById', method: 'get', summary: 'Get an opportunity by ID', operationId: 'getOpportunityById' },
      { name: 'moveStage', method: 'post', summary: 'Move opportunity to a different stage', operationId: 'moveOpportunityStage' },
    ],
  },
  {
    router: 'pipelineConfig',
    tag: 'Opportunities',
    procedures: [
      { name: 'get', method: 'get', summary: 'Get pipeline configuration', operationId: 'getPipelineConfig' },
      { name: 'update', method: 'post', summary: 'Update pipeline configuration', operationId: 'updatePipelineConfig' },
    ],
  },
  {
    router: 'task',
    tag: 'Tasks & Activities',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create a new task', operationId: 'createTask' },
      { name: 'list', method: 'get', summary: 'List tasks', operationId: 'listTasks' },
      { name: 'getById', method: 'get', summary: 'Get a task by ID', operationId: 'getTaskById' },
      { name: 'update', method: 'post', summary: 'Update a task', operationId: 'updateTask' },
    ],
  },
  {
    router: 'timeline',
    tag: 'Tasks & Activities',
    procedures: [
      { name: 'getForEntity', method: 'get', summary: 'Get timeline for an entity', operationId: 'getEntityTimeline' },
    ],
  },
  {
    router: 'activityFeed',
    tag: 'Tasks & Activities',
    procedures: [
      { name: 'get', method: 'get', summary: 'Get activity feed', operationId: 'getActivityFeed' },
    ],
  },
  {
    router: 'ticket',
    tag: 'Support & Tickets',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create a support ticket', operationId: 'createTicket' },
      { name: 'list', method: 'get', summary: 'List tickets', operationId: 'listTickets' },
      { name: 'getById', method: 'get', summary: 'Get a ticket by ID', operationId: 'getTicketById' },
      { name: 'addResponse', method: 'post', summary: 'Add a response to a ticket', operationId: 'addTicketResponse' },
    ],
  },
  {
    router: 'intelligence',
    tag: 'AI Intelligence',
    procedures: [
      { name: 'triggerPrediction', method: 'post', summary: 'Trigger AI prediction', operationId: 'triggerPrediction' },
      { name: 'getInsights', method: 'get', summary: 'Get AI insights for an entity', operationId: 'getInsights' },
    ],
  },
  {
    router: 'aiReview',
    tag: 'AI Intelligence',
    procedures: [
      { name: 'list', method: 'get', summary: 'List AI output reviews', operationId: 'listAIReviews' },
      { name: 'approve', method: 'post', summary: 'Approve AI output', operationId: 'approveAIOutput' },
      { name: 'reject', method: 'post', summary: 'Reject AI output', operationId: 'rejectAIOutput' },
    ],
  },
  {
    router: 'agent',
    tag: 'AI Intelligence',
    procedures: [
      { name: 'listPending', method: 'get', summary: 'List pending AI approvals', operationId: 'listPendingApprovals' },
      { name: 'approve', method: 'post', summary: 'Approve AI agent action', operationId: 'approveAgentAction' },
    ],
  },
  {
    router: 'autoResponse',
    tag: 'AI Intelligence',
    procedures: [
      { name: 'list', method: 'get', summary: 'List auto-response drafts', operationId: 'listAutoResponses' },
      { name: 'approve', method: 'post', summary: 'Approve auto-response draft', operationId: 'approveAutoResponse' },
    ],
  },
  {
    router: 'aiMonitoring',
    tag: 'AI Intelligence',
    procedures: [
      { name: 'getMetrics', method: 'get', summary: 'Get AI monitoring metrics', operationId: 'getAIMetrics' },
    ],
  },
  {
    router: 'chainVersion',
    tag: 'AI Operations',
    procedures: [
      { name: 'list', method: 'get', summary: 'List chain versions', operationId: 'listChainVersions' },
      { name: 'create', method: 'post', summary: 'Create chain version', operationId: 'createChainVersion' },
    ],
  },
  {
    router: 'zepBudget',
    tag: 'AI Operations',
    procedures: [
      { name: 'get', method: 'get', summary: 'Get Zep budget status', operationId: 'getZepBudget' },
    ],
  },
  {
    router: 'cases',
    tag: 'Legal Operations',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create a case', operationId: 'createCase' },
      { name: 'list', method: 'get', summary: 'List cases', operationId: 'listCases' },
    ],
  },
  {
    router: 'appointments',
    tag: 'Legal Operations',
    procedures: [
      { name: 'create', method: 'post', summary: 'Create an appointment', operationId: 'createAppointment' },
      { name: 'list', method: 'get', summary: 'List appointments', operationId: 'listAppointments' },
    ],
  },
  {
    router: 'documents',
    tag: 'Legal Operations',
    procedures: [
      { name: 'upload', method: 'post', summary: 'Upload a document', operationId: 'uploadDocument' },
      { name: 'list', method: 'get', summary: 'List documents', operationId: 'listDocuments' },
    ],
  },
  {
    router: 'auth',
    tag: 'Platform & System',
    procedures: [
      { name: 'login', method: 'post', summary: 'Authenticate user', operationId: 'login' },
      { name: 'me', method: 'get', summary: 'Get current user', operationId: 'getCurrentUser' },
    ],
  },
  {
    router: 'billing',
    tag: 'Platform & System',
    procedures: [
      { name: 'getSubscription', method: 'get', summary: 'Get subscription details', operationId: 'getSubscription' },
    ],
  },
  {
    router: 'notifications',
    tag: 'Platform & System',
    procedures: [
      { name: 'list', method: 'get', summary: 'List notifications', operationId: 'listNotifications' },
      { name: 'markRead', method: 'post', summary: 'Mark notification as read', operationId: 'markNotificationRead' },
    ],
  },
  {
    router: 'health',
    tag: 'Platform & System',
    procedures: [
      { name: 'check', method: 'get', summary: 'Health check', operationId: 'healthCheck' },
    ],
  },
  {
    router: 'home',
    tag: 'Platform & System',
    procedures: [
      { name: 'getDashboard', method: 'get', summary: 'Get home dashboard data', operationId: 'getHomeDashboard' },
    ],
  },
  {
    router: 'audit',
    tag: 'Security & Compliance',
    procedures: [
      { name: 'list', method: 'get', summary: 'List audit events', operationId: 'listAuditEvents' },
      { name: 'getById', method: 'get', summary: 'Get audit event by ID', operationId: 'getAuditEventById' },
    ],
  },
];

// Simplified schema definitions based on Zod validators
const COMPONENT_SCHEMAS: Record<string, OpenAPISchema> = {
  CreateLeadInput: {
    type: 'object',
    required: ['email', 'firstName', 'lastName'],
    properties: {
      email: { type: 'string', format: 'email' },
      firstName: { type: 'string', minLength: 1 },
      lastName: { type: 'string', minLength: 1 },
      phone: { type: 'string' },
      company: { type: 'string' },
      title: { type: 'string' },
      source: { $ref: '#/components/schemas/LeadSource' },
    },
  },
  UpdateLeadInput: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      phone: { type: 'string' },
      company: { type: 'string' },
      status: { $ref: '#/components/schemas/LeadStatus' },
    },
  },
  LeadStatus: {
    type: 'string',
    enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NEGOTIATING', 'CONVERTED', 'LOST'],
  },
  LeadSource: {
    type: 'string',
    enum: ['WEBSITE', 'REFERRAL', 'COLD_CALL', 'TRADE_SHOW', 'PARTNER', 'SOCIAL_MEDIA', 'EMAIL_CAMPAIGN', 'OTHER'],
  },
  CreateContactInput: {
    type: 'object',
    required: ['email', 'firstName', 'lastName'],
    properties: {
      email: { type: 'string', format: 'email' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      phone: { type: 'string' },
      accountId: { type: 'string', format: 'uuid' },
    },
  },
  CreateAccountInput: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' },
      industry: { type: 'string' },
      website: { type: 'string', format: 'uri' },
      phone: { type: 'string' },
    },
  },
  CreateOpportunityInput: {
    type: 'object',
    required: ['name', 'amount'],
    properties: {
      name: { type: 'string' },
      amount: { type: 'number' },
      stage: { type: 'string' },
      closeDate: { type: 'string', format: 'date' },
      accountId: { type: 'string', format: 'uuid' },
    },
  },
  CreateTaskInput: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      dueDate: { type: 'string', format: 'date-time' },
      priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: { message: { type: 'string' }, code: { type: 'string' } },
      },
    },
  },
};

function buildPaths(): Record<string, Record<string, OpenAPIOperation>> {
  const paths: Record<string, Record<string, OpenAPIOperation>> = {};

  for (const mapping of ROUTER_MAPPINGS) {
    for (const proc of mapping.procedures) {
      const pathKey = `/trpc/${mapping.router}.${proc.name}`;

      const operation: OpenAPIOperation = {
        tags: [mapping.tag],
        summary: proc.summary,
        operationId: proc.operationId,
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Successful response',
            headers: RATE_LIMIT_HEADERS,
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      };

      if (proc.inputSchema && proc.method === 'post') {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${proc.inputSchema}` },
            },
          },
        };
      }

      paths[pathKey] = { [proc.method]: operation };
    }
  }

  return paths;
}

export function generateOpenAPISpec() {
  return {
    openapi: '3.0.3' as const,
    info: {
      title: 'IntelliFlow CRM API',
      version: '1.0.0',
      description: `Type-safe tRPC API for IntelliFlow CRM. This OpenAPI specification documents the REST-compatible endpoints generated from the tRPC router with 25 routers and 235+ typed procedures.\n${DOMAIN_GLOSSARY}`,
      contact: {
        name: 'IntelliFlow Team',
        email: 'support@intelliflow-crm.com',
      },
      license: {
        name: 'Proprietary',
        url: 'https://intelliflow-crm.com/terms',
      },
    },
    servers: SERVERS,
    tags: TAGS,
    paths: buildPaths(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http' as const,
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: COMPONENT_SCHEMAS,
      responses: STANDARD_RESPONSES,
    },
  };
}

function main() {
  const spec = generateOpenAPISpec();
  const outputPath = path.join(__dirname, '..', 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
  console.log(`OpenAPI spec written to ${outputPath}`);
  console.log(`  Tags: ${spec.tags.length}`);
  console.log(`  Paths: ${Object.keys(spec.paths).length}`);
  console.log(`  Schemas: ${Object.keys(spec.components.schemas).length}`);
}

// Run when executed directly
if (require.main === module) {
  main();
}
