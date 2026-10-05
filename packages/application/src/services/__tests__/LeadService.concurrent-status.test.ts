/**
 * LeadService - concurrent status change (S-0204, PR #747 pre-ship finding
 * "non-atomic-forward-only-transition").
 *
 * changeLeadStatus reads the lead, validates the transition against that
 * snapshot, then saves. A sync that read NEW and paused before saving used to
 * write CONTACTED over a CONVERTED lead that another sync had finished walking.
 *
 * The fake repository below behaves like the real persistence layer: findById
 * hands out an independent snapshot, and save honours `expectedStatus` as a
 * compare-and-set. It is NOT a mock of a refused transition: the stale write
 * is a genuinely successful write unless the service passes expectedStatus.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  Lead,
  LeadId,
  LeadStatusConflictError,
  type LeadRepository,
  type LeadStatus,
} from '@intelliflow/domain';
import { LeadService } from '../LeadService';
import type { AIServicePort, EventBusPort } from '../../ports/external';
import type { ContactRepository, AccountRepository } from '../../ports/repositories';
import type { TransactionPort } from '../../ports/TransactionPort';

function makeLead(): Lead {
  const r = Lead.create({
    email: 'sync@example.invalid',
    source: 'EMAIL',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
  } as never);
  if (r.isFailure) throw new Error(r.error.message);
  return r.value;
}

class RacyLeadRepository {
  status: LeadStatus = 'NEW';
  /** When set, the next findById returns its snapshot, then waits for this gate. */
  pauseNextReadUntil: Promise<void> | null = null;
  constructor(private readonly template: Lead) {}

  private snapshot(): Lead {
    const t = this.template;
    return Lead.reconstitute(t.id, {
      email: t.email,
      source: t.source,
      status: this.status,
      score: { value: t.score.value, confidence: 1 },
      ownerId: t.ownerId,
      tenantId: t.tenantId,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    } as never);
  }

  async findById(_id: LeadId): Promise<Lead | null> {
    const snap = this.snapshot();
    const gate = this.pauseNextReadUntil;
    this.pauseNextReadUntil = null;
    if (gate) await gate;
    return snap;
  }

  async save(lead: Lead, opts?: { expectedStatus?: string }): Promise<void> {
    if (opts?.expectedStatus !== undefined && this.status !== opts.expectedStatus) {
      throw new LeadStatusConflictError(lead.id.value, opts.expectedStatus);
    }
    this.status = lead.status;
  }
}

function build(repo: RacyLeadRepository): LeadService {
  const tx: TransactionPort = { run: (work) => work({} as never) };
  const bus = {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBusPort;
  return new LeadService(
    repo as unknown as LeadRepository,
    {} as ContactRepository,
    {} as AccountRepository,
    {} as AIServicePort,
    bus,
    tx
  );
}

describe('LeadService.changeLeadStatus concurrency', () => {
  it('a stale CONTACTED write after another sync reached CONVERTED must not land', async () => {
    const template = makeLead();
    const repo = new RacyLeadRepository(template);
    const service = build(repo);
    const id = template.id.value;

    // Sync A reads NEW and pauses before saving.
    let release!: () => void;
    repo.pauseNextReadUntil = new Promise<void>((r) => (release = r));
    const stale = service.changeLeadStatus(id, 'CONTACTED', 'sync-a');
    await Promise.resolve();

    // Sync B completes NEW -> CONTACTED -> QUALIFIED -> NEGOTIATING -> CONVERTED.
    for (const step of ['CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'CONVERTED'] as const) {
      const r = await service.changeLeadStatus(id, step, 'sync-b');
      expect(r.isSuccess).toBe(true);
    }
    expect(repo.status).toBe('CONVERTED');

    release();
    const staleResult = await stale;

    expect(repo.status).toBe('CONVERTED');
    expect(staleResult.isFailure).toBe(true);
  });

  it('still applies a transition when nothing moved the lead', async () => {
    const template = makeLead();
    const repo = new RacyLeadRepository(template);
    const service = build(repo);

    const r = await service.changeLeadStatus(template.id.value, 'CONTACTED', 'sync-a');

    expect(r.isSuccess).toBe(true);
    expect(repo.status).toBe('CONTACTED');
  });
});
