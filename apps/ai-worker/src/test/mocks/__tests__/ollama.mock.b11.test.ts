/**
 * Ollama Mock - B11 coverage tests
 *
 * Targets 0% coverage: all exported functions and default exports
 * - createMockChatOllama: constructor, invoke, stream, bind, pipe
 * - createMockOllamaEmbeddings: constructor, embedQuery, embedDocuments
 * - ChatOllama (default export)
 * - OllamaEmbeddings (default export)
 */
import { describe, it, expect } from 'vitest';
import {
  createMockChatOllama,
  createMockOllamaEmbeddings,
  ChatOllama,
  OllamaEmbeddings,
} from '../ollama.mock';

describe('Ollama Mock - b11 coverage', () => {
  describe('createMockChatOllama', () => {
    it('should create a constructor function', () => {
      const MockChatOllama = createMockChatOllama();
      expect(typeof MockChatOllama).toBe('function');
    });

    it('should use default response when no argument provided', () => {
      const MockChatOllama = createMockChatOllama();
      const instance = new (MockChatOllama as any)();
      expect(instance.invoke).toBeDefined();
      expect(instance.stream).toBeDefined();
      expect(instance.bind).toBeDefined();
      expect(instance.pipe).toBeDefined();
    });

    it('should invoke with default response', async () => {
      const MockChatOllama = createMockChatOllama();
      const instance = new (MockChatOllama as any)();
      const result = await instance.invoke('test');
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
    });

    it('should invoke with custom response', async () => {
      const customResponse = { key: 'custom-value', score: 42 };
      const MockChatOllama = createMockChatOllama(customResponse);
      const instance = new (MockChatOllama as any)();
      const result = await instance.invoke('test');
      expect(result.content).toBe(JSON.stringify(customResponse));
    });

    it('should stream with response', async () => {
      const MockChatOllama = createMockChatOllama({ data: 'streamed' });
      const instance = new (MockChatOllama as any)();
      const chunks: unknown[] = [];
      for await (const chunk of instance.stream('test')) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBe(1);
      expect((chunks[0] as any).content).toBe(JSON.stringify({ data: 'streamed' }));
    });

    it('should return this from bind', () => {
      const MockChatOllama = createMockChatOllama();
      const instance = new (MockChatOllama as any)();
      const result = instance.bind({ stop: ['\\n'] });
      expect(result).toBe(instance);
    });

    it('should return this from pipe', () => {
      const MockChatOllama = createMockChatOllama();
      const instance = new (MockChatOllama as any)();
      const result = instance.pipe({});
      expect(result).toBe(instance);
    });
  });

  describe('createMockOllamaEmbeddings', () => {
    it('should create a constructor function', () => {
      const MockEmbeddings = createMockOllamaEmbeddings();
      expect(typeof MockEmbeddings).toBe('function');
    });

    it('should embedQuery with default embedding', async () => {
      const MockEmbeddings = createMockOllamaEmbeddings();
      const instance = new (MockEmbeddings as any)();
      const result = await instance.embedQuery('test text');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should embedQuery with custom embedding', async () => {
      const customEmbedding = [0.1, 0.2, 0.3];
      const MockEmbeddings = createMockOllamaEmbeddings(customEmbedding);
      const instance = new (MockEmbeddings as any)();
      const result = await instance.embedQuery('test');
      expect(result).toEqual(customEmbedding);
    });

    it('should embedDocuments returning array of embeddings', async () => {
      const customEmbedding = [0.5, 0.6, 0.7];
      const MockEmbeddings = createMockOllamaEmbeddings(customEmbedding);
      const instance = new (MockEmbeddings as any)();
      const docs = ['doc1', 'doc2', 'doc3'];
      const result = await instance.embedDocuments(docs);
      expect(result.length).toBe(3);
      expect(result[0]).toEqual(customEmbedding);
      expect(result[1]).toEqual(customEmbedding);
      expect(result[2]).toEqual(customEmbedding);
    });
  });

  describe('default exports', () => {
    it('should export ChatOllama as a constructor', () => {
      expect(typeof ChatOllama).toBe('function');
    });

    it('should export OllamaEmbeddings as a constructor', () => {
      expect(typeof OllamaEmbeddings).toBe('function');
    });

    it('should create ChatOllama instance with invoke', async () => {
      const instance = new (ChatOllama as any)();
      const result = await instance.invoke('hello');
      expect(result.content).toBeDefined();
    });

    it('should create OllamaEmbeddings instance with embedQuery', async () => {
      const instance = new (OllamaEmbeddings as any)();
      const result = await instance.embedQuery('test');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
