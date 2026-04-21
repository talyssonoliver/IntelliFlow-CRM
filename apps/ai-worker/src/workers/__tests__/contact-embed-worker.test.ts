import { describe, expect, it, vi } from 'vitest';
import {
  contactToEmbeddableText,
  ContactEmbedJobDataSchema,
  ContactEmbedWorker,
} from '../contact-embed-worker';
import type { Job } from 'bullmq';

function buildPrisma(
  overrides?: Partial<{ contact: unknown | null }>,
): any {
  return {
    contact: {
      findFirst: async () =>
        overrides && 'contact' in overrides
          ? (overrides.contact as any)
          : {
              id: 'c-1',
              firstName: 'Ada',
              lastName: 'Lovelace',
              email: 'ada@analytical.com',
              company: 'Analytical',
            },
    },
  };
}

function buildJob(data: unknown): Job<any, any, string> {
  return {
    id: '1',
    name: 'embed',
    data,
    attemptsMade: 0,
  } as unknown as Job<any, any, string>;
}

describe('contactToEmbeddableText', () => {
  it('joins all non-empty fields with spaces', () => {
    expect(
      contactToEmbeddableText({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@a.com',
        company: 'Analytical',
      }),
    ).toBe('Ada Lovelace ada@a.com Analytical');
  });

  it('skips null / empty fields', () => {
    expect(
      contactToEmbeddableText({
        firstName: 'Ada',
        lastName: null,
        email: null,
        company: null,
      }),
    ).toBe('Ada');
  });
});

describe('ContactEmbedJobDataSchema', () => {
  it('accepts valid job payload', () => {
    const parsed = ContactEmbedJobDataSchema.parse({
      contactId: 'c-1',
      tenantId: 't-1',
      reason: 'create',
    });
    expect(parsed.reason).toBe('create');
  });

  it('rejects invalid reason enum', () => {
    expect(() =>
      ContactEmbedJobDataSchema.parse({
        contactId: 'c-1',
        tenantId: 't-1',
        reason: 'unknown',
      }),
    ).toThrow();
  });
});

describe('ContactEmbedWorker.process', () => {
  it('fetches contact, builds text, calls embeddingChain + updateContactEmbedding', async () => {
    const embeddingChain = {
      generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
    };
    const updateEmbed = vi.fn(async () => {});
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      embeddingChain,
      updateEmbed,
    );

    const result = await worker.process(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' }),
    );
    expect(embeddingChain.generateEmbedding).toHaveBeenCalled();
    expect(updateEmbed).toHaveBeenCalledWith(
      expect.anything(),
      'c-1',
      't-1',
      [0.1, 0.2, 0.3],
    );
    expect(result.embedded).toBe(true);
    expect(result.contactId).toBe('c-1');
  });

  it('returns embedded=false when contact is missing (no LLM call)', async () => {
    const generate = vi.fn(async () => [0.1]);
    const worker = new ContactEmbedWorker(
      buildPrisma({ contact: null }),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: generate },
      vi.fn(async () => {}),
    );
    const result = await worker.process(
      buildJob({ contactId: 'c-missing', tenantId: 't-1', reason: 'create' }),
    );
    expect(result.embedded).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns embedded=false when text is empty (early return, no LLM call)', async () => {
    const generate = vi.fn(async () => [0.1]);
    const worker = new ContactEmbedWorker(
      buildPrisma({
        contact: { id: 'c-1', firstName: null, lastName: null, email: null, company: null },
      }),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: generate },
      vi.fn(async () => {}),
    );
    const result = await worker.process(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' }),
    );
    expect(result.embedded).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns embedded=false when embeddingChain returns null', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      { generateEmbedding: async () => null },
      vi.fn(async () => {}),
    );
    const result = await worker.process(
      buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' }),
    );
    expect(result.embedded).toBe(false);
  });

  it('propagates embeddingChain failure so BullMQ can retry', async () => {
    const worker = new ContactEmbedWorker(
      buildPrisma(),
      { host: 'localhost', port: 6379 },
      {
        generateEmbedding: async () => {
          throw new Error('LiteLLM down');
        },
      },
      vi.fn(async () => {}),
    );
    await expect(
      worker.process(
        buildJob({ contactId: 'c-1', tenantId: 't-1', reason: 'create' }),
      ),
    ).rejects.toThrow(/LiteLLM down/);
  });
});
