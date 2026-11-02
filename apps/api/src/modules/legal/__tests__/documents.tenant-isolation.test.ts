/**
 * Case documents are tenant-scoped (#1075 review).
 *
 * Document ids are UUIDs (CaseDocument.create), so these procedures were reachable
 * before #1075 too. Each one loaded the document by id alone, and the per-document
 * access check is the only thing that held, where there was one: delete and the
 * legal holds had none, and list(caseId) returned every tenant's documents.
 *
 * Real router and real CaseDocument aggregates, stored in the in-memory repository,
 * which filters the way PrismaCaseDocumentRepository does. The other tenant's
 * document even names the caller as its creator, so only the tenant boundary
 * stops these calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CaseDocument, DocumentClassification } from '@intelliflow/domain';
import type { InMemoryCaseDocumentRepository as Repo } from '@intelliflow/adapters';
import { documentsRouter } from '../documents.router';
import { uploadRouter } from '../../documents/upload.router';
import { createAdminContext, TEST_UUIDS } from '../../../test/setup';

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

vi.mock('../../../container', () => ({
  container: {
    signatureProvider: { computeSignatureHash: vi.fn().mockResolvedValue('b'.repeat(64)) },
    adapters: {
      storageService: {
        getSignedUrl: vi.fn().mockResolvedValue('https://files.example.invalid/x'),
      },
    },
  },
}));

const OTHER_TENANT = '7e1d2c3b-0000-4000-8000-7e1d2c3b0000';
const CASE_ID = '5ca5e1d0-0000-4000-8000-5ca5e1d00000';
const caller = () => documentsRouter.createCaller(createAdminContext());

function makeDoc(tenantId: string, title: string) {
  return CaseDocument.create({
    tenantId,
    metadata: {
      title,
      documentType: 'CONTRACT',
      classification: DocumentClassification.INTERNAL,
      tags: [],
      relatedCaseId: CASE_ID,
    },
    storageKey: `docs/${title}.pdf`,
    contentHash: 'a'.repeat(64),
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdBy: TEST_UUIDS.admin1,
  });
}

let own: CaseDocument;
let foreign: CaseDocument;

beforeEach(async () => {
  const { InMemoryCaseDocumentRepository } =
    await vi.importActual<typeof import('@intelliflow/adapters')>('@intelliflow/adapters');
  store.repo = new InMemoryCaseDocumentRepository();
  own = makeDoc(TEST_UUIDS.tenant, 'own-contract');
  foreign = makeDoc(OTHER_TENANT, 'foreign-contract');
  await store.repo.save(own);
  await store.repo.save(foreign);
});

type Call = (c: ReturnType<typeof caller>, documentId: string) => Promise<unknown>;

/** Every procedure that takes one document id. */
const BY_ID: Array<[string, Call]> = [
  ['getById', (c, id) => c.getById({ id })],
  [
    'createVersion',
    (c, id) =>
      c.createVersion({
        documentId: id,
        versionType: 'minor',
        storageKey: 'docs/v2.pdf',
        contentHash: 'c'.repeat(64),
      }),
  ],
  [
    'grantAccess',
    (c, id) =>
      c.grantAccess({
        documentId: id,
        principalId: TEST_UUIDS.user2,
        principalType: 'USER',
        accessLevel: 'VIEW',
      }),
  ],
  ['revokeAccess', (c, id) => c.revokeAccess({ documentId: id, principalId: TEST_UUIDS.user2 })],
  ['submitForReview', (c, id) => c.submitForReview({ documentId: id })],
  ['approve', (c, id) => c.approve({ documentId: id })],
  ['sign', (c, id) => c.sign({ documentId: id })],
  ['archive', (c, id) => c.archive({ documentId: id })],
  [
    'placeLegalHold',
    (c, id) =>
      c.placeLegalHold({ documentId: id, retentionUntil: new Date('2030-01-01T00:00:00Z') }),
  ],
  ['releaseLegalHold', (c, id) => c.releaseLegalHold({ documentId: id })],
  ['delete', (c, id) => c.delete({ documentId: id })],
  ['getSignedUrl', (c, id) => c.getSignedUrl({ documentId: id })],
  ['getAuditTrail', (c, id) => c.getAuditTrail({ documentId: id })],
];

describe('case documents are tenant-scoped', () => {
  it.each(BY_ID)(
    "%s: another tenant's document is NOT_FOUND and is left unchanged",
    async (_name, call) => {
      const before = JSON.stringify(foreign.toJSON());

      await expect(call(caller(), foreign.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

      const stored = await store.repo.findById(foreign.id, OTHER_TENANT);
      expect(JSON.stringify(stored?.toJSON())).toBe(before);
    }
  );

  it.each([
    ['getById', (c: ReturnType<typeof caller>, id: string) => c.getById({ id })],
    ['delete', (c: ReturnType<typeof caller>, id: string) => c.delete({ documentId: id })],
    [
      'placeLegalHold',
      (c: ReturnType<typeof caller>, id: string) =>
        c.placeLegalHold({ documentId: id, retentionUntil: new Date('2030-01-01T00:00:00Z') }),
    ],
  ])('%s: still works on the caller tenant document', async (_name, call) => {
    await expect(call(caller(), own.id)).resolves.toBeDefined();
  });

  it("list by case id returns only the caller tenant's documents", async () => {
    const result = (await caller().list({ caseId: CASE_ID })) as unknown as {
      documents?: Array<{ id: string }>;
      items?: Array<{ id: string }>;
    };
    const ids = JSON.stringify(result);

    expect(ids).toContain(own.id);
    expect(ids).not.toContain(foreign.id);
  });

  it.each([
    ['bulkDownload', (c: ReturnType<typeof caller>, ids: string[]) => c.bulkDownload({ ids })],
    ['bulkArchive', (c: ReturnType<typeof caller>, ids: string[]) => c.bulkArchive({ ids })],
    ['bulkDelete', (c: ReturnType<typeof caller>, ids: string[]) => c.bulkDelete({ ids })],
  ])("%s: another tenant's document is reported not found and left alone", async (_n, call) => {
    const before = JSON.stringify(foreign.toJSON());

    const result = (await call(caller(), [foreign.id])) as {
      successful: string[];
      failed: Array<{ id: string; error: string }>;
    };

    expect(result.successful).toEqual([]);
    expect(result.failed).toEqual([{ id: foreign.id, error: 'Document not found' }]);
    expect(JSON.stringify(result)).not.toContain('foreign-contract');
    const stored = await store.repo.findById(foreign.id, OTHER_TENANT);
    expect(JSON.stringify(stored?.toJSON())).toBe(before);
  });

  // upload.router reads the same repository through the container. A foreign id
  // must be answered like a missing one, never FORBIDDEN, or the reply confirms
  // that another tenant's document exists.
  it("upload.getUploadStatus: another tenant's document is NOT_FOUND, like a missing one", async () => {
    const upload = uploadRouter.createCaller(
      createAdminContext({ container: { get: () => store.repo } as never })
    );

    await expect(upload.getUploadStatus({ documentId: foreign.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Document not found',
    });
    await expect(
      upload.getUploadStatus({ documentId: '0ddba11c-0000-4000-8000-0ddba11c0000' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Document not found' });
    await expect(upload.getUploadStatus({ documentId: own.id })).resolves.toMatchObject({
      id: own.id,
    });
  });
});
