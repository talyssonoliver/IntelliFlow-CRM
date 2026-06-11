/**
 * Contact Router (IFC-089)
 *
 * Provides type-safe tRPC endpoints for contact management:
 * - CRUD operations (create, read, update, delete)
 * - List with filtering and pagination
 * - Optimized search with <200ms target (KPI requirement)
 * - Link/unlink from accounts
 *
 * Uses ContactService from application layer (hexagonal architecture)
 *
 * @see Sprint 5 - IFC-089: Contacts Module - Create/Edit/Search
 */

import { context as otelContext, propagation } from '@opentelemetry/api';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
// IFC-312 audit fix F7: type the listReplyDrafts .map() result instead of `any`.
import type { ContactReplyDraft } from '@intelliflow/db';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import {
  assertCanDeleteContact,
  assertRequiredContactFields,
  capitalizeName,
  loadContactAutomation,
  loadRequiredContactFields,
  normalizePhone,
} from './contact-automation';
import {
  createContactSchema,
  updateContactSchema,
  updateContactEmailSchema,
  contactQuerySchema,
  idSchema,
  linkToLeadSchema,
  unlinkFromLeadSchema,
  contactTimelineSchema,
  contactTimelineResponseSchema,
  logActivitySchema,
  addContactNoteSchema,
  reassignContactSchema,
  bulkReassignContactsSchema,
  contactSuggestTagsInputSchema,
  contactSuggestTagsOutputSchema,
  contactGenerateInsightInputSchema,
  contactGenerateInsightOutputSchema,
  contactDraftReplyInputSchema,
  contactDraftReplyOutputSchema,
  contactListReplyDraftsInputSchema,
  contactListReplyDraftsOutputSchema,
  contactAddTagsInputSchema,
  contactAddTagsOutputSchema,
  type UpdateContactInput,
} from '@intelliflow/validators/contact';
import {
  bulkEmailContactsSchema,
  bulkExportContactsSchema,
  bulkDeleteContactsSchema,
} from '@intelliflow/validators';
import {
  performContactReassign,
  emitContactReassignSideEffects,
  logContactReassignPermissionDenied,
} from './contact-reassign';
import { mapContactToResponse } from '../../shared/mappers';
import type { Context } from '../../context';
import { loadBullMQ } from '../../lib/load-bullmq';
import {
  getTenantContext,
  createTenantWhereClause,
  type TenantAwareContext,
} from '../../security/tenant-context';
import { deriveContactInsights } from '../../shared/contact-insight-deriver';
import { requiredProdEnv } from '@intelliflow/validators/required-url';

/**
 * Search schema optimized for performance
 * Minimal fields to enable fast database queries
 */
const contactSearchSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().positive().max(50).default(20),
  includeAccount: z.boolean().default(false),
});

type UpdateContactData = Record<string, unknown> & {
  phone?: string | { toValue?: () => string };
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  status?: string;
  streetAddress?: string;
  city?: string;
  zipCode?: string;
  company?: string;
  linkedInUrl?: string;
  contactType?: string;
  tags?: string[];
  contactNotes?: string;
};

const CONTACT_INFO_FIELDS = [
  'firstName',
  'lastName',
  'title',
  'department',
  'status',
  'streetAddress',
  'city',
  'zipCode',
  'company',
  'linkedInUrl',
  'contactType',
  'tags',
  'contactNotes',
] as const;

/**
 * Build the info-update payload from a contact update input, extracting
 * all scalar fields and resolving the phone Value Object.
 */
function buildContactInfoUpdates(data: UpdateContactData): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of CONTACT_INFO_FIELDS) {
    if (data[field] !== undefined) updates[field] = data[field];
  }
  if (data.phone !== undefined) {
    updates.phone = typeof data.phone === 'string' ? data.phone : data.phone?.toValue?.();
  }
  return updates;
}

/**
 * Build the base WHERE clause for the contacts list query.
 * Extracted to reduce cognitive complexity of the list procedure.
 */
function buildContactListWhere(filters: {
  search?: string;
  accountId?: string;
  ownerId?: string;
  department?: string;
  status?: string;
}): Record<string, unknown> {
  const { search, accountId, ownerId, department, status } = filters;
  const baseWhere: Record<string, unknown> = {};

  if (search) {
    baseWhere.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { department: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (accountId) baseWhere.accountId = accountId;
  if (ownerId) baseWhere.ownerId = ownerId;
  if (department) baseWhere.department = { contains: department, mode: 'insensitive' };
  if (status) baseWhere.status = status;

  return baseWhere;
}

/**
 * Helper to get contact service with null check
 */
function getContactService(ctx: Context) {
  if (!ctx.services?.contact) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Contact service not available',
    });
  }
  return ctx.services.contact;
}

// ── Error-mapping helpers (reduce cognitive complexity in procedures) ──

