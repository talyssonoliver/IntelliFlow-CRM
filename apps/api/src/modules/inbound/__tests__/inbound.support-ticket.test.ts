/**
 * inbound.logSupportTicket — portal support request -> CRM Ticket.
 * Payload shape mirrors forwardSupportTicketToIntelliFlow in leangency-portal.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { inboundRouter } from '../inbound.router';
import { createTestContext, prismaMock, mockServices } from '../../../test/setup';

const TENANT_ID = '00000000-0000-4000-8000-000000000900';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000901';
const SECRET = ['portal', 'test', 'fixture', 'value'].join('-');

function buildCtx(authHeader: string | undefined) {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set('Authorization', authHeader);
  return createTestContext({ req: { headers } as unknown as Request });
}

const PORTAL_PAYLOAD = {
  requestId: 'thread_42',
  email: 'client@acme.example',
  firstName: 'Ana',
  lastName: 'Silva',
  company: 'acme-studio',
  category: 'bug',
  subject: 'Checkout button broken',
  message: 'The pay button does nothing on mobile.',
  source: 'portal',
  extraTags: ['support-request', 'bug'],
};

describe('inbound.logSupportTicket', () => {
  beforeEach(() => {
    prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn(prismaMock)) as never);
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
  });

  it('returns 401 without a bearer', async () => {
    const caller = inboundRouter.createCaller(buildCtx(undefined) as never);
    await expect(caller.logSupportTicket(PORTAL_PAYLOAD)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns 401 for a wrong bearer of a different length', async () => {
    const caller = inboundRouter.createCaller(buildCtx('Bearer nope') as never);
    await expect(caller.logSupportTicket(PORTAL_PAYLOAD)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns 500 when the tenant binding is missing', async () => {
    vi.stubEnv('LEANGENCY_TENANT_ID', '');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.logSupportTicket(PORTAL_PAYLOAD)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('returns 500 when the ticket service is unavailable', async () => {
    const ctx = createTestContext({
      req: { headers: new Headers({ Authorization: `Bearer ${SECRET}` }) } as unknown as Request,
      services: { ticket: undefined } as never,
    });
    const caller = inboundRouter.createCaller(ctx as never);
    await expect(caller.logSupportTicket(PORTAL_PAYLOAD)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
  });

  it('creates a ticket in the bound tenant and writes the idempotency marker', async () => {
    prismaMock.ticketActivity.findFirst.mockResolvedValueOnce(null);
    prismaMock.sLAPolicy.findFirst.mockResolvedValueOnce({ id: 'sla_default' } as never);
    (mockServices.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'ticket_1',
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.logSupportTicket(PORTAL_PAYLOAD);

    expect(result).toEqual({ ticketId: 'ticket_1', created: true });
    expect(mockServices.ticket.create).toHaveBeenCalledWith({
      subject: 'Checkout button broken',
      description: 'The pay button does nothing on mobile.',
      priority: 'HIGH',
      contactName: 'Ana Silva',
      contactEmail: 'client@acme.example',
      slaPolicyId: 'sla_default',
      tenantId: TENANT_ID,
    });
    const marker = prismaMock.ticketActivity.create.mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(marker.data).toMatchObject({
      ticketId: 'ticket_1',
      tenantId: TENANT_ID,
      systemEventType: 'portal_support_request',
      systemEventData: {
        requestId: 'thread_42',
        category: 'bug',
        tenantSlug: 'acme-studio',
        source: 'portal',
        tags: ['support-request', 'bug'],
      },
    });
  });

  it('runs lookup, ticket and marker in one transaction under a per-requestId advisory lock', async () => {
    prismaMock.ticketActivity.findFirst.mockResolvedValueOnce(null);
    prismaMock.sLAPolicy.findFirst.mockResolvedValueOnce(null);
    (mockServices.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'ticket_9',
    });
    prismaMock.$queryRaw.mockClear();

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.logSupportTicket(PORTAL_PAYLOAD);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const [strings, ...values] = prismaMock.$queryRaw.mock.calls[0] as unknown as [
      string[],
      ...unknown[],
    ];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    expect(values).toEqual(['support:thread_42']);
    const lockOrder = prismaMock.$queryRaw.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(
      prismaMock.ticketActivity.findFirst.mock.invocationCallOrder[0]!
    );
    expect(lockOrder).toBeLessThan(
      (mockServices.ticket.create as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!
    );
  });

  it('falls back to email as contact name, MEDIUM priority and no default SLA', async () => {
    prismaMock.ticketActivity.findFirst.mockResolvedValueOnce(null);
    prismaMock.sLAPolicy.findFirst.mockResolvedValueOnce(null);
    (mockServices.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'ticket_2',
    });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.logSupportTicket({
      requestId: 'thread_43',
      email: 'solo@acme.example',
      subject: 'Question',
      message: 'How do I export?',
    });

    expect(mockServices.ticket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contactName: 'solo@acme.example',
        priority: 'MEDIUM',
        slaPolicyId: undefined,
      })
    );
  });

  it('is idempotent on requestId and returns the existing ticket with created:false', async () => {
    prismaMock.ticketActivity.findFirst.mockResolvedValueOnce({ ticketId: 'ticket_1' } as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.logSupportTicket(PORTAL_PAYLOAD);

    expect(result).toEqual({ ticketId: 'ticket_1', created: false });
    expect(mockServices.ticket.create).not.toHaveBeenCalled();
    expect(prismaMock.ticketActivity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT_ID,
          systemEventType: 'portal_support_request',
          systemEventData: { path: ['requestId'], equals: 'thread_42' },
        },
      })
    );
  });

  it('maps a service failure to BAD_REQUEST', async () => {
    prismaMock.ticketActivity.findFirst.mockResolvedValueOnce(null);
    prismaMock.sLAPolicy.findFirst.mockResolvedValueOnce(null);
    (mockServices.ticket.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('SLA policy not found')
    );

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.logSupportTicket(PORTAL_PAYLOAD)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'SLA policy not found',
    });
  });

  it('still returns the ticket when the idempotency marker write fails', async () => {
    prismaMock.ticketActivity.findFirst.mockResolvedValueOnce(null);
    prismaMock.sLAPolicy.findFirst.mockResolvedValueOnce(null);
    (mockServices.ticket.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'ticket_3',
    });
    prismaMock.ticketActivity.create.mockRejectedValueOnce(new Error('db down'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.logSupportTicket(PORTAL_PAYLOAD);

    expect(result).toEqual({ ticketId: 'ticket_3', created: true });
    expect(errSpy).toHaveBeenCalled();
  });
});
