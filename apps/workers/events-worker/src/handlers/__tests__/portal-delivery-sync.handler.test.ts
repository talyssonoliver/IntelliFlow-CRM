import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPortalDeliverySyncHandler,
  type PortalDeliverySyncHandlerDeps,
} from '../portal-delivery-sync.handler';
import type { OutboxEvent } from '../../outbox/event-dispatcher';

const OPP = 'opp_1';
const TENANT = 'tenant_1';

function makeEvent(overrides: Record<string, unknown> = {}): OutboxEvent {
  return {
    id: 'evt_1',
    eventType: 'opportunity.deal_won_enriched',
    aggregateId: OPP,
    payload: {
      opportunityId: OPP,
      tenantId: TENANT,
      closedAt: '2026-06-01T00:00:00.000Z',
      opportunityName: 'Acme Deal',
      ...overrides,
    },
  } as unknown as OutboxEvent;
}

function makeDeps(): {
  deps: PortalDeliverySyncHandlerDeps;
  findUnique: ReturnType<typeof vi.fn>;
  findByOpportunity: ReturnType<typeof vi.fn>;
  provisionTenant: ReturnType<typeof vi.fn>;
  pushDelivery: ReturnType<typeof vi.fn>;
} {
  const findUnique = vi.fn().mockResolvedValue({
    tenantSlug: 'acme',
    deliveryTier: 'CORE',
    name: 'Acme Opportunity',
    account: { name: 'Acme Ltd' },
    contact: { email: 'owner@acme.com' },
  });
  const findByOpportunity = vi.fn().mockResolvedValue([
    {
      n: 1,
      amountCents: 16700,
      currency: 'GBP',
      status: 'due',
      dueAt: new Date('2026-06-01T00:00:00.000Z'),
      paidAt: null,
    },
    {
      n: 2,
      amountCents: 16700,
      currency: 'GBP',
      status: 'paid',
      dueAt: new Date('2026-06-08T00:00:00.000Z'),
      paidAt: new Date('2026-06-08T09:00:00.000Z'),
    },
  ]);
  const provisionTenant = vi.fn().mockResolvedValue({ isFailure: false });
  const pushDelivery = vi.fn().mockResolvedValue({ isFailure: false });

  const deps: PortalDeliverySyncHandlerDeps = {
    prisma: { opportunity: { findUnique } } as any,
    setupInstalments: { findByOpportunity } as any,
    portalSync: { provisionTenant, pushDelivery } as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { deps, findUnique, findByOpportunity, provisionTenant, pushDelivery };
}

describe('createPortalDeliverySyncHandler', () => {
  let h: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    h = makeDeps();
  });

  it('provisions then pushes for a portal deal', async () => {
    await createPortalDeliverySyncHandler(h.deps)(makeEvent());

    expect(h.provisionTenant).toHaveBeenCalledWith({
      slug: 'acme',
      name: 'Acme Ltd',
      authorizedEmails: ['owner@acme.com'],
      sourceLeadId: null,
    });

    const pushArg = h.pushDelivery.mock.calls[0][0];
    expect(pushArg.slug).toBe('acme');
    expect(pushArg.tier).toBe('core'); // DB 'CORE' -> api 'core'
    expect(pushArg.phase).toBe('pending_onboarding');
    expect(pushArg.signedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(pushArg.crmDealId).toBe(OPP);
    expect(pushArg.setupInstalments).toHaveLength(2);
    expect(pushArg.setupInstalments[0]).toEqual({
      n: 1,
      amountCents: 16700,
      currency: 'GBP',
      status: 'due',
      dueAt: '2026-06-01T00:00:00.000Z',
      paidAt: null,
    });
    expect(pushArg.setupInstalments[1].paidAt).toBe('2026-06-08T09:00:00.000Z');
  });

  it('provisions before pushing (order)', async () => {
    const order: string[] = [];
    h.provisionTenant.mockImplementation(async () => {
      order.push('provision');
      return { isFailure: false };
    });
    h.pushDelivery.mockImplementation(async () => {
      order.push('push');
      return { isFailure: false };
    });
    await createPortalDeliverySyncHandler(h.deps)(makeEvent());
    expect(order).toEqual(['provision', 'push']);
  });

  it('skips entirely when the opportunity has no tenantSlug (not a portal deal)', async () => {
    h.findUnique.mockResolvedValue({
      tenantSlug: null,
      deliveryTier: null,
      name: 'X',
      account: null,
      contact: { email: 'x@y.com' },
    });
    await createPortalDeliverySyncHandler(h.deps)(makeEvent());
    expect(h.provisionTenant).not.toHaveBeenCalled();
    expect(h.pushDelivery).not.toHaveBeenCalled();
  });

  it('skips when the opportunity row is not found', async () => {
    h.findUnique.mockResolvedValue(null);
    await createPortalDeliverySyncHandler(h.deps)(makeEvent());
    expect(h.provisionTenant).not.toHaveBeenCalled();
  });

  it('skips (no provision/push) when there is no contact email to own the portal', async () => {
    h.findUnique.mockResolvedValue({
      tenantSlug: 'acme',
      deliveryTier: 'CORE',
      name: 'Acme',
      account: { name: 'Acme Ltd' },
      contact: null,
    });
    await createPortalDeliverySyncHandler(h.deps)(makeEvent());
    expect(h.provisionTenant).not.toHaveBeenCalled();
    expect(h.pushDelivery).not.toHaveBeenCalled();
    expect(h.deps.logger.error).toHaveBeenCalled();
  });

  it('warns and skips when opportunityId/tenantId are missing', async () => {
    const event = makeEvent({ opportunityId: undefined, tenantId: undefined });
    // aggregateId still supplies opportunityId, so blank that too:
    (event as any).aggregateId = '';
    await createPortalDeliverySyncHandler(h.deps)(event);
    expect(h.findUnique).not.toHaveBeenCalled();
    expect(h.deps.logger.warn).toHaveBeenCalled();
  });

  it('falls back to opportunity name then slug when account name is absent', async () => {
    h.findUnique.mockResolvedValue({
      tenantSlug: 'acme',
      deliveryTier: null,
      name: 'Opp Name',
      account: null,
      contact: { email: 'o@a.com' },
    });
    await createPortalDeliverySyncHandler(h.deps)(makeEvent());
    expect(h.provisionTenant.mock.calls[0][0].name).toBe('Opp Name');
    // deliveryTier null -> tier omitted
    expect(h.pushDelivery.mock.calls[0][0].tier).toBeUndefined();
  });

  it('pushes an empty instalment array when none are persisted', async () => {
    h.findByOpportunity.mockResolvedValue([]);
    await createPortalDeliverySyncHandler(h.deps)(makeEvent());
    expect(h.pushDelivery.mock.calls[0][0].setupInstalments).toEqual([]);
  });

  it('throws (for outbox retry) when provisioning fails', async () => {
    h.provisionTenant.mockResolvedValue({ isFailure: true, error: { message: 'HTTP 500' } });
    await expect(createPortalDeliverySyncHandler(h.deps)(makeEvent())).rejects.toThrow(
      /provision failed/
    );
    expect(h.pushDelivery).not.toHaveBeenCalled();
  });

  it('throws (for outbox retry) when the delivery push fails', async () => {
    h.pushDelivery.mockResolvedValue({ isFailure: true, error: { message: 'HTTP 404' } });
    await expect(createPortalDeliverySyncHandler(h.deps)(makeEvent())).rejects.toThrow(
      /delivery push failed/
    );
  });

  it('uses aggregateId as the opportunityId when payload omits it', async () => {
    const event = makeEvent({ opportunityId: undefined });
    await createPortalDeliverySyncHandler(h.deps)(event);
    expect(h.findUnique.mock.calls[0][0].where.id).toBe(OPP);
  });
});
