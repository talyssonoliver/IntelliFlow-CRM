/**
 * Prisma implementation of DsarTransferRepositoryPort (IFC-317, UK GDPR Art 20(2)).
 *
 * Runs on the API's own connection (no tenant context), like PrismaDsarRepository: the public
 * download finds its row by the token's HMAC alone. Every admin method scopes by tenantId.
 * Using or revoking a link is one conditional UPDATE (unused, not revoked, not expired), with its
 * event written in the same transaction, so a link is used at most once and every use has its
 * record. Events are unique per (transfer, kind), so a repeated write is a no-op.
 */
import type { PrismaClient } from '@intelliflow/db';
import type {
  DsarTransferEventRecord,
  DsarTransferRecord,
  DsarTransferRepositoryPort,
  DsarTransferWithEvents,
  NewDsarTransfer,
  NewTransferEvent,
} from '@intelliflow/application';

const TRANSFER = {
  id: true,
  tenantId: true,
  requestId: true,
  recipientName: true,
  recipientEmail: true,
  basis: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  createdById: true,
  createdAt: true,
} as const;

const EVENT = {
  id: true,
  transferId: true,
  kind: true,
  actorType: true,
  actorId: true,
  via: true,
  occurredAt: true,
  actor: { select: { name: true, email: true } },
} as const;

type EventRow = {
  id: string;
  transferId: string;
  kind: string;
  actorType: string;
  actorId: string | null;
  via: string | null;
  occurredAt: Date;
  actor: { name: string | null; email: string } | null;
};

function toEvent(row: EventRow): DsarTransferEventRecord {
  return {
    id: row.id,
    transferId: row.transferId,
    kind: row.kind as DsarTransferEventRecord['kind'],
    actorType: row.actorType as DsarTransferEventRecord['actorType'],
    actorId: row.actorId,
    actorLabel: row.actor ? row.actor.name || row.actor.email : null,
    via: row.via as DsarTransferEventRecord['via'],
    occurredAt: row.occurredAt,
  };
}

const STEP_ORDER: Record<string, number> = {
  CREATED: 0,
  SENT: 1,
  DOWNLOADED: 2,
  EXPIRED: 3,
  REVOKED: 4,
};

/** Oldest first; steps stamped with the same instant (created and sent) keep their natural order. */
function byTimeThenStep(a: DsarTransferEventRecord, b: DsarTransferEventRecord): number {
  return (
    a.occurredAt.getTime() - b.occurredAt.getTime() || STEP_ORDER[a.kind]! - STEP_ORDER[b.kind]!
  );
}

export class PrismaDsarTransferRepository implements DsarTransferRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewDsarTransfer): Promise<DsarTransferRecord> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.dsarTransfer.create({
        data: {
          tenantId: input.tenantId,
          requestId: input.requestId,
          recipientName: input.recipientName,
          recipientEmail: input.recipientEmail,
          basis: input.basis,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdById: input.createdById,
        },
        select: TRANSFER,
      });
      await tx.dsarTransferEvent.create({
        data: {
          tenantId: input.tenantId,
          requestId: input.requestId,
          transferId: row.id,
          kind: 'CREATED',
          actorType: 'ADMIN',
          actorId: input.createdById,
          occurredAt: input.now,
        },
      });
      return row;
    });
  }

  async listForRequest(tenantId: string, requestId: string): Promise<DsarTransferWithEvents[]> {
    const rows = await this.prisma.dsarTransfer.findMany({
      where: { tenantId, requestId },
      orderBy: { createdAt: 'asc' },
      select: {
        ...TRANSFER,
        events: { select: EVENT },
      },
    });
    return rows.map(({ events, ...transfer }) => ({
      ...transfer,
      events: events.map(toEvent).sort(byTimeThenStep),
    }));
  }

  findForTenant(tenantId: string, id: string): Promise<DsarTransferRecord | null> {
    return this.prisma.dsarTransfer.findFirst({ where: { id, tenantId }, select: TRANSFER });
  }

  findByTokenHash(tokenHash: string): Promise<DsarTransferRecord | null> {
    return this.prisma.dsarTransfer.findUnique({ where: { tokenHash }, select: TRANSFER });
  }

  async claim(id: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dsarTransfer.updateMany({
        where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (updated.count !== 1) return false;
      const row = await tx.dsarTransfer.findUniqueOrThrow({
        where: { id },
        select: { tenantId: true, requestId: true },
      });
      await tx.dsarTransferEvent.create({
        data: {
          tenantId: row.tenantId,
          requestId: row.requestId,
          transferId: id,
          kind: 'DOWNLOADED',
          actorType: 'RECIPIENT',
          occurredAt: now,
        },
      });
      return true;
    });
  }

  async revoke(tenantId: string, id: string, actorId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dsarTransfer.updateMany({
        where: { id, tenantId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (updated.count !== 1) return false;
      const row = await tx.dsarTransfer.findUniqueOrThrow({
        where: { id },
        select: { requestId: true },
      });
      await tx.dsarTransferEvent.create({
        data: {
          tenantId,
          requestId: row.requestId,
          transferId: id,
          kind: 'REVOKED',
          actorType: 'ADMIN',
          actorId,
          occurredAt: now,
        },
      });
      return true;
    });
  }

  async recordEvent(
    tenantId: string,
    transferId: string,
    event: NewTransferEvent
  ): Promise<boolean> {
    const transfer = await this.prisma.dsarTransfer.findFirst({
      where: { id: transferId, tenantId },
      select: { requestId: true },
    });
    if (!transfer) return false;
    const inserted = await this.prisma.dsarTransferEvent.createMany({
      data: [
        {
          tenantId,
          requestId: transfer.requestId,
          transferId,
          kind: event.kind,
          actorType: event.actorType,
          actorId: event.actorId ?? null,
          via: event.via ?? null,
          occurredAt: event.occurredAt,
        },
      ],
      // (transferId, kind) is unique: a second SENT, say, writes nothing.
      skipDuplicates: true,
    });
    return inserted.count === 1;
  }

  async recordExpiries(
    scope: { tenantId: string; requestId?: string; transferId?: string },
    now: Date
  ): Promise<void> {
    const expired = await this.prisma.dsarTransfer.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(scope.requestId ? { requestId: scope.requestId } : {}),
        ...(scope.transferId ? { id: scope.transferId } : {}),
        usedAt: null,
        revokedAt: null,
        expiresAt: { lte: now },
        events: { none: { kind: 'EXPIRED' } },
      },
      select: { id: true, requestId: true, expiresAt: true },
    });
    if (expired.length === 0) return;
    await this.prisma.dsarTransferEvent.createMany({
      data: expired.map((t) => ({
        tenantId: scope.tenantId,
        requestId: t.requestId,
        transferId: t.id,
        kind: 'EXPIRED',
        actorType: 'SYSTEM',
        occurredAt: t.expiresAt,
      })),
      skipDuplicates: true,
    });
  }
}