function throwContactCreateError(message: string): never {
  if (message.includes('already exists')) {
    throw new TRPCError({ code: 'CONFLICT', message });
  }
  if (message.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

function throwContactAssociationError(message: string): never {
  if (message.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  if (message.includes('already associated')) {
    throw new TRPCError({ code: 'CONFLICT', message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

function throwContactLinkLeadError(message: string): never {
  if (message.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message });
  }
  if (message.includes('already linked') || message.includes('Unique constraint')) {
    throw new TRPCError({ code: 'CONFLICT', message });
  }
  if (message.includes('same tenant')) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

/**
 * Handle account disassociation (null accountId) in update
 */
async function handleDisassociateAccount(
  contactService: ReturnType<typeof getContactService>,
  id: string,
  userId: string
): Promise<void> {
  const result = await contactService.disassociateFromAccount(id, userId);
  if (result.isFailure && !result.error.message.includes('not associated')) {
    const msg = result.error.message;
    throw new TRPCError({
      code: msg.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: msg,
    });
  }
}

/**
 * Handle account association (non-null accountId) in update
 */
async function handleAssociateAccount(
  contactService: ReturnType<typeof getContactService>,
  id: string,
  accountId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  const result = await contactService.associateWithAccount(id, accountId, userId, tenantId);
  if (result.isFailure) {
    const msg = result.error.message;
    throw new TRPCError({
      code: msg.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: msg,
    });
  }
}

/**
 * Parse a base64-encoded cursor string into timestamp and ID components.
 */
function parseTimelineCursor(cursor: string): { timestamp: Date; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [ts, id] = decoded.split(':');
    return { timestamp: new Date(ts), id };
  } catch {
    return null;
  }
}

/**
 * Build the cursor filter for a paginated task query.
 */
function buildTaskCursorFilter(
  cursorTimestamp: Date,
  cursorId: string | undefined,
  sortOrder: 'asc' | 'desc'
): Record<string, unknown> {
  return {
    OR: [
      { createdAt: sortOrder === 'desc' ? { lt: cursorTimestamp } : { gt: cursorTimestamp } },
      { createdAt: cursorTimestamp, id: cursorId ? { lt: cursorId } : undefined },
    ],
  };
}

type PrismaWithTenant = TenantAwareContext['prismaWithTenant'];
type NoteRecord = { id: string; content: string; createdAt: Date };

/**
 * Fetch contact notes using a raw SQL query with optional date filter.
 * IFC-254: Fixed table name ("notes" → "contact_notes"), added tenantId filter,
 * and replaced silent error swallowing with logged error handling.
 */
async function fetchContactNotes(
  prismaWithTenant: PrismaWithTenant,
  contactId: string,
  tenantId: string,
  dateFilter: { gte?: Date; lte?: Date },
  fetchLimit: number
): Promise<NoteRecord[]> {
  const handleError = (err: unknown): NoteRecord[] => {
    console.error('[fetchContactNotes] Query failed', { contactId, error: err });
    return [] as NoteRecord[];
  };

  if (dateFilter.gte && dateFilter.lte) {
    return prismaWithTenant.$queryRaw<NoteRecord[]>`
      SELECT id, content, "createdAt" FROM "contact_notes"
      WHERE "contactId" = ${contactId}
        AND "tenantId" = ${tenantId}
        AND "createdAt" >= ${dateFilter.gte}
        AND "createdAt" <= ${dateFilter.lte}
      ORDER BY "createdAt" DESC
      LIMIT ${fetchLimit}
    `.catch(handleError);
  }

  if (dateFilter.gte) {
    return prismaWithTenant.$queryRaw<NoteRecord[]>`
      SELECT id, content, "createdAt" FROM "contact_notes"
      WHERE "contactId" = ${contactId}
        AND "tenantId" = ${tenantId}
        AND "createdAt" >= ${dateFilter.gte}
      ORDER BY "createdAt" DESC
      LIMIT ${fetchLimit}
    `.catch(handleError);
  }

  if (dateFilter.lte) {
    return prismaWithTenant.$queryRaw<NoteRecord[]>`
      SELECT id, content, "createdAt" FROM "contact_notes"
      WHERE "contactId" = ${contactId}
        AND "tenantId" = ${tenantId}
        AND "createdAt" <= ${dateFilter.lte}
      ORDER BY "createdAt" DESC
      LIMIT ${fetchLimit}
    `.catch(handleError);
  }

  return prismaWithTenant.$queryRaw<NoteRecord[]>`
    SELECT id, content, "createdAt" FROM "contact_notes"
    WHERE "contactId" = ${contactId}
      AND "tenantId" = ${tenantId}
    ORDER BY "createdAt" DESC
    LIMIT ${fetchLimit}
  `.catch(handleError);
}

// ---------------------------------------------------------------------------
// update procedure helpers (reduce cognitive complexity)
// ---------------------------------------------------------------------------

type ContactFlags = { autoCapitalizeNames: boolean; normalizePhoneNumbers: boolean };

function extractRawPhone(phone: { value: string } | null | undefined): string | null | undefined {
  if (phone === undefined) return undefined;
  if (phone === null) return null;
  return phone.value;
}

function buildContactCheckFields(
  data: { company?: string | null; jobTitle?: string | null; ownerId?: string | null },
  rawPhone: string | null | undefined
): {
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  ownerId?: string | null;
} {
  return {
    ...(rawPhone !== undefined ? { phone: rawPhone } : {}),
    ...(data.company !== undefined ? { company: data.company } : {}),
    ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle } : {}),
    ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
  };
}

function buildHygienedContactData(
  data: UpdateContactData & { firstName?: string | null; lastName?: string | null },
  rawPhone: string | null | undefined,
  flags: ContactFlags
): UpdateContactData {
  return {
    ...data,
    ...(data.firstName !== undefined
      ? { firstName: capitalizeName(data.firstName, flags) ?? data.firstName }
      : {}),
    ...(data.lastName !== undefined
      ? { lastName: capitalizeName(data.lastName, flags) ?? data.lastName }
      : {}),
    ...(rawPhone !== undefined ? { phone: normalizePhone(rawPhone, flags) ?? undefined } : {}),
  };
}

// IFC-311: Reassign helpers extracted to ./contact-reassign for clean coverage scoping.

// ─── Contact helper functions ────────────────────────────────────────────────

/** IFC-312: Fire-and-forget AI enrichment queue job for a contact entity. */
async function enqueueContactAIEnrichment(entityId: string, tenantId: string): Promise<void> {
  try {
    const { Queue } = await loadBullMQ();
    const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
    const queue = new Queue(QUEUE_NAMES.AI_ENRICHMENT, {
      connection: {
        host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
        port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    });
    const otelCarrier: Record<string, string> = {};
    propagation.inject(otelContext.active(), otelCarrier);
    await queue.add('enrich', {
      entityType: 'contact',
      entityId,
      tenantId,
      _otelCarrier: otelCarrier,
    });
    await queue.close();
  } catch {
    // Redis/BullMQ unavailable — silently skip background enrichment
  }
}

/** Apply info-field updates and throw on failure. */
async function applyContactInfoUpdates(
  contactService: ReturnType<typeof getContactService>,
  id: string,
  hygienedData: UpdateContactData,
  userId: string
): Promise<void> {
  const infoUpdates = buildContactInfoUpdates(hygienedData);
  if (Object.keys(infoUpdates).length === 0) return;
  const result = await contactService.updateContactInfo(id, infoUpdates as any, userId);
  if (result.isFailure) {
    throw new TRPCError({
      code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
      message: result.error.message,
    });
  }
}

/** Handle account association change (associate, disassociate, or no-op). */
async function applyContactAccountChange(
  contactService: ReturnType<typeof getContactService>,
  id: string,
  accountId: string | null | undefined,
  userId: string,
  tenantId: string
): Promise<void> {
  if (accountId === undefined) return;
  if (accountId === null) {
    await handleDisassociateAccount(contactService, id, userId);
  } else {
    await handleAssociateAccount(contactService, id, accountId, userId, tenantId);
  }
}

// ─── Extracted procedure handlers ───────────────────────────────────────────

async function handleContactUpdate(ctx: Context, input: UpdateContactInput) {
  const typedCtx = getTenantContext(ctx);
  const { id, accountId, ...data } = input;
  const contactService = getContactService(ctx);

  // PG-182: apply hygiene + required-field policy before building the update.
  const [flags, requiredFields] = await Promise.all([
    loadContactAutomation(typedCtx),
    loadRequiredContactFields(typedCtx),
  ]);

  // Phone arrives as PhoneNumber VO; unwrap to plain string for the hygiene helpers.
  const rawPhone = extractRawPhone(data.phone as { value: string } | null | undefined);

  assertRequiredContactFields(
    buildContactCheckFields(
      data as { company?: string | null; jobTitle?: string | null; ownerId?: string | null },
      rawPhone
    ),
    requiredFields,
    'update'
  );

  const hygienedData = buildHygienedContactData(data as UpdateContactData, rawPhone, flags);

  // IFC-310: Duplicate-detection runtime — best-effort, non-blocking.
  const duplicateService = ctx.services?.contactDuplicateDetection;
  if (duplicateService) {
    try {
      await duplicateService.checkForUpdate(
        typedCtx,
        id,
        {
          email: (hygienedData as { email?: string | null }).email ?? null,
          phone: rawPhone,
          firstName: (hygienedData as { firstName?: string | null }).firstName ?? null,
          lastName: (hygienedData as { lastName?: string | null }).lastName ?? null,
          company: (hygienedData as { company?: string | null }).company ?? null,
        },
        flags
      );
    } catch (error) {
      console.warn('[contact.router] duplicate-detection on update failed, proceeding:', error);
    }
  }

  await applyContactInfoUpdates(
    contactService,
    id,
    hygienedData as UpdateContactData,
    typedCtx.tenant.userId
  );
  await applyContactAccountChange(
    contactService,
    id,
    accountId,
    typedCtx.tenant.userId,
    typedCtx.tenant.tenantId
  );

  // Fetch updated contact
  const updatedResult = await contactService.getContactById(id);
  if (updatedResult.isFailure) {
    throw new TRPCError({ code: 'NOT_FOUND', message: updatedResult.error.message });
  }

  // IFC-312 audit fix F1: wire AI_ENRICHMENT producer on update.
  if (flags.aiEnrichment) {
    await enqueueContactAIEnrichment(id, typedCtx.tenant.tenantId);
  }

  return mapContactToResponse(updatedResult.value);
}

export const contactRouter = createTRPCRouter({
  /**
   * Create a new contact using ContactService
   */
  create: tenantProcedure.input(createContactSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    // PG-182: apply tenant hygiene policy + required-field enforcement
    // before handing off to the domain service.
    const [flags, requiredFields] = await Promise.all([
      loadContactAutomation(typedCtx),
      loadRequiredContactFields(typedCtx),
    ]);

    // Phone arrives as a PhoneNumber value-object from phoneSchema — unwrap
    // to a plain string so the PG-182 hygiene helpers (that pre-date the VO)
    // and the required-fields check both see the raw value.
    const rawPhone: string | null = input.phone ? input.phone.value : null;

    assertRequiredContactFields(
      {
        email: input.email,
        phone: rawPhone,
        company: (input as { company?: string | null }).company,
        jobTitle: (input as { jobTitle?: string | null }).jobTitle,
        ownerId: typedCtx.tenant.userId, // always satisfied for create — owner is caller
      },
      requiredFields,
      'create'
    );

    const normalizedPhone = normalizePhone(rawPhone, flags);

    const hygieneInput = {
      ...input,
      firstName: capitalizeName(input.firstName, flags) ?? input.firstName,
      lastName: capitalizeName(input.lastName, flags) ?? input.lastName,
      // CreateContactProps.phone accepts `string | PhoneNumber | undefined`.
      // Pass the normalized string (service will re-wrap via PhoneNumber.create)
      // or omit the key entirely when we normalized to "no phone".
      phone: normalizedPhone ?? undefined,
    };

    // IFC-310: Duplicate-detection runtime — reads ContactDuplicateRule rows,
    // consults autoMergeOnExactEmail/notifyOnDuplicate/aiDuplicateDetection.
    const duplicateService = ctx.services?.contactDuplicateDetection;
    type DupeCheck =
      | { action: 'proceed'; matches: unknown[] }
      | { action: 'flag'; matches: unknown[] }
      | { action: 'auto-merge'; matches: unknown[]; primaryId: string };
    let dupeCheck: DupeCheck = {
      action: 'proceed',
      matches: [],
    };
    if (duplicateService) {
      try {
        dupeCheck = (await duplicateService.checkForCreate(
          typedCtx,
          {
            email: hygieneInput.email,
            phone: normalizedPhone,
            firstName: hygieneInput.firstName,
            lastName: hygieneInput.lastName,
            company: (hygieneInput as { company?: string | null }).company ?? null,
          },
          flags
        )) as DupeCheck;
      } catch (error) {
        console.warn('[contact.router] duplicate-detection failed, proceeding:', error);
      }
    }

    const result = await contactService.createContact({
      ...hygieneInput,
      ownerId: typedCtx.tenant.userId,
      tenantId: typedCtx.tenant.tenantId,
    });

    if (result.isFailure) {
      throwContactCreateError(result.error.message);
    }

    // IFC-310: When autoMergeOnExactEmail triggered, apply the merge post-create.
    if (dupeCheck.action === 'auto-merge' && duplicateService) {
      try {
        await duplicateService.applyAutoMerge(
          typedCtx,
          dupeCheck.primaryId,
          result.value.id.value,
          typedCtx.tenant.userId
        );
      } catch (error) {
        console.warn('[contact.router] auto-merge post-commit failed:', error);
      }
    }

    // IFC-312 audit fix F1: wire AI_ENRICHMENT producer. The spec §4.4 required
    // create to enqueue enrichment post-write; the first ship missed it,
    // leaving aiEnrichment as a Cat-1 dead toggle. Fire-and-forget matches
    // the `scoreWithAI` precedent.
    if (flags.aiEnrichment) {
      try {
        const { Queue } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const queue = new Queue(QUEUE_NAMES.AI_ENRICHMENT, {
          connection: {
            host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        });
        const otelCarrier: Record<string, string> = {};
        propagation.inject(otelContext.active(), otelCarrier);
        await queue.add('enrich', {
          entityType: 'contact',
          entityId: result.value.id.value,
          tenantId: typedCtx.tenant.tenantId,
          _otelCarrier: otelCarrier,
        });
        await queue.close();
      } catch {
        // Redis/BullMQ unavailable — silently skip background enrichment
      }
    }

    return mapContactToResponse(result.value);
  }),

  /**
   * Get a single contact by ID using ContactService
   * Note: For complex includes (relations), we still use Prisma directly
   * as the service returns domain entities without ORM relations
   */
  // IFC-252: direct tenant-scoped query replaces unscoped service pre-flight
  getById: tenantProcedure.input(z.object({ id: idSchema })).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    // Contact 360 view — tenant-scoped findFirst (compound WHERE is not a unique constraint)
    const contactWithRelations = await typedCtx.prismaWithTenant.contact.findFirst({
      where: createTenantWhereClause(typedCtx.tenant, { id: input.id }),
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            industry: true,
            website: true,
          },
        },
        lead: {
          select: {
            id: true,
            email: true,
            status: true,
            score: true,
          },
        },
        // Contact 360: Activities timeline
        activities: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
        // Contact 360: Notes
        notes: {
          orderBy: { createdAt: 'desc' },
        },
        // Contact 360: AI Insights
        aiInsight: true,
        // Contact 360: Deals/Opportunities
        opportunities: {
          orderBy: { createdAt: 'desc' },
          include: {
            account: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        // Contact 360: Tasks
        tasks: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { dueDate: 'asc' },
          take: 10,
        },
        // Contact 360: Calendar Events (upcoming meetings)
        calendarEvents: {
          where: {
            startTime: { gte: new Date() },
          },
          orderBy: { startTime: 'asc' },
          take: 5,
        },
      },
    });

    if (!contactWithRelations) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact with ID ${input.id} not found`,
      });
    }

    // IFC-256: Contact 360 — tickets (via TicketService) + documents. Tickets are
    // scoped by `{ tenantId, contactId }` (Ticket has no `ownerId`, so
    // `createTenantWhereClause` is not used). Documents live in `CaseDocument`
    // keyed by `relatedContactId` (the upload/create flows persist there — the
    // legacy `Document` table is unused), latest version only, not soft-deleted.
    // The contact above is already access-checked, so contact-level authorization
    // gates these reads. A missing ticket service degrades to an empty list.
    const tenantId = typedCtx.tenant.tenantId;
    // Tickets/documents are projected with a limit for the tab lists; the *Count
    // fields carry the true totals so the tab badges never undercount when a
    // contact has more than the projected number of rows.
    const documentWhere = {
      tenantId,
      relatedContactId: input.id,
      deletedAt: null,
      isLatestVersion: true,
    } as const;
    const [contactTickets, caseDocuments, ticketCount, documentCount] = await Promise.all([
      ctx.services?.ticket
        ? ctx.services.ticket.listByContact({ tenantId, contactId: input.id, limit: 20 })
        : Promise.resolve([]),
      typedCtx.prismaWithTenant.caseDocument.findMany({
        where: documentWhere,
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          mimeType: true,
          sizeBytes: true,
          documentType: true,
          createdAt: true,
        },
      }),
      ctx.services?.ticket
        ? ctx.services.ticket.countByContact({ tenantId, contactId: input.id })
        : Promise.resolve(0),
      typedCtx.prismaWithTenant.caseDocument.count({ where: documentWhere }),
    ]);
    // Map CaseDocument rows to the Contact 360 document view shape (BigInt size →
    // number; the route links each row to /documents/[id] for the signed download).
    const contactDocuments = caseDocuments.map((doc) => ({
      id: doc.id,
      name: doc.title,
      fileType: doc.mimeType,
      fileSize: Number(doc.sizeBytes),
      category: doc.documentType,
      createdAt: doc.createdAt,
    }));
    // The reads always resolve (the service degrades to []/0 and findMany/count
    // never return null), so no nullish fallback is needed here.
    const relatedTabs = {
      tickets: contactTickets,
      documents: contactDocuments,
      ticketCount,
      documentCount,
    };

    // Derive AI insights when none exist in DB (ensures entity pages always show data)
    if (!contactWithRelations.aiInsight) {
      const derived = deriveContactInsights({
        lastContactedAt: contactWithRelations.lastContactedAt,
        createdAt: contactWithRelations.createdAt,
        title: contactWithRelations.title,
        department: contactWithRelations.department,
        status: contactWithRelations.status,
        leadScore: contactWithRelations.lead?.score,
        opportunities: contactWithRelations.opportunities?.map((o: any) => ({
          value: Number(o.value) || 0,
          stage: o.stage,
        })),
      });

      const syntheticInsight = {
        id: `derived-${contactWithRelations.id}`,
        contactId: contactWithRelations.id,
        tenantId: typedCtx.tenant.tenantId,
        ...derived,
        recommendations: derived.recommendations as unknown,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Fire-and-forget: persist so future visits read from DB
      ctx.prismaWithTenant.contactAIInsight
        ?.upsert({
          where: { contactId: contactWithRelations.id },
          create: {
            contactId: contactWithRelations.id,
            tenantId: typedCtx.tenant.tenantId,
            ...derived,
            recommendations: derived.recommendations,
          },
          update: {},
        })
        ?.catch(() => {}); // Best-effort persistence — silently ignore

      return { ...contactWithRelations, aiInsight: syntheticInsight, ...relatedTabs };
    }

    return { ...contactWithRelations, ...relatedTabs };
  }),

  /**
   * Get a contact by email using ContactService
   */
  // IFC-252: direct tenant-scoped query replaces unscoped service pre-flight
  getByEmail: tenantProcedure
    .input(z.object({ email: z.email() }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Tenant-scoped findFirst with ownerId filter
      const contactWithRelations = await typedCtx.prismaWithTenant.contact.findFirst({
        where: createTenantWhereClause(typedCtx.tenant, { email: input.email }),
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          account: true,
        },
      });

      if (!contactWithRelations) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact with email ${input.email} not found`,
        });
      }

      return contactWithRelations;
    }),

  /**
   * List contacts with filtering and pagination
   * Uses direct Prisma for complex query building with relations
   * SECURITY: Uses tenantProcedure and createTenantWhereClause for isolation
   */
  list: tenantProcedure.input(contactQuerySchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const {
      page = 1,
      limit = 20,
      search,
      accountId,
      ownerId,
      department,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = input;

    const skip = (page - 1) * limit;

    // Apply tenant filtering
    const where = createTenantWhereClause(
      typedCtx.tenant,
      buildContactListWhere({ search, accountId, ownerId, department, status })
    );

    // Execute queries in parallel using tenant-scoped Prisma
    const [contacts, total] = await Promise.all([
      typedCtx.prismaWithTenant.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          account: {
            select: {
              id: true,
              name: true,
              industry: true,
            },
          },
          _count: {
            select: {
              opportunities: true,
              tasks: true,
            },
          },
        },
      }),
      typedCtx.prismaWithTenant.contact.count({ where }),
    ]);

    return {
      contacts,
      total,
      page,
      limit,
      hasMore: skip + contacts.length < total,
    };
  }),

  /**
   * Update a contact using ContactService
   */
  update: tenantProcedure
    .input(updateContactSchema)
    .mutation(({ ctx, input }) => handleContactUpdate(ctx, input)),

  /**
   * IFC-310 EC-004: Dedicated email-change mutation with duplicate detection.
   *
   * Email changes are isolated from `update` so the duplicate-detection
   * runtime can branch at exactly one call-site. When
   * `flags.autoMergeOnExactEmail=true` and the new email collides with an
   * existing contact, the two are merged automatically; when only
   * `notifyOnDuplicate=true`, a notification is emitted and the email update
   * proceeds. When no flag is set, the email is updated silently.
   */
  updateEmail: tenantProcedure.input(updateContactEmailSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);
    const flags = await loadContactAutomation(typedCtx);

    const duplicateService = ctx.services?.contactDuplicateDetection;
    let emailDupeResult:
      | { action: 'proceed'; matches: unknown[] }
      | { action: 'flag'; matches: unknown[] }
      | { action: 'auto-merge'; matches: unknown[]; primaryId: string }
      | undefined;

    if (duplicateService) {
      try {
        emailDupeResult = (await duplicateService.checkForUpdate(
          typedCtx,
          input.id,
          { email: input.email },
          flags
        )) as typeof emailDupeResult;
      } catch (error) {
        console.warn('[contact.router] email duplicate-detection failed, proceeding:', error);
      }
    }

    // Auto-merge: when an existing contact already has this email and the
    // tenant opted in, fold the current contact into the primary instead of
    // writing a duplicate email (which would fail the Contact.email unique
    // constraint anyway).
    if (emailDupeResult?.action === 'auto-merge' && duplicateService) {
      try {
        await duplicateService.applyAutoMerge(
          typedCtx,
          emailDupeResult.primaryId,
          input.id,
          typedCtx.tenant.userId
        );
        // After auto-merge the current contact is gone; return the surviving
        // primary to the caller.
        const primaryResult = await contactService.getContactById(emailDupeResult.primaryId);
        if (primaryResult.isFailure) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: primaryResult.error.message,
          });
        }
        return mapContactToResponse(primaryResult.value);
      } catch (error) {
        console.warn('[contact.router] auto-merge on email change failed:', error);
      }
    }

    const result = await contactService.updateContactEmail(
      input.id,
      input.email,
      typedCtx.tenant.userId
    );
    if (result.isFailure) {
      throw new TRPCError({
        code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
        message: result.error.message,
      });
    }
    return mapContactToResponse(result.value);
  }),

  /**
   * Delete a contact using ContactService
   */
  delete: tenantProcedure.input(z.object({ id: idSchema })).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    const existingContact = await typedCtx.prismaWithTenant.contact.findUnique({
      where: { id: input.id },
      include: {
        _count: {
          select: {
            // PG-182: only count ACTIVE deals (not CLOSED_WON/CLOSED_LOST)
            // so finished pipelines do not block tidy-up deletes.
            opportunities: {
              where: {
                stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!existingContact) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact with ID ${input.id} not found`,
      });
    }

    // PG-182: gate deletion on the preventDeleteWithOpenDeals toggle
    const flags = await loadContactAutomation(typedCtx);
    assertCanDeleteContact({ activeOpportunities: existingContact._count.opportunities }, flags);

    // Delete via service
    const result = await contactService.deleteContact(input.id);
    if (result.isFailure) {
      throw new TRPCError({
        code: result.error.message.includes('not found') ? 'NOT_FOUND' : 'BAD_REQUEST',
        message: result.error.message,
      });
    }

    return { success: true, id: input.id };
  }),

  /**
   * Link a contact to an account using ContactService
   */
  linkToAccount: tenantProcedure
    .input(
      z.object({
        contactId: idSchema,
        accountId: idSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const contactService = getContactService(ctx);

      const result = await contactService.associateWithAccount(
        input.contactId,
        input.accountId,
        typedCtx.tenant.userId,
        typedCtx.tenant.tenantId
      );

      if (result.isFailure) {
        throwContactAssociationError(result.error.message);
      }

      return mapContactToResponse(result.value);
    }),

  /**
   * Unlink a contact from an account using ContactService
   */
  unlinkFromAccount: tenantProcedure
    .input(z.object({ contactId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const contactService = getContactService(ctx);

      const result = await contactService.disassociateFromAccount(
        input.contactId,
        typedCtx.tenant.userId
      );

      if (result.isFailure) {
        const errorMessage = result.error.message;
        if (errorMessage.includes('not found')) {
          throw new TRPCError({ code: 'NOT_FOUND', message: errorMessage });
        }
        if (errorMessage.includes('not associated')) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Contact is not linked to any account',
          });
        }
        throw new TRPCError({ code: 'BAD_REQUEST', message: errorMessage });
      }

      return mapContactToResponse(result.value);
    }),

  /**
   * Get contact statistics using ContactService
   */
  // IFC-252: bypasses ContactService for tenant-scoped DB-level aggregation
  stats: tenantProcedure.query(async ({ ctx }) => {
    const typedCtx = getTenantContext(ctx);
    const where = {
      ...createTenantWhereClause(typedCtx.tenant, {}),
      tenantId: typedCtx.tenant.tenantId,
    };

    const [total, withAccounts, byDepartmentRaw] = await Promise.all([
      typedCtx.prismaWithTenant.contact.count({ where }),
      typedCtx.prismaWithTenant.contact.count({ where: { ...where, accountId: { not: null } } }),
      typedCtx.prismaWithTenant.contact.groupBy({ by: ['department'], where, _count: true }),
    ]);

    return {
      total,
      byDepartment: Object.fromEntries(
        byDepartmentRaw.filter((g) => g.department).map((g) => [g.department!, g._count])
      ),
      withAccounts,
      withoutAccounts: total - withAccounts,
    };
  }),

  /**
   * Optimized search endpoint (IFC-089)
   * Uses direct Prisma for performance optimization
   *
   * KPI Target: <200ms response time
   *
   * Performance optimizations:
   * - Uses database indexes on email, firstName, lastName
   * - Minimal select fields to reduce payload
   * - Parallel query execution
   * - Limited result set (max 50)
   * - Optional account include to minimize joins
   */
  search: tenantProcedure.input(contactSearchSchema).query(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const startTime = Date.now();
    const { query, limit, includeAccount } = input;

    // IFC-252: tenant isolation — ownerId scoping (defense-in-depth with RLS via IFC-237)
    const where = createTenantWhereClause(typedCtx.tenant, {
      OR: [
        { email: { contains: query, mode: 'insensitive' as const } },
        { firstName: { contains: query, mode: 'insensitive' as const } },
        { lastName: { contains: query, mode: 'insensitive' as const } },
      ],
    });

    // Execute search with minimal data fetch
    const contacts = await typedCtx.prismaWithTenant.contact.findMany({
      where,
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        title: true,
        phone: true,
        department: true,
        status: true,
        accountId: true,
        ...(includeAccount && {
          account: {
            select: {
              id: true,
              name: true,
            },
          },
        }),
      },
    });

    const durationMs = Date.now() - startTime;

    // Log performance warning if exceeds target
    if (durationMs > 200) {
      console.warn(
        `[contact.search] SLOW QUERY: ${durationMs}ms (target: <200ms) for query: "${query}"`
      );
    }

    return {
      contacts,
      count: contacts.length,
      durationMs,
      performanceTarget: 200,
      meetsKpi: durationMs < 200,
    };
  }),

  /**
   * Get filter options with counts
   *
   * Returns available filter values with count of matching records.
   * Used for dynamic filters that hide options with 0 matches.
   */
  filterOptions: tenantProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          status: z.array(z.string()).optional(),
          accountId: z.string().optional(),
          department: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      // Build base where clause with current filters
      const baseWhere: Record<string, unknown> = {};

      if (input?.search) {
        baseWhere.OR = [
          { email: { contains: input.search, mode: 'insensitive' } },
          { firstName: { contains: input.search, mode: 'insensitive' } },
          { lastName: { contains: input.search, mode: 'insensitive' } },
        ];
      }

      if (input?.accountId) {
        baseWhere.accountId = input.accountId;
      }

      if (input?.department) {
        baseWhere.department = { contains: input.department, mode: 'insensitive' };
      }

      // IFC-254 R-12: Apply status filter
      if (input?.status && input.status.length > 0) {
        baseWhere.status = { in: input.status };
      }

      const where = createTenantWhereClause(typedCtx.tenant, baseWhere);

      // Get counts for each filter option
      const [departmentCounts, accountCounts, statusCounts] = await Promise.all([
        typedCtx.prismaWithTenant.contact.groupBy({
          by: ['department'],
          where,
          _count: true,
        }),
        typedCtx.prismaWithTenant.contact.groupBy({
          by: ['accountId'],
          where,
          _count: true,
        }),
        typedCtx.prismaWithTenant.contact.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
      ]);

      // Get account names for display
      const accountIds = (accountCounts ?? []).map((a) => a.accountId).filter(Boolean) as string[];
      const accounts =
        accountIds.length > 0
          ? await typedCtx.prismaWithTenant.account.findMany({
              where: { id: { in: accountIds } },
              select: { id: true, name: true },
            })
          : [];
      const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

      return {
        departments: (departmentCounts ?? [])
          .filter((d) => d.department)
          .map((d) => ({
            value: d.department as string,
            label: d.department as string,
            count: d._count,
          })),
        accounts: (accountCounts ?? [])
          .filter((a) => a.accountId)
          .map((a) => ({
            value: a.accountId as string,
            label: accountMap.get(a.accountId as string) ?? a.accountId ?? 'Unknown',
            count: a._count,
          })),
        statuses: (statusCounts ?? []).map((s) => ({
          value: s.status,
          label: s.status,
          count: s._count,
        })),
      };
    }),

  /**
   * Bulk email contacts - returns email addresses for mailto:
   */
  // IFC-252: tenant isolation — ownerId + tenantId scoping
  bulkEmail: tenantProcedure.input(bulkEmailContactsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { ids } = input;

    const contacts = await typedCtx.prismaWithTenant.contact.findMany({
      where: {
        ...createTenantWhereClause(typedCtx.tenant, { id: { in: ids } }),
        tenantId: typedCtx.tenant.tenantId,
      },
      select: { id: true, email: true },
    });

    const emails = contacts.map((c) => c.email);
    const mailtoUrl = `mailto:${emails.join(',')}`;

    return {
      successful: contacts.map((c) => c.id),
      failed: ids
        .filter((id: string) => !contacts.some((c) => c.id === id))
        .map((id: string) => ({
          id,
          error: 'Contact not found',
        })),
      totalProcessed: ids.length,
      emails,
      mailtoUrl,
    };
  }),

  /**
   * Bulk export contacts as CSV/JSON
   */
  // IFC-252: tenant isolation — ownerId + tenantId scoping
  bulkExport: tenantProcedure.input(bulkExportContactsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { ids, format } = input;

    const contacts = await typedCtx.prismaWithTenant.contact.findMany({
      where: {
        ...createTenantWhereClause(typedCtx.tenant, { id: { in: ids } }),
        tenantId: typedCtx.tenant.tenantId,
      },
      include: {
        account: { select: { name: true } },
      },
    });

    let data: string;
    if (format === 'csv') {
      const headers = 'Email,First Name,Last Name,Title,Phone,Department,Account\n';
      const rows = contacts
        .map(
          (c) =>
            `"${c.email}","${c.firstName}","${c.lastName}","${c.title || ''}","${c.phone || ''}","${c.department || ''}","${c.account?.name || ''}"`
        )
        .join('\n');
      data = headers + rows;
    } else {
      data = JSON.stringify(contacts, null, 2);
    }

    return {
      successful: contacts.map((c) => c.id),
      failed: ids
        .filter((id: string) => !contacts.some((c) => c.id === id))
        .map((id: string) => ({
          id,
          error: 'Contact not found',
        })),
      totalProcessed: ids.length,
      data,
      count: contacts.length,
    };
  }),

  /**
   * Bulk delete contacts
   */
  bulkDelete: tenantProcedure.input(bulkDeleteContactsSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);
    const { ids } = input;

    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    // NP-012 fix: ONE batched fetch of all requested contacts (with opportunity
    // counts) instead of a findUnique per id. Tenant scoping is preserved via
    // prismaWithTenant (RLS). The per-id deleteContact stays — it runs through
    // the domain service (validation/events), not raw read amplification.
    const foundContacts = await typedCtx.prismaWithTenant.contact.findMany({
      where: { id: { in: ids } },
      include: { _count: { select: { opportunities: true } } },
    });
    const contactsById = new Map(foundContacts.map((c) => [c.id, c]));

    for (const contactId of ids) {
      try {
        const contact = contactsById.get(contactId);

        if (!contact) {
          failed.push({ id: contactId, error: 'Contact not found' });
          continue;
        }

        if (contact._count.opportunities > 0) {
          failed.push({
            id: contactId,
            error: `Contact has ${contact._count.opportunities} opportunities`,
          });
          continue;
        }

        const result = await contactService.deleteContact(contactId);
        if (result.isSuccess) {
          successful.push(contactId);
        } else {
          failed.push({ id: contactId, error: result.error.message });
        }
      } catch (error) {
        failed.push({
          id: contactId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { successful, failed, totalProcessed: ids.length };
  }),

  /**
   * Link a contact to a lead (IFC-184)
   * This is for retroactive association, distinct from lead conversion.
   */
  linkToLead: tenantProcedure.input(linkToLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    const result = await contactService.linkToLead(
      input.contactId,
      input.leadId,
      typedCtx.tenant.userId
    );

    if (result.isFailure) {
      throwContactLinkLeadError(result.error.message);
    }

    return mapContactToResponse(result.value);
  }),

  /**
   * Unlink a contact from a lead (IFC-184)
   */
  unlinkFromLead: tenantProcedure.input(unlinkFromLeadSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const contactService = getContactService(ctx);

    const result = await contactService.unlinkFromLead(input.contactId, typedCtx.tenant.userId);

    if (result.isFailure) {
      const errorMessage = result.error.message;
      if (errorMessage.includes('not found')) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: errorMessage,
        });
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: errorMessage,
      });
    }

    return mapContactToResponse(result.value);
  }),

  /**
   * Get timeline events for a contact (IFC-184)
   * Aggregates activities, notes, tasks, and appointments with cursor-based pagination.
   *
   * KPI Target: <1000ms response time
   */
  getTimeline: tenantProcedure
    .input(contactTimelineSchema)
    .output(contactTimelineResponseSchema.extend({ performanceTarget: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const startTime = Date.now();

      // 1. Verify contact exists and belongs to tenant
      const contact = await typedCtx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
        select: { id: true, leadId: true, tenantId: true },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Contact not found',
        });
      }

      // 2. Build date filter
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (input.fromDate) dateFilter.gte = input.fromDate;
      if (input.toDate) dateFilter.lte = input.toDate;

      // 3. Decode cursor if provided
      const parsedCursor = input.cursor ? parseTimelineCursor(input.cursor) : null;
      const cursorTimestamp = parsedCursor?.timestamp;
      const cursorId = parsedCursor?.id;

      // 4. Parallel queries to data sources with cursor-based pagination
      const fetchLimit = input.limit + 1; // Fetch one extra to check for more

      const [tasks, notes] = await Promise.all([
        // Tasks
        typedCtx.prismaWithTenant.task.findMany({
          where: {
            contactId: input.contactId,
            ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
            ...(cursorTimestamp &&
              buildTaskCursorFilter(cursorTimestamp, cursorId, input.sortOrder)),
          },
          orderBy: { createdAt: input.sortOrder },
          take: fetchLimit,
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            dueDate: true,
            createdAt: true,
            owner: { select: { id: true, name: true } },
          },
        }),
        // Notes (using ContactNote model via raw query with tenant isolation)
        fetchContactNotes(
          typedCtx.prismaWithTenant,
          input.contactId,
          typedCtx.tenant.tenantId,
          dateFilter,
          fetchLimit
        ),
      ]);

      // 5. Map to timeline events
      type TimelineEvent = {
        id: string;
        type:
          | 'email'
          | 'task'
          | 'appointment'
          | 'activity'
          | 'note'
          | 'call'
          | 'status_change'
          | 'meeting';
        title: string;
        description?: string;
        timestamp: Date;
        actor?: { id: string; name: string };
        metadata?: Record<string, unknown>;
      };

      const events: TimelineEvent[] = [];

      // Map tasks
      for (const task of tasks) {
        events.push({
          id: `task-${task.id}`,
          type: 'task',
          title: task.title,
          description: task.description ?? undefined,
          timestamp: task.createdAt,
          actor: task.owner ? { id: task.owner.id, name: task.owner.name ?? 'Unknown' } : undefined,
          metadata: { status: task.status, priority: task.priority, dueDate: task.dueDate },
        });
      }

      // Map notes (if returned)
      for (const note of notes) {
        events.push({
          id: `note-${note.id}`,
          type: 'note',
          title: 'Note added',
          description: note.content,
          timestamp: note.createdAt,
        });
      }

      // 6. Sort all events by timestamp
      events.sort((a, b) => {
        const diff =
          input.sortOrder === 'desc'
            ? b.timestamp.getTime() - a.timestamp.getTime()
            : a.timestamp.getTime() - b.timestamp.getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });

      // 7. Apply limit and determine if there are more results
      const hasMore = events.length > input.limit;
      const paginatedEvents = events.slice(0, input.limit);

      // 8. Generate next cursor
      let nextCursor: string | null = null;
      if (hasMore && paginatedEvents.length > 0) {
        const lastEvent = paginatedEvents.at(-1)!;
        const cursorString = `${lastEvent.timestamp.toISOString()}:${lastEvent.id}`;
        nextCursor = Buffer.from(cursorString).toString('base64');
      }

      const durationMs = Date.now() - startTime;

      // Log performance warning if exceeds target
      if (durationMs > 1000) {
        console.warn(
          `[contact.getTimeline] SLOW QUERY: ${durationMs}ms (target: <1000ms) for contact: "${input.contactId}"`
        );
      }

      return {
        events: paginatedEvents,
        nextCursor,
        totalCount: events.length,
        durationMs,
        performanceTarget: 1000,
        meetsKpi: durationMs < 1000,
      };
    }),

  // IFC-192: Log activity on a contact (updates lastContactedAt for qualifying types)
  // IFC-252: tenant isolation — getTenantContext + prismaWithTenant.$transaction
  logActivity: tenantProcedure.input(logActivitySchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);
    const { tenantId, userId } = typedCtx.tenant;

    // Verify contact exists and belongs to tenant
    const contact = await typedCtx.prismaWithTenant.contact.findUnique({
      where: { id: input.contactId },
    });

    if (!contact) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact not found: ${input.contactId}`,
      });
    }

    // Transaction: create activity record + update lastContactedAt atomically
    const now = new Date();
    const updatedContact = await typedCtx.prismaWithTenant.$transaction(async (tx) => {
      // 1. Create ContactActivity record
      await tx.contactActivity.create({
        data: {
          contactId: input.contactId,
          type: input.type,
          title: input.title,
          description: input.description ?? '',
          timestamp: now,
          userId,
          userName: typedCtx.user?.email ?? 'Unknown',
          tenantId,
        },
      });

      // 2. Update lastContactedAt directly via tx (atomic with activity insert)
      // IFC-252: tenant-scoped WHERE with ownerId
      const updated = await tx.contact.update({
        where: { id: input.contactId, ...createTenantWhereClause(typedCtx.tenant, {}) },
        data: {
          lastContactedAt: now,
          updatedAt: now,
        },
      });

      return updated;
    });

    // 3. Post-transaction: run domain logic for event emission (non-critical)
    const contactService = getContactService(ctx);
    await contactService.recordInteraction(input.contactId, input.type, userId);

    // Return the tx-committed Prisma record (authoritative)
    return {
      id: updatedContact.id,
      email: updatedContact.email,
      firstName: updatedContact.firstName,
      lastName: updatedContact.lastName,
      title: updatedContact.title ?? null,
      phone: updatedContact.phone ?? null,
      department: updatedContact.department ?? null,
      status: updatedContact.status,
      accountId: updatedContact.accountId ?? null,
      leadId: updatedContact.leadId ?? null,
      ownerId: updatedContact.ownerId,
      tenantId: updatedContact.tenantId,
      streetAddress: updatedContact.streetAddress ?? null,
      city: updatedContact.city ?? null,
      zipCode: updatedContact.zipCode ?? null,
      company: updatedContact.company ?? null,
      linkedInUrl: updatedContact.linkedInUrl ?? null,
      contactType: updatedContact.contactType ?? null,
      tags: updatedContact.tags ?? [],
      contactNotes: updatedContact.contactNotes ?? null,
      lastContactedAt: updatedContact.lastContactedAt ?? null,
      createdAt: updatedContact.createdAt,
      updatedAt: updatedContact.updatedAt,
    };
  }),

  /**
   * Add a note to a contact (mirrors lead.addNote pattern).
   */
  addNote: tenantProcedure.input(addContactNoteSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    const contact = await typedCtx.prismaWithTenant.contact.findUnique({
      where: { id: input.contactId },
    });

    if (!contact) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `Contact not found: ${input.contactId}`,
      });
    }

    const note = await ctx.prismaWithTenant.contactNote.create({
      data: {
        content: input.content,
        author: ctx.user?.email ?? 'Unknown',
        contactId: input.contactId,
        tenantId: typedCtx.tenant.tenantId,
      },
    });

    return note;
  }),

  /**
   * Score a contact with AI — derives insights and persists them.
   * Fire-and-forget: enqueues background LLM enrichment if Redis available.
   * IFC-220
   */
  scoreWithAI: tenantProcedure
    .input(z.object({ contactId: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);

      const contact = await typedCtx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
        select: {
          id: true,
          lastContactedAt: true,
          createdAt: true,
          title: true,
          department: true,
          status: true,
          lead: { select: { score: true } },
          opportunities: { select: { value: true, stage: true } },
        },
      });

      if (!contact) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Contact not found: ${input.contactId}`,
        });
      }

      const derived = deriveContactInsights({
        lastContactedAt: contact.lastContactedAt,
        createdAt: contact.createdAt,
        title: contact.title,
        department: contact.department,
        status: contact.status,
        leadScore: contact.lead?.score,
        opportunities: contact.opportunities?.map((o: any) => ({
          value: Number(o.value) || 0,
          stage: o.stage,
        })),
      });

      const insight = await ctx.prismaWithTenant.contactAIInsight.upsert({
        where: { contactId: input.contactId },
        create: {
          contactId: input.contactId,
          tenantId: typedCtx.tenant.tenantId,
          ...derived,
          recommendations: derived.recommendations,
        },
        update: {
          ...derived,
          recommendations: derived.recommendations,
        },
      });

      // Fire-and-forget: enqueue background LLM enrichment (best-effort)
      try {
        const { Queue } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const queue = new Queue(QUEUE_NAMES.AI_PREDICTION, {
          connection: {
            host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        });
        const _otelCarrierContact: Record<string, string> = {};
        propagation.inject(otelContext.active(), _otelCarrierContact);
        await queue.add('predict', {
          entityType: 'contact',
          entityId: input.contactId,
          predictionType: 'CHURN_RISK',
          tenantId: typedCtx.tenant.tenantId,
          _otelCarrier: _otelCarrierContact,
        });
        await queue.close();
      } catch {
        // Redis/BullMQ unavailable — silently skip background enrichment
      }

      return insight;
    }),

  /**
   * IFC-311: Reassign a single contact's owner with notification wiring.
   * Honours the tenant `notifyOnOwnerChange` flag and emits
   * `contact_reassigned` notifications to both old and new owner when on.
   * Idempotent: returns success without write or notification when the new
   * owner equals the current owner.
   */
  reassign: tenantProcedure.input(reassignContactSchema).mutation(async ({ ctx, input }) => {
    const typedCtx = getTenantContext(ctx);

    const flags = await loadContactAutomation(typedCtx);
    const verdict = await performContactReassign(ctx, input);

    if (verdict.kind === 'NOT_FOUND' || verdict.kind === 'TARGET_USER_NOT_FOUND') {
      logContactReassignPermissionDenied(ctx, input.id, 'contact:reassign');
      throw new TRPCError({
        code: 'NOT_FOUND',
        message:
          verdict.kind === 'TARGET_USER_NOT_FOUND' ? 'Target user not found' : 'Contact not found',
      });
    }

    if (verdict.kind === 'FORBIDDEN') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Caller does not have permission to reassign this contact.',
      });
    }

    if (verdict.kind === 'SKIPPED') {
      return {
        id: input.id,
        previousOwnerId: verdict.currentOwnerId,
        newOwnerId: verdict.currentOwnerId,
        notified: false,
        skipped: true as const,
      };
    }

    const sideEffects = await emitContactReassignSideEffects(ctx, {
      id: input.id,
      contactName: verdict.contactName,
      previousOwnerId: verdict.previousOwnerId,
      newOwnerId: verdict.newOwnerId,
      flags,
    });

    return {
      id: input.id,
      previousOwnerId: verdict.previousOwnerId,
      newOwnerId: verdict.newOwnerId,
      notified: sideEffects.notified,
    };
  }),

  /**
   * IFC-311: Reassign multiple contacts to a single new owner.
   * Pre-validates the target user once (fail-fast), then iterates per row.
   * Per-row failures (NOT_FOUND, FORBIDDEN) are collected without
   * short-circuiting the batch. Notification + audit log run per-row, post-tx.
   */
  bulkReassign: tenantProcedure
    .input(bulkReassignContactsSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const tenantId = typedCtx.tenant.tenantId;

      // Pre-validate target user once (one query, not N). Finding 3 — lookup
      // miss is NOT_FOUND, not authz denial. Dropped misleading audit call.
      const targetUser = await typedCtx.prismaWithTenant.user.findFirst({
        where: { id: input.ownerId, tenantId },
        select: { id: true },
      });
      if (!targetUser) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target user not found' });
      }

      const flags = await loadContactAutomation(typedCtx);

      const successful: Array<{
        id: string;
        previousOwnerId: string;
        newOwnerId: string;
        notified: boolean;
        skipped?: true;
      }> = [];
      const failed: Array<{ id: string; error: string; errorCode: 'NOT_FOUND' | 'FORBIDDEN' }> = [];

      for (const id of input.ids) {
        const verdict = await performContactReassign(ctx, { id, ownerId: input.ownerId });

        if (verdict.kind === 'NOT_FOUND' || verdict.kind === 'TARGET_USER_NOT_FOUND') {
          failed.push({ id, error: 'Contact not found', errorCode: 'NOT_FOUND' });
          continue;
        }
        if (verdict.kind === 'FORBIDDEN') {
          failed.push({
            id,
            error: 'Caller does not have permission to reassign this contact.',
            errorCode: 'FORBIDDEN',
          });
          continue;
        }
        if (verdict.kind === 'SKIPPED') {
          successful.push({
            id,
            previousOwnerId: verdict.currentOwnerId,
            newOwnerId: verdict.currentOwnerId,
            notified: false,
            skipped: true,
          });
          continue;
        }

        const sideEffects = await emitContactReassignSideEffects(ctx, {
          id,
          contactName: verdict.contactName,
          previousOwnerId: verdict.previousOwnerId,
          newOwnerId: verdict.newOwnerId,
          flags,
        });
        successful.push({
          id,
          previousOwnerId: verdict.previousOwnerId,
          newOwnerId: verdict.newOwnerId,
          notified: sideEffects.notified,
        });
      }

      return { successful, failed, totalProcessed: input.ids.length };
    }),

  // ═════════════════════════════════════════════════════════════════════════
  // IFC-312 — AI chain procedures (contacts)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * IFC-312: Synchronous tag suggestions.
   * Uses BullMQ `waitUntilFinished(5000)` to preserve API→ai-worker boundary
   * while delivering sync UX. Returns `[]` on toggle-off, timeout, or error.
   */
  suggestTags: tenantProcedure
    .input(contactSuggestTagsInputSchema)
    .output(contactSuggestTagsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const flags = await loadContactAutomation(typedCtx);
      if (!flags.aiTagSuggestions) return [];

      const contact = await ctx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
      });
      if (!contact) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });
      }

      const syncStart = Date.now(); // IFC-312 audit fix F6: sync-breach visibility
      try {
        const { Queue, QueueEvents } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const connection = {
          host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        };
        const queue = new Queue(QUEUE_NAMES.AI_TAG_SUGGESTION, { connection });
        const events = new QueueEvents(QUEUE_NAMES.AI_TAG_SUGGESTION, { connection });
        try {
          const otelCarrier: Record<string, string> = {};
          propagation.inject(otelContext.active(), otelCarrier);
          const job = await queue.add('suggest', {
            entityType: 'contact',
            entityId: input.contactId,
            tenantId: typedCtx.tenant.tenantId,
            profileSnapshot: {
              firstName: contact.firstName,
              lastName: contact.lastName,
              title: contact.title ?? undefined,
              company: contact.company ?? undefined,
              bio: contact.contactNotes ?? undefined,
            },
            _otelCarrier: otelCarrier,
          });
          const result = (await job.waitUntilFinished(events, 5000)) as {
            suggestions?: Array<{ label: string; confidence: number; reason: string }>;
          };
          return result.suggestions ?? [];
        } finally {
          await events.close().catch(() => {});
          await queue.close().catch(() => {});
        }
      } catch (err) {
        // IFC-312 audit fix F6: surface sync-chain breach so timeouts /
        // Redis-down states are visible in logs instead of silently
        // degrading to an empty list.
        const durationMs = Date.now() - syncStart;
        const reason =
          err instanceof Error && /timed out|timeout/i.test(err.message) ? 'timeout' : 'error';
        console.warn(
          `[contact.router.suggestTags] sync-chain breach (${reason}) ` +
            `contactId=${input.contactId} tenantId=${typedCtx.tenant.tenantId} ` +
            `durationMs=${durationMs}:`,
          err
        );
        return [];
      }
    }),

  /**
   * IFC-312: Enqueue on-demand insight generation.
   * Returns `{enqueued: false}` if toggle off.
   */
  generateInsight: tenantProcedure
    .input(contactGenerateInsightInputSchema)
    .output(contactGenerateInsightOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const flags = await loadContactAutomation(typedCtx);
      if (!flags.aiInsightGeneration) return { enqueued: false };

      try {
        const { Queue } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const queue = new Queue(QUEUE_NAMES.AI_ENTITY_INSIGHT, {
          connection: {
            host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
            port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
          },
        });
        const otelCarrier: Record<string, string> = {};
        propagation.inject(otelContext.active(), otelCarrier);
        await queue.add('insight', {
          entityType: 'contact',
          entityId: input.contactId,
          tenantId: typedCtx.tenant.tenantId,
          _otelCarrier: otelCarrier,
        });
        await queue.close();
        return { enqueued: true };
      } catch {
        return { enqueued: false };
      }
    }),

  /**
   * IFC-312: Enqueue reply-draft generation. Status on the resulting
   * ContactReplyDraft is ALWAYS `DRAFT` — enforced in the job handler
   * (ADR-037 compliance).
   */
  draftReply: tenantProcedure
    .input(contactDraftReplyInputSchema)
    .output(contactDraftReplyOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const typedCtx = getTenantContext(ctx);
      const flags = await loadContactAutomation(typedCtx);
      if (!flags.aiAutoReplyDrafting) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'AI reply drafting is disabled for this tenant',
        });
      }

      const contact = await ctx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
      });
      if (!contact) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });
      }

      // IFC-312 audit fix F5: no more placeholder thread. Caller must supply
      // a real emailThread array or the call is rejected. Real-inbox
      // integration (resolver from emailThreadId → thread history) tracked
      // in IFC-313.
      if (!input.emailThread || input.emailThread.length === 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'No email thread provided. Real-inbox integration pending (tracked in IFC-313). ' +
            'Supply `emailThread` on the request in the meantime.',
        });
      }
      const emailThread = input.emailThread;

      try {
        const { Queue, QueueEvents } = await loadBullMQ();
        const { QUEUE_NAMES } = await import('@intelliflow/platform/queues/types');
        const connection = {
          host: requiredProdEnv('REDIS_HOST', process.env.REDIS_HOST, 'localhost'),
          port: Number.parseInt(process.env.REDIS_PORT || '6379', 10),
        };
        const queue = new Queue(QUEUE_NAMES.AI_REPLY_DRAFT, { connection });
        const events = new QueueEvents(QUEUE_NAMES.AI_REPLY_DRAFT, { connection });
        try {
          const otelCarrier: Record<string, string> = {};
          propagation.inject(otelContext.active(), otelCarrier);
          const job = await queue.add('draft', {
            contactId: input.contactId,
            tenantId: typedCtx.tenant.tenantId,
            emailThread,
            ...(input.emailThreadId ? { emailThreadId: input.emailThreadId } : {}),
            ...(input.userInstructions ? { userInstructions: input.userInstructions } : {}),
            createdBy: typedCtx.tenant.userId ?? undefined,
            _otelCarrier: otelCarrier,
          });
          const result = (await job.waitUntilFinished(events, 10000)) as {
            draftId?: string;
            skipped?: boolean;
          };
          if (!result.draftId) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Draft generation failed',
            });
          }
          return { draftId: result.draftId, requiresReview: true };
        } finally {
          await events.close().catch(() => {});
          await queue.close().catch(() => {});
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        // IFC-312 audit fix F6: log draftReply infra failures (Redis down,
        // timeouts, etc.) before masking them behind the generic 500.
        console.warn(
          `[contact.router.draftReply] sync-chain breach ` +
            `contactId=${input.contactId} tenantId=${typedCtx.tenant.tenantId}:`,
          err
        );
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Draft generation infrastructure unavailable',
        });
      }
    }),

  /**
   * IFC-312 audit fix F3: addTags — merges new tags into Contact.tags array
   * (dedup). Spec §4.3.4 assumed this existed; the first-ship missed it, so
   * SuggestedTagsRow's Accept path was non-functional.
   */
  addTags: tenantProcedure
    .input(contactAddTagsInputSchema)
    .output(contactAddTagsOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await ctx.prismaWithTenant.contact.findUnique({
        where: { id: input.contactId },
        select: { tags: true },
      });
      if (!current) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Contact not found' });
      }
      const merged = Array.from(new Set<string>([...(current.tags ?? []), ...input.tags]));
      await ctx.prismaWithTenant.contact.update({
        where: { id: input.contactId },
        data: { tags: merged },
      });
      return { tags: merged };
    }),

  /**
   * IFC-312: Read query for the ReplyDraftsPanel UI component.
   */
  listReplyDrafts: tenantProcedure
    .input(contactListReplyDraftsInputSchema)
    .output(contactListReplyDraftsOutputSchema)
    .query(async ({ ctx, input }) => {
      const drafts = await ctx.prismaWithTenant.contactReplyDraft.findMany({
        where: { contactId: input.contactId },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });
      return {
        drafts: drafts.map((d: ContactReplyDraft) => ({
          id: d.id,
          contactId: d.contactId,
          draftSubject: d.draftSubject,
          draftBody: d.draftBody,
          tone: d.tone,
          status: d.status as 'DRAFT' | 'DISMISSED' | 'SENT',
          confidence: d.confidence,
          modelVersion: d.modelVersion,
          createdAt: d.createdAt,
        })),
      };
    }),
});
