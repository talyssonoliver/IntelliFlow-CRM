/**
 * Inbound Router tests — portal /discover -> CRM Lead intake.
 *
 * Covers:
 *  - 401 when bearer missing or wrong
 *  - 500 when PORTAL_INTERNAL_SECRET unset, or tenant/user env missing
 *  - 200 created on first call (leadService.createLead invoked with
 *    correct tenantId/ownerId/source/tags)
 *  - 200 idempotent retry returns the existing lead (created: false)
 *  - Duplicate-email path resolves to the existing lead instead of erroring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { inboundRouter } from '../inbound.router';
import { createTestContext, prismaMock, mockServices } from '../../../test/setup';

const TENANT_ID = '00000000-0000-4000-8000-000000000900';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000901';
// Test-only constant — clearly labelled so the repo-policy pre-commit
// hook does not flag it as a real key. Length must be >= 16 to satisfy
// the inbound router's PORTAL_INTERNAL_SECRET min-length check.
const SECRET = 'test-bearer-do-not-use-in-production';

function headersWith(value: string | undefined): Headers {
  const h = new Headers();
  if (value !== undefined) h.set('Authorization', value);
  return h;
}

function buildCtx(authHeader: string | undefined) {
  return createTestContext({
    req: { headers: headersWith(authHeader) } as unknown as Request,
  });
}

const BASE_INPUT = {
  submissionId: 'submission_abc_123',
  email: 'jane@acme.example',
  firstName: 'Jane',
  lastName: 'Doe',
  company: 'Acme Studios',
  phone: '+44 20 7946 0000',
  website: 'https://acme.example',
  location: 'London, UK',
};

describe('inboundRouter — portal /discover intake', () => {
  beforeEach(() => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const caller = inboundRouter.createCaller(buildCtx(undefined) as never);
    await expect(caller.createLead(BASE_INPUT)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns 401 when bearer token does not match the secret', async () => {
    const caller = inboundRouter.createCaller(buildCtx('Bearer wrong-token') as never);
    await expect(caller.createLead(BASE_INPUT)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns 500 when PORTAL_INTERNAL_SECRET is unset', async () => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', '');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.createLead(BASE_INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('returns 500 when LEANGENCY_TENANT_ID is unset', async () => {
    vi.stubEnv('LEANGENCY_TENANT_ID', '');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.createLead(BASE_INPUT)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('creates a Lead and tags it with the submissionId on first call', async () => {
    // Dedup query: no existing lead with this submission tag
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: 'lead_new_1' } },
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.createLead(BASE_INPUT);

    expect(result).toEqual({
      leadId: 'lead_new_1',
      tenantId: TENANT_ID,
      submissionId: BASE_INPUT.submissionId,
      created: true,
    });

    expect(mockServices.lead.createLead).toHaveBeenCalledTimes(1);
    const call = (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({
      email: BASE_INPUT.email,
      firstName: 'Jane',
      lastName: 'Doe',
      company: 'Acme Studios',
      source: 'WEBSITE',
      ownerId: SYSTEM_USER_ID,
      tenantId: TENANT_ID,
    });
    expect(call.tags).toEqual(
      expect.arrayContaining(['portal-discover', `submission:${BASE_INPUT.submissionId}`])
    );
  });

  it('is idempotent — second call with same submissionId returns existing lead', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: 'lead_existing_1' } as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.createLead(BASE_INPUT);

    expect(result).toEqual({
      leadId: 'lead_existing_1',
      tenantId: TENANT_ID,
      submissionId: BASE_INPUT.submissionId,
      created: false,
    });
    expect(mockServices.lead.createLead).not.toHaveBeenCalled();
  });

  it('on duplicate-email failure, looks up and returns the existing lead', async () => {
    // First lookup (by submission tag) returns null
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: true,
      error: { message: 'Lead with email jane@acme.example already exists' },
    });
    // Fallback lookup (by email) returns the existing lead
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: 'lead_dup_1' } as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.createLead(BASE_INPUT);

    expect(result).toEqual({
      leadId: 'lead_dup_1',
      tenantId: TENANT_ID,
      submissionId: BASE_INPUT.submissionId,
      created: false,
    });
  });

  it('passes extraTags through alongside the auto-applied tags', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: 'lead_tagged_1' } },
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.createLead({ ...BASE_INPUT, extraTags: ['campaign:spring-2026', 'hot'] });

    const call = (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.tags).toEqual([
      'portal-discover',
      `submission:${BASE_INPUT.submissionId}`,
      'campaign:spring-2026',
      'hot',
    ]);
  });

  it('rejects BAD_REQUEST when domain validation fails (non-duplicate)', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: true,
      error: { message: 'Phone number invalid' },
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.createLead(BASE_INPUT)).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
  });
});

describe('inboundRouter.createLead — submission persistence', () => {
  beforeEach(() => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
  });

  const ATTRIBUTION = { utmSource: 'google', utmCampaign: 'spring', clickId: 'gclid_1' };
  const PAYLOAD = { brandName: 'Acme', goals: ['sales'] };

  it('persists submissionPayload and attribution as a NOTE activity on create', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: 'lead_new_2' } },
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.createLead({
      ...BASE_INPUT,
      submissionPayload: PAYLOAD,
      attribution: ATTRIBUTION,
    });

    const arg = prismaMock.leadActivity.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      type: 'NOTE',
      leadId: 'lead_new_2',
      tenantId: TENANT_ID,
      metadata: {
        submissionId: BASE_INPUT.submissionId,
        repeat: false,
        submissionPayload: PAYLOAD,
        attribution: ATTRIBUTION,
      },
    });
  });

  it('writes no activity when neither payload nor attribution is supplied', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: 'lead_new_3' } },
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.createLead(BASE_INPUT);

    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it('records a repeat submission on the existing lead (duplicate email)', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: true,
      error: { message: 'Lead with email jane@acme.example already exists' },
    });
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: 'lead_dup_2' } as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.createLead({ ...BASE_INPUT, attribution: ATTRIBUTION });

    expect(result.created).toBe(false);
    const arg = prismaMock.leadActivity.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(arg.data).toMatchObject({
      type: 'NOTE',
      leadId: 'lead_dup_2',
      metadata: { submissionId: BASE_INPUT.submissionId, repeat: true, attribution: ATTRIBUTION },
    });
  });

  it('does not fail the call when the submission record cannot be written', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: 'lead_new_4' } },
    });
    prismaMock.leadActivity.create.mockRejectedValueOnce(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.createLead({ ...BASE_INPUT, submissionPayload: PAYLOAD });

    expect(result.created).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('rejects attribution values over 512 chars', async () => {
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(
      caller.createLead({ ...BASE_INPUT, attribution: { utmSource: 'x'.repeat(513) } })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('accepts an externalRef uuid and still binds the env tenant (ADR-070 TODO)', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: 'lead_new_5' } },
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.createLead({
      ...BASE_INPUT,
      externalRef: '3f1c2b7e-5d0a-4c53-9a54-6f7a9b1d2e34',
    });

    expect(result.tenantId).toBe(TENANT_ID);
  });

  it('rejects a non-uuid externalRef', async () => {
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(
      caller.createLead({ ...BASE_INPUT, externalRef: 'not-a-uuid' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects a same-length wrong bearer (constant-time compare)', async () => {
    const wrong = 'Y'.repeat(SECRET.length);
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${wrong}`) as never);
    await expect(caller.createLead(BASE_INPUT)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
