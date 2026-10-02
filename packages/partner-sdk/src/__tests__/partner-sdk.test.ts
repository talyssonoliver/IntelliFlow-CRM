import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PROCEDURES,
  buildContract,
  createPartnerClient,
  PartnerApiError,
  SESSION_PROCEDURES,
  assertionClaimsSchema,
  toErrorReason,
  type ProcedureName,
} from '../index';

const UUID = '3f2b8c1e-5a7d-4e29-9b64-0c1d2e3f4a5b';

/** One valid example input and output per procedure. */
const FIXTURES: Record<ProcedureName, { input: unknown; output: unknown }> = {
  'partner.provisionTenant': {
    input: {
      externalRef: UUID,
      name: 'Acme Ltd',
      plan: 'PARTNER_FREE',
      ownerEmail: 'owner@acme.test',
    },
    output: { tenantId: 'c1', slug: 'acme-ltd-3f2b8c1e', plan: 'PARTNER_FREE', created: true },
  },
  'partner.getTenant': {
    input: { externalRef: UUID },
    output: { tenantId: 'c1', slug: 'acme', plan: 'STARTER', status: 'ACTIVE' },
  },
  'partner.setPlan': {
    input: { tenantId: 'c1', plan: 'PROFESSIONAL' },
    output: { tenantId: 'c1', plan: 'PROFESSIONAL' },
  },
  'partner.inviteMember': {
    input: { tenantId: 'c1', email: 'a@acme.test', role: 'MEMBER' },
    output: { userId: 'u1', created: true },
  },
  'partner.issueLoginLink': {
    input: {
      tenantId: 'c1',
      email: 'a@acme.test',
      redirectTo: 'https://app.example.com/crm',
      assertion: 'eyJhbGciOiJFZERTQSJ9.e30.c2ln',
    },
    output: {
      url: 'https://auth.example.com/verify?token=x',
      expiresAt: '2026-09-30T13:00:00Z',
      pinned: true,
      role: 'ADMIN',
    },
  },
  'partner.removeMember': {
    input: { tenantId: 'c1', email: 'a@acme.test' },
    output: { removed: true },
  },
  'partner.setMemberRole': {
    input: { tenantId: 'c1', email: 'a@acme.test', role: 'ADMIN' },
    output: { userId: 'u1', role: 'ADMIN', changed: true },
  },
  'partner.listMembers': {
    input: { tenantId: 'c1' },
    output: {
      tenantId: 'c1',
      members: [
        {
          userId: 'u1',
          email: 'a@acme.test',
          name: null,
          role: 'MEMBER',
          source: 'PORTAL_STAFF',
          pinned: true,
          expiresAt: '2026-10-02T12:00:00Z',
          createdAt: '2026-10-01T12:00:00Z',
        },
      ],
    },
  },
  'partner.getUsage': {
    input: { tenantId: 'c1' },
    output: {
      tenantId: 'c1',
      plan: 'PARTNER_FREE',
      modules: ['CORE_CRM'],
      quotas: {
        contacts: { used: 1, limit: null },
        seats: { used: 1, limit: 3 },
        emailsPerMonth: { used: 0, limit: null, measured: true },
        aiSpendCentsPerMonth: { used: 0, limit: null, measured: false },
      },
      asOf: '2026-09-30T12:00:00Z',
    },
  },
  'inbound.createLead': {
    input: {
      submissionId: 's1',
      externalRef: UUID,
      email: 'lead@x.test',
      attribution: { utmSource: 'google', utmCampaign: 'spring', clickId: 'gclid123' },
    },
    output: { leadId: 'l1', tenantId: 'c1', submissionId: 's1', created: true },
  },
  'inbound.logCallBooking': {
    input: { submissionId: 'b1', email: 'lead@x.test', callDate: '2026-10-01', callTime: '10:30' },
    output: {
      leadId: 'l1',
      tenantId: 'c1',
      submissionId: 'b1',
      leadCreated: false,
      appointmentId: 'a1',
      taskId: null,
    },
  },
  'inbound.logSupportTicket': {
    input: {
      requestId: 'r1',
      email: 'client@x.test',
      category: 'bug',
      subject: 'Broken page',
      message: 'The page is broken',
    },
    output: { ticketId: 't1', tenantId: 'c1', requestId: 'r1', created: true },
  },
};

