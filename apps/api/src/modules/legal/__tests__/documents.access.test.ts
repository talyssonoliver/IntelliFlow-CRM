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
import { createTestContext, TEST_UUIDS } from '../../../test/setup';

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
