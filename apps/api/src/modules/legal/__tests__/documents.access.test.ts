/**
 * Per-document access on case documents, inside one tenant (#1107).
 *
 * Real router and real CaseDocument aggregates in the in-memory repository, as in
 * documents.tenant-isolation.test.ts. Every document here belongs to the caller's
 * tenant, so only the document's own access list decides the outcome.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccessLevel, CaseDocument, DocumentClassification } from '@intelliflow/domain';
import type { InMemoryCaseDocumentRepository as Repo } from '@intelliflow/adapters';
import { documentsRouter } from '../documents.router';
import { createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';

const store = vi.hoisted(() => ({ repo: null as unknown as Repo }));

vi.mock('@intelliflow/adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@intelliflow/adapters')>();
  return {
    ...actual,
    PrismaCaseDocumentRepository: function SharedInMemoryRepo() {
      return store.repo;
    },
  };
});

vi.mock('../document-automation', () => ({
  loadDocumentAutomation: vi.fn().mockResolvedValue({}),
  assertNotDeleteGuarded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../container', () => ({ container: {} }));

const CASE_ID = '5ca5e1d0-0000-4000-8000-5ca5e1d00000';
const CALLER = TEST_UUIDS.user1;
const OWNER = TEST_UUIDS.user2;
const caller = () => documentsRouter.createCaller(createTestContext());

function makeDoc(createdBy: string) {
  return CaseDocument.create({
    tenantId: TEST_UUIDS.tenant,
    metadata: {
      title: 'contract',
      documentType: 'CONTRACT',
      classification: DocumentClassification.INTERNAL,
      tags: [],
      relatedCaseId: CASE_ID,
    },
    storageKey: 'docs/contract.pdf',
    contentHash: 'a'.repeat(64),
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdBy,
  });
}

/** Stores a document created by someone else, with the caller at `level` if given. */
async function storedDoc(level?: AccessLevel, expiresAt?: Date) {
  const doc = makeDoc(OWNER);
  if (level) doc.grantAccess(CALLER, 'USER', level, OWNER, expiresAt);
  await store.repo.save(doc);
  return doc;
}

const isDeleted = async (id: string) =>
  (await store.repo.findById(id, TEST_UUIDS.tenant))?.isDeleted;

const YESTERDAY = new Date(Date.now() - 86_400_000);

/** Everyone who must not be able to delete: no entry, or an entry below EDIT. */
const BELOW_EDIT: Array<[string, AccessLevel | undefined, Date | undefined]> = [
  ['no access entry', undefined, undefined],
  ['NONE', AccessLevel.NONE, undefined],
  ['VIEW', AccessLevel.VIEW, undefined],
  ['COMMENT', AccessLevel.COMMENT, undefined],
  ['an expired EDIT', AccessLevel.EDIT, YESTERDAY],
];

beforeEach(async () => {
  const { InMemoryCaseDocumentRepository } =
    await vi.importActual<typeof import('@intelliflow/adapters')>('@intelliflow/adapters');
  store.repo = new InMemoryCaseDocumentRepository();
});

describe('delete needs the same access as edit', () => {
  it.each(BELOW_EDIT)(
    'a caller with %s is FORBIDDEN and nothing changes',
    async (_n, level, exp) => {
      const doc = await storedDoc(level, exp);

      await expect(caller().delete({ documentId: doc.id })).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(await isDeleted(doc.id)).toBe(false);
    }
  );

  it.each([AccessLevel.EDIT, AccessLevel.ADMIN])('a caller with %s can delete', async (level) => {
    const doc = await storedDoc(level);

    await expect(caller().delete({ documentId: doc.id })).resolves.toEqual({ success: true });
    expect(await isDeleted(doc.id)).toBe(true);
  });

  it('the creator can delete without an access entry', async () => {
    const doc = makeDoc(CALLER);
    await store.repo.save(doc);

    await expect(caller().delete({ documentId: doc.id })).resolves.toEqual({ success: true });
    expect(await isDeleted(doc.id)).toBe(true);
  });
});

describe('bulkDelete needs the same access as edit, per document', () => {
  it.each(BELOW_EDIT)(
    'a caller with %s gets a failure and nothing changes',
    async (_n, level, exp) => {
      const doc = await storedDoc(level, exp);

      const result = await caller().bulkDelete({ ids: [doc.id] });

      expect(result.successful).toEqual([]);
      expect(result.failed).toEqual([{ id: doc.id, error: 'Insufficient permissions to delete' }]);
      expect(await isDeleted(doc.id)).toBe(false);
    }
  );

  it('deletes only the documents the caller may edit', async () => {
    const editable = await storedDoc(AccessLevel.EDIT);
    const readOnly = await storedDoc(AccessLevel.VIEW);
    const created = makeDoc(CALLER);
    await store.repo.save(created);

    const result = await caller().bulkDelete({ ids: [editable.id, readOnly.id, created.id] });

    expect(result.successful).toEqual([editable.id, created.id]);
    expect(result.failed.map((f) => f.id)).toEqual([readOnly.id]);
    expect(await isDeleted(editable.id)).toBe(true);
    expect(await isDeleted(readOnly.id)).toBe(false);
    expect(await isDeleted(created.id)).toBe(true);
  });
});

