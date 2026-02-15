/**
 * Mock OpenAPI spec data for PG-033 API Docs tests.
 */

export const mockOpenAPISpec = {
  openapi: '3.0.3' as const,
  info: {
    title: 'IntelliFlow CRM API',
    version: '1.0.0',
    description: 'Type-safe tRPC API for IntelliFlow CRM.',
    contact: {
      name: 'IntelliFlow Team',
      email: 'support@intelliflow-crm.com',
    },
  },
  servers: [
    { url: 'http://localhost:3001', description: 'Development' },
    { url: 'https://staging-api.intelliflow-crm.com', description: 'Staging' },
    { url: 'https://api.intelliflow-crm.com', description: 'Production' },
  ],
  tags: [
    { name: 'Leads', description: 'Lead capture, qualification, scoring, conversion' },
    { name: 'Platform & System', description: 'Auth, billing, notifications, health, webhooks' },
  ],
  paths: {
    '/trpc/lead.create': {
      post: {
        tags: ['Leads'],
        summary: 'Create a new lead',
        operationId: 'createLead',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Lead' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Lead created successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Lead' },
              },
            },
            headers: {
              'X-RateLimit-Limit': { schema: { type: 'integer' } },
              'X-RateLimit-Remaining': { schema: { type: 'integer' } },
              'X-RateLimit-Reset': { schema: { type: 'integer' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    '/trpc/lead.list': {
      get: {
        tags: ['Leads'],
        summary: 'List leads with filtering',
        operationId: 'listLeads',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Lead list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    leads: { type: 'array', items: { $ref: '#/components/schemas/Lead' } },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Lead: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          status: { $ref: '#/components/schemas/LeadStatus' },
        },
        required: ['email', 'firstName', 'lastName'],
      },
      LeadStatus: {
        type: 'string',
        enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'],
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request - validation error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'object', properties: { message: { type: 'string' }, code: { type: 'string' } } },
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
                error: { type: 'object', properties: { message: { type: 'string' }, code: { type: 'string' } } },
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
                error: { type: 'object', properties: { message: { type: 'string' }, code: { type: 'string' } } },
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
                error: { type: 'object', properties: { message: { type: 'string' }, code: { type: 'string' } } },
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
                error: { type: 'object', properties: { message: { type: 'string' }, code: { type: 'string' } } },
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
                error: { type: 'object', properties: { message: { type: 'string' }, code: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
};

export const mockEmptySpec = {
  openapi: '3.0.3' as const,
  info: {
    title: 'IntelliFlow CRM API',
    version: '1.0.0',
    description: 'Empty spec',
    contact: { name: 'IntelliFlow Team', email: 'support@intelliflow-crm.com' },
  },
  servers: [{ url: 'http://localhost:3001', description: 'Development' }],
  paths: {},
  components: { schemas: {} },
};

export const mockInvalidSpec = {
  openapi: '3.0.3' as const,
};
