import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_SCORING_RESPONSE,
  DEFAULT_SENTIMENT_RESPONSE,
  DEFAULT_EMBEDDING_RESPONSE,
  createMockChatOpenAI,
  createMockOpenAIEmbeddings,
  ChatOpenAI,
  OpenAIEmbeddings,
} from './langchain-openai.mock';

describe('langchain-openai.mock', () => {
  describe('DEFAULT_SCORING_RESPONSE', () => {
    it('has score and confidence', () => {
      expect(DEFAULT_SCORING_RESPONSE.score).toBe(75);
      expect(DEFAULT_SCORING_RESPONSE.confidence).toBe(0.85);
    });
    it('has 4 factors', () => {
      expect(DEFAULT_SCORING_RESPONSE.factors).toHaveLength(4);
    });
    it('factors have name, impact, reasoning', () => {
      DEFAULT_SCORING_RESPONSE.factors.forEach((f) => {
        expect(f.name).toBeDefined();
        expect(typeof f.impact).toBe('number');
        expect(f.reasoning.length).toBeGreaterThan(10);
      });
    });
  });

  describe('DEFAULT_SENTIMENT_RESPONSE', () => {
    it('has sentiment and confidence', () => {
      expect(DEFAULT_SENTIMENT_RESPONSE.sentiment).toBe('positive');
      expect(DEFAULT_SENTIMENT_RESPONSE.confidence).toBe(0.82);
    });
    it('has aspects', () => {
      expect(DEFAULT_SENTIMENT_RESPONSE.aspects).toHaveLength(2);
      expect(DEFAULT_SENTIMENT_RESPONSE.aspects[0].aspect).toBe('product');
    });
  });

  describe('DEFAULT_EMBEDDING_RESPONSE', () => {
    it('has 1536 dimensions', () => {
      expect(DEFAULT_EMBEDDING_RESPONSE.embedding).toHaveLength(1536);
    });
    it('contains numbers', () => {
      DEFAULT_EMBEDDING_RESPONSE.embedding.forEach((v) => expect(typeof v).toBe('number'));
    });
  });

  describe('createMockChatOpenAI', () => {
    it('creates a constructor', () => {
      expect(typeof createMockChatOpenAI()).toBe('function');
    });
    it('instances have invoke', () => {
      const i = new (createMockChatOpenAI() as any)();
      expect(typeof i.invoke).toBe('function');
    });
    it('invoke returns default response', async () => {
      const i = new (createMockChatOpenAI() as any)();
      const r = await i.invoke('p');
      expect(r.content).toBe(JSON.stringify(DEFAULT_SCORING_RESPONSE));
    });
    it('invoke returns custom response', async () => {
      const c = { a: 1 };
      const i = new (createMockChatOpenAI(c) as any)();
      const r = await i.invoke('p');
      expect(r.content).toBe(JSON.stringify(c));
    });
    it('stream yields response', async () => {
      const i = new (createMockChatOpenAI() as any)();
      const chunks = [];
      for await (const ch of i.stream('p')) chunks.push(ch);
      expect(chunks.length).toBeGreaterThan(0);
    });
    it('bind returns this', () => {
      const i = new (createMockChatOpenAI() as any)();
      expect(i.bind()).toBe(i);
    });
    it('pipe returns this', () => {
      const i = new (createMockChatOpenAI() as any)();
      expect(i.pipe()).toBe(i);
    });
  });

  describe('createMockOpenAIEmbeddings', () => {
    it('creates a constructor', () => {
      expect(typeof createMockOpenAIEmbeddings()).toBe('function');
    });
    it('embedQuery returns default', async () => {
      const i = new (createMockOpenAIEmbeddings() as any)();
      expect(await i.embedQuery('t')).toHaveLength(1536);
    });
    it('embedQuery accepts custom', async () => {
      const i = new (createMockOpenAIEmbeddings([1, 2, 3]) as any)();
      expect(await i.embedQuery('t')).toEqual([1, 2, 3]);
    });
    it('embedDocuments returns array', async () => {
      const i = new (createMockOpenAIEmbeddings() as any)();
      const r = await i.embedDocuments(['a', 'b', 'c']);
      expect(r).toHaveLength(3);
      expect(r[0]).toHaveLength(1536);
    });
  });

  describe('module exports', () => {
    it('ChatOpenAI is a constructor', () => {
      expect(typeof ChatOpenAI).toBe('function');
    });
    it('OpenAIEmbeddings is a constructor', () => {
      expect(typeof OpenAIEmbeddings).toBe('function');
    });
  });
});