describe('list by case shows what the caller can open', () => {
  it.each([
    ['no access entry', undefined, undefined],
    ['NONE', AccessLevel.NONE, undefined],
    ['an expired VIEW', AccessLevel.VIEW, YESTERDAY],
  ])('a caller with %s does not get the document or count it', async (_n, level, exp) => {
    const doc = await storedDoc(level, exp);

    const result = await caller().list({ caseId: CASE_ID });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    await expect(caller().getById({ id: doc.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it.each([AccessLevel.VIEW, AccessLevel.COMMENT, AccessLevel.EDIT, AccessLevel.ADMIN])(
    'a caller with %s gets the document',
    async (level) => {
      const doc = await storedDoc(level);

      const result = await caller().list({ caseId: CASE_ID });

      expect(result.data.map((d) => d.id)).toEqual([doc.id]);
      expect(result.total).toBe(1);
      await expect(caller().getById({ id: doc.id })).resolves.toMatchObject({ id: doc.id });
    }
  );

  it('the creator gets the document without an access entry', async () => {
    const doc = makeDoc(CALLER);
    await store.repo.save(doc);

    const result = await caller().list({ caseId: CASE_ID });

    expect(result.data.map((d) => d.id)).toEqual([doc.id]);
  });

  it('filters before paging, so hidden documents do not use up a page', async () => {
    await storedDoc();
    await storedDoc();
    const visible = await storedDoc(AccessLevel.VIEW);

    const result = await caller().list({ caseId: CASE_ID, limit: 1, offset: 0 });

    expect(result.data.map((d) => d.id)).toEqual([visible.id]);
    expect(result.total).toBe(1);
  });
});

describe('grantAccess', () => {
  const PRINCIPAL = TEST_UUIDS.admin1;
  const grant = (documentId: string, principalType: 'USER' | 'ROLE' | 'TENANT' = 'USER') =>
    caller().grantAccess({
      documentId,
      principalId: PRINCIPAL,
      principalType,
      accessLevel: 'VIEW',
    });
  const storedAcl = async (id: string) =>
    (await store.repo.findById(id, TEST_UUIDS.tenant))?.acl.map((a) => a.principalId);

  beforeEach(() => {
    prismaMock.user.findFirst.mockReset();
  });

  it('adds a USER principal who is in the tenant, looked up in that tenant', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: PRINCIPAL } as never);
    const doc = await storedDoc(AccessLevel.ADMIN);

    await expect(grant(doc.id)).resolves.toEqual({ success: true });

    expect(await storedAcl(doc.id)).toContain(PRINCIPAL);
    const query = prismaMock.user.findFirst.mock.calls[0]?.[0];
    expect(query?.where?.id).toBe(PRINCIPAL);
    expect(JSON.stringify(query?.where?.OR)).toContain(TEST_UUIDS.tenant);
  });

  it('refuses a USER principal who is not in the tenant, and changes nothing', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const doc = await storedDoc(AccessLevel.ADMIN);

    await expect(grant(doc.id)).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(await storedAcl(doc.id)).not.toContain(PRINCIPAL);
  });

  it.each(['ROLE', 'TENANT'] as const)('does not look up a %s principal', async (type) => {
    const doc = await storedDoc(AccessLevel.ADMIN);

    await expect(grant(doc.id, type)).resolves.toEqual({ success: true });

    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(await storedAcl(doc.id)).toContain(PRINCIPAL);
  });

  it('the creator can grant without an access entry', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: PRINCIPAL } as never);
    const doc = makeDoc(CALLER);
    await store.repo.save(doc);

    await expect(grant(doc.id)).resolves.toEqual({ success: true });
  });

  it.each([...BELOW_EDIT, ['EDIT', AccessLevel.EDIT, undefined] as (typeof BELOW_EDIT)[number]])(
    'a caller with %s is FORBIDDEN, before any user lookup',
    async (_n, level, exp) => {
      const doc = await storedDoc(level, exp);

      await expect(grant(doc.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
      expect(await storedAcl(doc.id)).not.toContain(PRINCIPAL);
    }
  );

  it('a caller with EDIT cannot raise their own access', async () => {
    const doc = await storedDoc(AccessLevel.EDIT);

    await expect(
      caller().grantAccess({
        documentId: doc.id,
        principalId: CALLER,
        principalType: 'USER',
        accessLevel: 'ADMIN',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const stored = await store.repo.findById(doc.id, TEST_UUIDS.tenant);
    expect(stored?.hasAccess(CALLER, AccessLevel.ADMIN)).toBe(false);
  });
});
