/**
 * Retrieval full-text fallback — Real-Database Integration Test
 *
 * 23-26/11/2026: the embedding model reached end of life (HTTP 410), so every semantic search
 * fell back to full text, and the fallback itself failed in Postgres with 42601 "syntax error at
 * or near $5": the optional case filter was a nested `$queryRaw` template, which runs as its own
 * query and was bound as a parameter. Every "Context retrieval failed" then returned no RAG
 * context. A second fault sat behind it: the query read `case_documents.search_vector`, a column
 * no migration creates.
 *
 * Runs the real RetrievalService against the local test database (never production: the harness
 * refuses any host but this machine). Skips like the other DB suites without a DATABASE_URL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIsolatedTestPrismaClient } from './setup';
import { RetrievalService } from '../../apps/ai-worker/src/services/retrieval-service';

const DB_URL = process.env.DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

const TAG = `retrievalfts_${Date.now()}`;

describeDb('retrieval full-text fallback (real database)', () => {
  let prisma: any;
  let tenantA = '';
  let tenantB = '';
  const userId = `${TAG}_user`;
  const caseOne = `${TAG}_case_1`;
  const caseTwo = `${TAG}_case_2`;
  let docOne = '';
  let docTwo = '';
  let docOtherTenant = '';

  // createIsolatedTestPrismaClient() returns null when the harness has no real DB.
  beforeEach((ctx) => {
    if (!prisma) ctx.skip();
  });

  async function newDocument(tenantId: string, title: string, description: string, caseId: string) {
    const doc = await prisma.caseDocument.create({
      data: {
        tenantId,
        status: 'DRAFT',
        title,
        description,
        documentType: 'CONTRACT',
        classification: 'INTERNAL',
        relatedCaseId: caseId,
        storageKey: `${TAG}/${title}`,
        contentHash: 'a'.repeat(64),
        mimeType: 'application/pdf',
        sizeBytes: BigInt(10),
        createdBy: userId,
        updatedBy: userId,
      },
    });
    return doc.id as string;
  }

  beforeAll(async () => {
    prisma = createIsolatedTestPrismaClient();
    if (!prisma) return;
    const [a, b] = await Promise.all(
      ['a', 'b'].map((n) =>
        prisma.tenant.create({ data: { name: `${TAG}-${n}`, slug: `${TAG}-${n}` } })
      )
    );
    tenantA = a.id;
    tenantB = b.id;
    docOne = await newDocument(
      tenantA,
      'Master services agreement',
      'Renewal terms for the restaurant group',
      caseOne
    );
    docTwo = await newDocument(
      tenantA,
      'Supplier agreement',
      'Renewal terms for the supplier',
      caseTwo
    );
    docOtherTenant = await newDocument(
      tenantB,
      'Other tenant agreement',
      'Renewal terms that must never leak',
      caseOne
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.caseDocument.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.$disconnect();
  });

  /** The embedding provider is down: what OpenRouter answered for the retired model. */
  function brokenEmbeddings() {
    return {
      generateEmbedding: vi
        .fn()
        .mockRejectedValue(new Error('410 The model has reached its end of life')),
    } as any;
  }

  function search(
    searchType: 'fulltext' | 'semantic' | 'hybrid',
    extra: Record<string, unknown> = {}
  ) {
    const service = new RetrievalService(prisma, { minScore: 0 }, brokenEmbeddings());
    return service.search({
      tenantId: tenantA,
      userId,
      userRoles: [],
      query: 'renewal terms',
      sources: ['documents'],
      searchType,
      limit: 20,
      offset: 0,
      includeMetadata: true,
      minRelevanceScore: 0,
      semanticThreshold: 0.7,
      ...extra,
    } as any);
  }

  it('full text finds the tenant documents, without a case filter', async () => {
    const { results } = await search('fulltext');

    expect(results.map((r) => r.id).sort()).toEqual([docOne, docTwo].sort());
  });

  it('full text with a case filter returns only that case (the $5 binding)', async () => {
    const { results } = await search('fulltext', { caseId: caseOne });

    expect(results.map((r) => r.id)).toEqual([docOne]);
  });

  it('never returns another tenant document', async () => {
    const { results } = await search('fulltext', { caseId: caseOne });

    expect(results.map((r) => r.id)).not.toContain(docOtherTenant);
  });

  it('semantic search returns full-text results (case_documents has no vector column to query)', async () => {
    // case_documents has no embedding column, so the schema probe sends this to full text and the
    // embedding provider is never asked; the provider-down fallback itself is unit-tested.
    const { results } = await search('semantic', { caseId: caseTwo });

    expect(results.map((r) => r.id)).toEqual([docTwo]);
  });

  it('hybrid search returns the same documents (full text only, no vector column)', async () => {
    const { results } = await search('hybrid');

    expect(results.map((r) => r.id).sort()).toEqual([docOne, docTwo].sort());
  });
});
