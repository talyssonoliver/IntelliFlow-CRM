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
  Result,
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
  score = 80;
  /** When set, the next findById returns its snapshot, then waits for this gate. */
  pauseNextReadUntil: Promise<void> | null = null;
  constructor(private readonly template: Lead) {}

  private snapshot(): Lead {
    const t = this.template;
    return Lead.reconstitute(t.id, {
      email: t.email,
      source: t.source,
      status: this.status,
      score: { value: this.score, confidence: 1 },
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
    // Mirrors the real adapters: a compare-and-set writes the status, while a
    // plain save writes the score fields but NEVER rewrites `status`.
    if (opts?.expectedStatus !== undefined) {
      this.status = lead.status;
    } else {
      this.score = lead.score.value;
    }
  }
}

function build(repo: RacyLeadRepository, scoreTo = 50): LeadService {
  const tx: TransactionPort = { run: (work) => work({} as never) };
  const bus = {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBusPort;
  return new LeadService(
    repo as unknown as LeadRepository,
    { save: vi.fn().mockResolvedValue(undefined) } as unknown as ContactRepository,
    { save: vi.fn().mockResolvedValue(undefined) } as unknown as AccountRepository,
    {
      scoreLead: vi
        .fn()
        .mockResolvedValue(Result.ok({ score: scoreTo, confidence: 0.9, modelVersion: 'm1' })),
    } as unknown as AIServicePort,
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

describe('LeadService status-changing and scoring saves are compare-and-set safe', () => {
  async function stalePause(repo: RacyLeadRepository, run: () => Promise<unknown>) {
    let release!: () => void;
    repo.pauseNextReadUntil = new Promise<void>((r) => (release = r));
    const pending = run();
    await Promise.resolve();
    return { release, pending };
  }

  it('a stale qualifyLead must conflict, not overwrite a status moved concurrently', async () => {
    const template = makeLead();
    const repo = new RacyLeadRepository(template);
    const service = build(repo);

    const { release, pending } = await stalePause(repo, () =>
      service.qualifyLead(template.id.value, 'user-1', 'looks good')
    );
    repo.status = 'LOST'; // a COA sync wrote LOST after qualifyLead read NEW
    release();
    const result = (await pending) as Result<unknown, Error>;

    expect(result.isFailure).toBe(true);
    expect(repo.status).toBe('LOST');
  });

  it('a stale convertLead must conflict, not overwrite a status moved concurrently', async () => {
    const template = makeLead();
    const repo = new RacyLeadRepository(template);
    repo.status = 'QUALIFIED';
    const service = build(repo);

    const { release, pending } = await stalePause(repo, () =>
      service.convertLead(template.id.value, null, 'user-1')
    );
    repo.status = 'LOST';
    release();
    const result = (await pending) as Result<unknown, Error>;

    expect(result.isFailure).toBe(true);
    expect(repo.status).toBe('LOST');
  });

  it('a scoreLead save keeps a status moved concurrently and still stores the score', async () => {
    const template = makeLead();
    const repo = new RacyLeadRepository(template);
    repo.score = 10;
    const service = build(repo, 50); // neither auto-qualify nor auto-disqualify

    const { release, pending } = await stalePause(repo, () => service.scoreLead(template.id.value));
    repo.status = 'CONTACTED';
    release();
    const result = (await pending) as Result<unknown, Error>;

    expect(result.isSuccess).toBe(true);
    expect(repo.status).toBe('CONTACTED');
    expect(repo.score).toBe(50);
  });

  it('a scoreLead auto-qualify against a concurrently moved status conflicts', async () => {
    const template = makeLead();
    const repo = new RacyLeadRepository(template);
    repo.score = 0;
    const service = build(repo, 90); // >= AUTO_QUALIFY while the read status is NEW

    const { release, pending } = await stalePause(repo, () => service.scoreLead(template.id.value));
    repo.status = 'LOST';
    release();
    const result = (await pending) as Result<unknown, Error>;

    expect(result.isFailure).toBe(true);
    expect(repo.status).toBe('LOST');
  });

  it('scoreLead still auto-qualifies when nothing moved the lead', async () => {
    const template = makeLead();
    const repo = new RacyLeadRepository(template);
    repo.score = 0;
    const service = build(repo, 90);

    const result = await service.scoreLead(template.id.value);

    expect(result.isSuccess).toBe(true);
    expect(repo.status).toBe('QUALIFIED');
    expect(repo.score).toBe(90);
  });
});
