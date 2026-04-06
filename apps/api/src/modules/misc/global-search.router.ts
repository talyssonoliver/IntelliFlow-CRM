/**
 * Global Search Router
 *
 * Provides a single tRPC endpoint that fans out a text query across all
 * core CRM entity tables (leads, contacts, accounts, deals, tickets, tasks)
 * in parallel and returns normalised, grouped results.
 *
 * Uses the same ILIKE/contains pattern already proven in the individual
 * entity routers and in `agent/tools/search.ts`.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, tenantProcedure } from '../../trpc';

// ── Input schema ────────────────────────────────────────────────────────

const GLOBAL_SEARCH_ENTITY_TYPES = [
  'LEAD',
  'CONTACT',
  'ACCOUNT',
  'DEAL',
  'TICKET',
  'TASK',
] as const;

type GlobalSearchEntityType = (typeof GLOBAL_SEARCH_ENTITY_TYPES)[number];

const globalSearchInputSchema = z.object({
  query: z.string().min(1).max(200).trim(),
  /** Max results per entity type. */
  limit: z.number().int().min(1).max(10).default(5),
  /** Restrict search to specific entity types (default: all). */
  entityTypes: z
    .array(z.enum(GLOBAL_SEARCH_ENTITY_TYPES))
    .min(1)
    .optional(),
});

// ── Result types ────────────────────────────────────────────────────────

interface GlobalSearchHit {
  entityType: GlobalSearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

export interface GlobalSearchResponse {
  results: GlobalSearchHit[];
  totalCount: number;
  durationMs: number;
}

// ── Per-entity Prisma queries ───────────────────────────────────────────

function ilike(query: string) {
  return { contains: query, mode: 'insensitive' as const };
}

type PrismaAny = any;

async function searchLeads(
  prisma: PrismaAny,
  tenantId: string,
  query: string,
  limit: number
): Promise<GlobalSearchHit[]> {
  const rows = await prisma.lead.findMany({
    where: {
      tenantId,
      OR: [
        { email: ilike(query) },
        { firstName: ilike(query) },
        { lastName: ilike(query) },
        { company: ilike(query) },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      company: true,
    },
  });

  return rows.map((r: any) => ({
    entityType: 'LEAD' as const,
    id: r.id,
    title: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
    subtitle: r.company ?? r.email,
    href: `/leads/${r.id}`,
  }));
}

async function searchContacts(
  prisma: any,
  tenantId: string,
  query: string,
  limit: number
): Promise<GlobalSearchHit[]> {
  const rows = await prisma.contact.findMany({
    where: {
      tenantId,
      OR: [
        { email: ilike(query) },
        { firstName: ilike(query) },
        { lastName: ilike(query) },
        { title: ilike(query) },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      title: true,
    },
  });

  return rows.map((r: any) => ({
    entityType: 'CONTACT' as const,
    id: r.id,
    title: `${r.firstName} ${r.lastName}`,
    subtitle: r.title ?? r.email,
    href: `/contacts/${r.id}`,
  }));
}

async function searchAccounts(
  prisma: any,
  tenantId: string,
  query: string,
  limit: number
): Promise<GlobalSearchHit[]> {
  const rows = await prisma.account.findMany({
    where: {
      tenantId,
      OR: [
        { name: ilike(query) },
        { website: ilike(query) },
        { industry: ilike(query) },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, industry: true },
  });

  return rows.map((r: any) => ({
    entityType: 'ACCOUNT' as const,
    id: r.id,
    title: r.name,
    subtitle: r.industry ?? null,
    href: `/accounts/${r.id}`,
  }));
}

async function searchDeals(
  prisma: any,
  tenantId: string,
  query: string,
  limit: number
): Promise<GlobalSearchHit[]> {
  const rows = await prisma.opportunity.findMany({
    where: {
      tenantId,
      OR: [
        { name: ilike(query) },
        { description: ilike(query) },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      stage: true,
      value: true,
    },
  });

  return rows.map((r: any) => ({
    entityType: 'DEAL' as const,
    id: r.id,
    title: r.name,
    subtitle: `${r.stage} · $${Number(r.value).toLocaleString('en-GB')}`,
    href: `/deals/${r.id}`,
  }));
}

async function searchTickets(
  prisma: any,
  tenantId: string,
  query: string,
  limit: number
): Promise<GlobalSearchHit[]> {
  const rows = await prisma.ticket.findMany({
    where: {
      tenantId,
      OR: [
        { subject: ilike(query) },
        { description: ilike(query) },
        { ticketNumber: ilike(query) },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      subject: true,
      ticketNumber: true,
      status: true,
    },
  });

  return rows.map((r: any) => ({
    entityType: 'TICKET' as const,
    id: r.id,
    title: r.subject,
    subtitle: `#${r.ticketNumber} · ${r.status}`,
    href: `/support/tickets/${r.id}`,
  }));
}

async function searchTasks(
  prisma: any,
  tenantId: string,
  query: string,
  limit: number
): Promise<GlobalSearchHit[]> {
  const rows = await prisma.task.findMany({
    where: {
      tenantId,
      OR: [
        { title: ilike(query) },
        { description: ilike(query) },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
    },
  });

  return rows.map((r: any) => ({
    entityType: 'TASK' as const,
    id: r.id,
    title: r.title,
    subtitle: `${r.priority} · ${r.status}`,
    href: `/tasks/${r.id}`,
  }));
}

// ── Dispatcher map ──────────────────────────────────────────────────────

const SEARCH_DISPATCHERS: Record<
  GlobalSearchEntityType,
  (prisma: any, tenantId: string, query: string, limit: number) => Promise<GlobalSearchHit[]>
> = {
  LEAD: searchLeads,
  CONTACT: searchContacts,
  ACCOUNT: searchAccounts,
  DEAL: searchDeals,
  TICKET: searchTickets,
  TASK: searchTasks,
};

// ── Router ──────────────────────────────────────────────────────────────

export const globalSearchRouter = createTRPCRouter({
  query: tenantProcedure
    .input(globalSearchInputSchema)
    .query(async ({ ctx, input }): Promise<GlobalSearchResponse> => {
      const tenantId = ctx.tenant.tenantId;
      const prisma = ctx.prismaWithTenant;

      if (!prisma) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database client not available',
        });
      }

      const startTime = performance.now();
      const typesToSearch = input.entityTypes ?? [...GLOBAL_SEARCH_ENTITY_TYPES];

      // Fan out all entity searches in parallel
      const settled = await Promise.allSettled(
        typesToSearch.map((type) =>
          SEARCH_DISPATCHERS[type](prisma, tenantId, input.query, input.limit)
        )
      );

      const results: GlobalSearchHit[] = [];
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          results.push(...outcome.value);
        }
        // Silently skip failed entity searches — partial results are acceptable
      }

      const durationMs = Math.round(performance.now() - startTime);

      if (durationMs > 500) {
        console.warn(
          `[globalSearch.query] SLOW: ${durationMs}ms for "${input.query}" (target: <500ms)`
        );
      }

      return {
        results,
        totalCount: results.length,
        durationMs,
      };
    }),
});