describe('contract fixtures', () => {
  it('has a fixture for every procedure', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(PROCEDURES).sort());
  });

  for (const [name, def] of Object.entries(PROCEDURES)) {
    it(`${name}: input and output schemas parse their example fixture`, () => {
      const fx = FIXTURES[name as ProcedureName];
      expect(def.input.safeParse(fx.input).success).toBe(true);
      expect(def.output.safeParse(fx.output).success).toBe(true);
    });
  }

  it('rejects the invalid shapes the contract forbids', () => {
    const p = PROCEDURES;
    expect(p['partner.provisionTenant'].input.safeParse({ externalRef: 'nope' }).success).toBe(
      false
    );
    expect(
      p['partner.provisionTenant'].input.safeParse({
        ...(FIXTURES['partner.provisionTenant'].input as object),
        plan: 'CUSTOM',
      }).success
    ).toBe(false);
    expect(
      p['partner.provisionTenant'].input.safeParse({
        ...(FIXTURES['partner.provisionTenant'].input as object),
        slug: 'Bad Slug',
      }).success
    ).toBe(false);
    expect(
      p['partner.inviteMember'].input.safeParse({ tenantId: 'c', email: 'a@b.co', role: 'OWNER' })
        .success
    ).toBe(false);
  });
});

describe('published contract file', () => {
  it('contract/partner-contract.v1.json is up to date with the zod schemas', () => {
    const path = fileURLToPath(new URL('../../contract/partner-contract.v1.json', import.meta.url));
    const onDisk = JSON.parse(readFileSync(path, 'utf-8'));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(buildContract())));
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createPartnerClient', () => {
  it('POSTs the raw input for a mutation and parses the output', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ result: { data: FIXTURES['partner.setPlan'].output } }));
    const client = createPartnerClient({
      baseUrl: 'https://crm.example.com/',
      apiKey: 'pk_test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const out = await client.setPlan({ tenantId: 'c1', plan: 'PROFESSIONAL' });

    expect(out).toEqual({ tenantId: 'c1', plan: 'PROFESSIONAL' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://crm.example.com/api/trpc/partner.setPlan');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer pk_test');
    expect(JSON.parse(init.body)).toEqual({ tenantId: 'c1', plan: 'PROFESSIONAL' });
  });

  it('GETs with ?input= for a query, and passes a null result through', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: { data: null } }));
    const client = createPartnerClient({
      baseUrl: 'https://crm.example.com',
      apiKey: 'pk_test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(await client.getTenant({ externalRef: UUID })).toBeNull();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe('GET');
    expect(url).toBe(
      `https://crm.example.com/api/trpc/partner.getTenant?input=${encodeURIComponent(
        JSON.stringify({ externalRef: UUID })
      )}`
    );
  });

  it('supports the inbound procedures through call()', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ result: { data: FIXTURES['inbound.logSupportTicket'].output } })
      );
    const client = createPartnerClient({
      baseUrl: 'https://crm.example.com',
      apiKey: 'pk_test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const out = await client.call(
      'inbound.logSupportTicket',
      FIXTURES['inbound.logSupportTicket'].input as never
    );

    expect(out.ticketId).toBe('t1');
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'https://crm.example.com/api/trpc/inbound.logSupportTicket'
    );
  });

  it('maps a tRPC error envelope to PartnerApiError with its code', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: 'nope', data: { code: 'FORBIDDEN' } } }, 403)
      );
    const client = createPartnerClient({
      baseUrl: 'https://crm.example.com',
      apiKey: 'pk_test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(client.setPlan({ tenantId: 'c1', plan: 'STARTER' })).rejects.toMatchObject({
      name: 'PartnerApiError',
      code: 'FORBIDDEN',
      httpStatus: 403,
    });
  });

  it('reports unknown error codes, non-JSON bodies and malformed success bodies', async () => {
    const make = (res: Response) =>
      createPartnerClient({
        baseUrl: 'https://crm.example.com',
        apiKey: 'pk_test',
        fetch: (async () => res) as unknown as typeof fetch,
      });

    await expect(
      make(jsonResponse({ error: { message: 'x', data: { code: 'WEIRD' } } }, 500)).setPlan({
        tenantId: 'c1',
        plan: 'STARTER',
      })
    ).rejects.toMatchObject({ code: 'UNKNOWN' });

    await expect(
      make(new Response('<html>', { status: 502 })).setPlan({ tenantId: 'c1', plan: 'STARTER' })
    ).rejects.toBeInstanceOf(PartnerApiError);

    await expect(
      make(jsonResponse({ something: 'else' }, 200)).setPlan({ tenantId: 'c1', plan: 'STARTER' })
    ).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('rejects invalid input before any network call, and invalid output after', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ result: { data: { bad: true } } }));
    const client = createPartnerClient({
      baseUrl: 'https://crm.example.com',
      apiKey: 'pk_test',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(client.setPlan({ tenantId: '', plan: 'STARTER' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(client.setPlan({ tenantId: 'c1', plan: 'STARTER' })).rejects.toThrow();
  });
});

describe('inherited membership contract (ADR-071)', () => {
  const claims = {
    iss: 'leangency',
    aud: 'intelliflow-crm',
    sub: 'owner@agency.test',
    tenant: { externalRef: UUID },
    kind: 'staff',
    role: 'ADMIN',
    iat: 1_790_000_000,
    exp: 1_790_000_060,
    jti: 'AbCdEfGhIjKlMnOpQrSt',
  };

  it('accepts a well-formed assertion and rejects the forbidden shapes', () => {
    expect(assertionClaimsSchema.safeParse(claims).success).toBe(true);
    const bad = (patch: object) => assertionClaimsSchema.safeParse({ ...claims, ...patch }).success;
    expect(bad({ exp: claims.iat + 61 })).toBe(false);
    expect(bad({ exp: claims.iat })).toBe(false);
    expect(bad({ aud: 'other' })).toBe(false);
    expect(bad({ sub: 'Owner@Agency.test' })).toBe(false);
    expect(bad({ kind: 'admin' })).toBe(false);
    expect(bad({ role: 'OWNER' })).toBe(false);
    expect(bad({ jti: 'short' })).toBe(false);
    expect(bad({ tenant: {} })).toBe(false);
    expect(bad({ tenant: { externalRef: UUID, tenantId: 'c1' } })).toBe(false);
    expect(bad({ extra: 1 })).toBe(false);
  });

  it('keeps assertion optional on issueLoginLink input (flag-off compatibility)', () => {
    expect(
      PROCEDURES['partner.issueLoginLink'].input.safeParse({ tenantId: 'c1', email: 'a@b.co' })
        .success
    ).toBe(true);
  });

  it('registers the session procedures outside the partner registry', () => {
    expect(Object.keys(SESSION_PROCEDURES).sort()).toEqual([
      'user.claimLoginGrant',
      'user.listTenants',
    ]);
    for (const name of Object.keys(SESSION_PROCEDURES)) {
      expect(name in PROCEDURES).toBe(false);
    }
  });

  it('extracts the machine-readable reason from data.reason or the message prefix', () => {
    expect(toErrorReason('x', 'NOT_A_MEMBER')).toBe('NOT_A_MEMBER');
    expect(toErrorReason('ACCOUNT_IN_OTHER_TENANT: nope', undefined)).toBe(
      'ACCOUNT_IN_OTHER_TENANT'
    );
    expect(toErrorReason('EMAIL_IN_USE: legacy', undefined)).toBeNull();
    expect(toErrorReason('plain', 'BOGUS')).toBeNull();
  });

  it('surfaces the reason on PartnerApiError', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { error: { message: 'STAFF_NOT_PROVISIONED: no', data: { code: 'FORBIDDEN' } } },
          403
        )
      );
    const client = createPartnerClient({
      baseUrl: 'https://crm.example.com',
      apiKey: 'pk_test',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const err = await client
      .issueLoginLink({ tenantId: 'c1', email: 'a@b.co' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PartnerApiError);
    expect((err as PartnerApiError).reason).toBe('STAFF_NOT_PROVISIONED');
    expect((err as PartnerApiError).code).toBe('FORBIDDEN');
  });
});
