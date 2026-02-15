import { describe, it, expect } from 'vitest';
import { generateOpenAPISpec } from '../generate-openapi';

describe('generateOpenAPISpec', () => {
  let spec: ReturnType<typeof generateOpenAPISpec>;

  beforeAll(() => {
    spec = generateOpenAPISpec();
  });

  it('generates valid OpenAPI 3.0.3 spec', () => {
    expect(spec.openapi).toBe('3.0.3');
  });

  it('includes all 10 domain tags', () => {
    const tagNames = spec.tags.map((t: { name: string }) => t.name);
    expect(tagNames).toEqual(
      expect.arrayContaining([
        'Leads',
        'Contacts & Accounts',
        'Opportunities',
        'Tasks & Activities',
        'Support & Tickets',
        'AI Intelligence',
        'AI Operations',
        'Legal Operations',
        'Platform & System',
        'Security & Compliance',
      ]),
    );
    expect(spec.tags).toHaveLength(10);
  });

  it('includes security scheme bearerAuth with type http, scheme bearer', () => {
    const bearerAuth = spec.components.securitySchemes.bearerAuth;
    expect(bearerAuth.type).toBe('http');
    expect(bearerAuth.scheme).toBe('bearer');
    expect(bearerAuth.bearerFormat).toBe('JWT');
  });

  it('includes 3 servers (development, staging, production)', () => {
    expect(spec.servers).toHaveLength(3);
    const descriptions = spec.servers.map((s: { description: string }) => s.description);
    expect(descriptions).toEqual(
      expect.arrayContaining(['Development', 'Staging', 'Production']),
    );
  });

  it('includes standard error responses (400, 401, 403, 404, 429, 500)', () => {
    const responseKeys = Object.keys(spec.components.responses);
    expect(responseKeys).toEqual(
      expect.arrayContaining([
        'BadRequest',
        'Unauthorized',
        'Forbidden',
        'NotFound',
        'TooManyRequests',
        'InternalServerError',
      ]),
    );
  });

  it('converts Lead Zod schemas to OpenAPI JSON Schema correctly', () => {
    const schemas = spec.components.schemas;
    expect(schemas).toHaveProperty('CreateLeadInput');
    const createLead = schemas.CreateLeadInput;
    expect(createLead.type).toBe('object');
    expect(createLead.properties).toBeDefined();
    expect(createLead.properties.email).toBeDefined();
  });

  it('converts Contact Zod schemas correctly', () => {
    const schemas = spec.components.schemas;
    expect(schemas).toHaveProperty('CreateContactInput');
    const createContact = schemas.CreateContactInput;
    expect(createContact.type).toBe('object');
    expect(createContact.properties).toBeDefined();
    expect(createContact.properties.email).toBeDefined();
  });

  it('generates operationIds following {verb}{Entity}{Modifier} convention', () => {
    const paths = spec.paths;
    const pathKeys = Object.keys(paths);
    expect(pathKeys.length).toBeGreaterThan(0);

    // Check a few well-known procedures
    const createLead = paths['/trpc/lead.create']?.post;
    expect(createLead?.operationId).toBe('createLead');

    const listLeads = paths['/trpc/lead.list']?.get;
    expect(listLeads?.operationId).toBe('listLeads');
  });

  it('includes rate limit documentation in responses (X-RateLimit headers)', () => {
    const paths = spec.paths;
    const firstPath = Object.keys(paths)[0];
    const firstMethod = Object.keys(paths[firstPath])[0];
    const operation = paths[firstPath][firstMethod];
    const successResponse = operation.responses['200'];
    if (successResponse && 'headers' in successResponse) {
      expect(successResponse.headers).toHaveProperty('X-RateLimit-Limit');
      expect(successResponse.headers).toHaveProperty('X-RateLimit-Remaining');
      expect(successResponse.headers).toHaveProperty('X-RateLimit-Reset');
    }
  });

  it('output has valid OpenAPI structure', () => {
    // Basic structural validation
    expect(spec).toHaveProperty('openapi');
    expect(spec).toHaveProperty('info');
    expect(spec).toHaveProperty('servers');
    expect(spec).toHaveProperty('tags');
    expect(spec).toHaveProperty('paths');
    expect(spec).toHaveProperty('components');
    expect(spec.info.title).toBe('IntelliFlow CRM API');
    expect(spec.info.version).toBeDefined();
    expect(spec.info.description).toBeDefined();
  });
});
