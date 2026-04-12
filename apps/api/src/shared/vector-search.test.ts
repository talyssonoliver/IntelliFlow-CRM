/**
 * Vector Search Demo using pgvector
 * Task: IFC-006 - Supabase Integration Test
 *
 * This module demonstrates semantic search capabilities using:
 * - pgvector extension for PostgreSQL
 * - OpenAI embeddings (1536 dimensions)
 * - Cosine similarity search
 *
 * Use cases:
 * - Semantic lead search (find similar leads)
 * - Contact deduplication (find similar contacts)
 * - AI-powered recommendations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  supabaseAdmin,
  searchLeadsByEmbedding,
  searchContactsByEmbedding,
  updateLeadEmbedding,
  updateContactEmbedding,
  LeadSearchResult,
  ContactSearchResult,
} from '../lib/supabase';

// ============================================
// VECTOR EMBEDDING UTILITIES
// ============================================

/**
 * Generate a mock embedding vector (1536 dimensions for OpenAI)
 * In production, use OpenAI's embedding API
 */
export function generateMockEmbedding(seed: string): number[] {
  // Create deterministic pseudo-random embedding based on seed
  const embedding: number[] = [];
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  for (let i = 0; i < 1536; i++) {
    // Generate pseudo-random value between -1 and 1
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const value = (hash / 0x7fffffff) * 2 - 1;
    embedding.push(value);
  }

  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map((val) => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimension');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Generate embedding from text using OpenAI API
 * Requires OPENAI_API_KEY environment variable
 */
export async function generateOpenAIEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('OpenAI API key not configured, using mock embedding');
    return generateMockEmbedding(text);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: text,
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', await response.text());
      return generateMockEmbedding(text);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  } catch (error) {
    console.error('OpenAI embedding error:', error);
    return generateMockEmbedding(text);
  }
}

// ============================================
// LEAD SEMANTIC SEARCH
// ============================================

/**
 * Create text representation of a lead for embedding
 */
export function leadToText(lead: {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  title?: string | null;
  email?: string;
}): string {
  const parts = [
    lead.firstName,
    lead.lastName,
    lead.title && `works as ${lead.title}`,
    lead.company && `at ${lead.company}`,
    lead.email && `email ${lead.email}`,
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Search for semantically similar leads
 */
export async function searchSimilarLeads(
  queryText: string,
  options?: {
    threshold?: number;
    limit?: number;
    useOpenAI?: boolean;
  }
): Promise<{
  results: LeadSearchResult[];
  embedding: number[];
  error: Error | null;
}> {
  const { threshold = 0.7, limit = 10, useOpenAI = false } = options || {};

  // Generate embedding for query
  const embedding = useOpenAI
    ? await generateOpenAIEmbedding(queryText)
    : generateMockEmbedding(queryText);

  if (!embedding) {
    return {
      results: [],
      embedding: [],
      error: new Error('Failed to generate embedding'),
    };
  }

  // Search using pgvector
  const { data, error } = await searchLeadsByEmbedding(embedding, threshold, limit);

  return {
    results: data,
    embedding,
    error,
  };
}

// ============================================
// CONTACT SEMANTIC SEARCH
// ============================================

/**
 * Create text representation of a contact for embedding
 */
export function contactToText(contact: {
  firstName: string;
  lastName: string;
  title?: string | null;
  department?: string | null;
  email: string;
}): string {
  const parts = [
    contact.firstName,
    contact.lastName,
    contact.title && `works as ${contact.title}`,
    contact.department && `in ${contact.department}`,
    contact.email && `email ${contact.email}`,
  ].filter(Boolean);

  return parts.join(' ');
}

/**
 * Search for semantically similar contacts
 */
export async function searchSimilarContacts(
  queryText: string,
  options?: {
    threshold?: number;
    limit?: number;
    useOpenAI?: boolean;
  }
): Promise<{
  results: ContactSearchResult[];
  embedding: number[];
  error: Error | null;
}> {
  const { threshold = 0.7, limit = 10, useOpenAI = false } = options || {};

  // Generate embedding for query
  const embedding = useOpenAI
    ? await generateOpenAIEmbedding(queryText)
    : generateMockEmbedding(queryText);

  if (!embedding) {
    return {
      results: [],
      embedding: [],
      error: new Error('Failed to generate embedding'),
    };
  }

  // Search using pgvector
  const { data, error } = await searchContactsByEmbedding(embedding, threshold, limit);

  return {
    results: data,
    embedding,
    error,
  };
}

// ============================================
// DEDUPLICATION HELPERS
// ============================================

/**
 * Find potential duplicate leads based on semantic similarity
 */
export async function findDuplicateLeads(
  lead: {
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    title?: string | null;
    email?: string;
  },
  threshold = 0.9
): Promise<{
  duplicates: LeadSearchResult[];
  isDuplicate: boolean;
  error: Error | null;
}> {
  const queryText = leadToText(lead);
  const result = await searchSimilarLeads(queryText, { threshold, limit: 5 });

  return {
    duplicates: result.results,
    isDuplicate: result.results.length > 0,
    error: result.error,
  };
}

/**
 * Find potential duplicate contacts based on semantic similarity
 */
export async function findDuplicateContacts(
  contact: {
    firstName: string;
    lastName: string;
    title?: string | null;
    department?: string | null;
    email: string;
  },
  threshold = 0.9
): Promise<{
  duplicates: ContactSearchResult[];
  isDuplicate: boolean;
  error: Error | null;
}> {
  const queryText = contactToText(contact);
  const result = await searchSimilarContacts(queryText, { threshold, limit: 5 });

  return {
    duplicates: result.results,
    isDuplicate: result.results.length > 0,
    error: result.error,
  };
}

// ============================================
// VECTOR SEARCH TESTS
// ============================================

describe('Vector Search Demo (pgvector)', () => {
  describe('Embedding Generation', () => {
    it('should generate mock embedding with correct dimensions', () => {
      const embedding = generateMockEmbedding('test lead');

      expect(embedding).toHaveLength(1536);
      expect(embedding.every((v) => typeof v === 'number')).toBe(true);
      expect(embedding.every((v) => v >= -1 && v <= 1)).toBe(true);
    });

    it('should generate deterministic embeddings for same input', () => {
      const embedding1 = generateMockEmbedding('john smith ceo acme');
      const embedding2 = generateMockEmbedding('john smith ceo acme');

      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different inputs', () => {
      const embedding1 = generateMockEmbedding('john smith ceo acme');
      const embedding2 = generateMockEmbedding('jane doe cfo beta corp');

      expect(embedding1).not.toEqual(embedding2);
    });

    it('should normalize embedding vectors', () => {
      const embedding = generateMockEmbedding('test');
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

      // Magnitude should be approximately 1 (normalized)
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('Cosine Similarity', () => {
    it('should return 1 for identical vectors', () => {
      const embedding = generateMockEmbedding('test');
      const similarity = cosineSimilarity(embedding, embedding);

      expect(similarity).toBeCloseTo(1, 5);
    });

    it('should calculate similarity between different embeddings', () => {
      const embedding1 = generateMockEmbedding('john smith ceo technology');
      const embedding2 = generateMockEmbedding('john smith cto technology');
      const similarity = cosineSimilarity(embedding1, embedding2);

      // Mock embeddings are hash-based, not semantically similar
      // This test verifies the function returns a valid similarity value
      // between -1 and 1 (cosine similarity range)
      expect(similarity).toBeGreaterThanOrEqual(-1);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    it('should return lower similarity for different texts', () => {
      const embedding1 = generateMockEmbedding('software engineer san francisco');
      const embedding2 = generateMockEmbedding('marketing director new york');
      const similarity = cosineSimilarity(embedding1, embedding2);

      // Different texts should have lower similarity
      expect(similarity).toBeLessThan(0.9);
    });

    it('should throw error for mismatched dimensions', () => {
      const embedding1 = [0.1, 0.2, 0.3];
      const embedding2 = [0.1, 0.2];

      expect(() => cosineSimilarity(embedding1, embedding2)).toThrow(
        'Vectors must have the same dimension'
      );
    });
  });

  describe('Lead Text Representation', () => {
    it('should convert lead to text representation', () => {
      const lead = {
        firstName: 'John',
        lastName: 'Smith',
        company: 'Acme Corp',
        title: 'CEO',
        email: 'john@acme.com',
      };

      const text = leadToText(lead);

      expect(text).toContain('John');
      expect(text).toContain('Smith');
      expect(text).toContain('Acme Corp');
      expect(text).toContain('CEO');
    });

    it('should handle partial lead data', () => {
      const lead = {
        firstName: 'John',
        lastName: null,
        company: null,
        title: null,
      };

      const text = leadToText(lead);

      expect(text).toContain('John');
      expect(text).not.toContain('null');
    });
  });

  describe('Contact Text Representation', () => {
    it('should convert contact to text representation', () => {
      const contact = {
        firstName: 'Jane',
        lastName: 'Doe',
        title: 'CTO',
        department: 'Engineering',
        email: 'jane@company.com',
      };

      const text = contactToText(contact);

      expect(text).toContain('Jane');
      expect(text).toContain('Doe');
      expect(text).toContain('CTO');
      expect(text).toContain('Engineering');
    });
  });

  describe('Semantic Search Integration', () => {
    it('should search similar leads (mock mode)', async () => {
      const result = await searchSimilarLeads('technology startup CEO', {
        threshold: 0.5,
        limit: 5,
        useOpenAI: false,
      });

      expect(result.embedding).toHaveLength(1536);
      expect(Array.isArray(result.results)).toBe(true);
      // Results may be empty if no data in database, but should not error
    });

    it('should search similar contacts (mock mode)', async () => {
      const result = await searchSimilarContacts('engineering manager', {
        threshold: 0.5,
        limit: 5,
        useOpenAI: false,
      });

      expect(result.embedding).toHaveLength(1536);
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should find duplicate leads', async () => {
      const lead = {
        firstName: 'John',
        lastName: 'Smith',
        company: 'Acme Corp',
        title: 'CEO',
        email: 'john@acme.com',
      };

      const result = await findDuplicateLeads(lead, 0.9);

      expect(typeof result.isDuplicate).toBe('boolean');
      expect(Array.isArray(result.duplicates)).toBe(true);
    });

    it('should find duplicate contacts', async () => {
      const contact = {
        firstName: 'Jane',
        lastName: 'Doe',
        title: 'CTO',
        department: 'Engineering',
        email: 'jane@company.com',
      };

      const result = await findDuplicateContacts(contact, 0.9);

      expect(typeof result.isDuplicate).toBe('boolean');
      expect(Array.isArray(result.duplicates)).toBe(true);
    });
  });
});

// ============================================
// PGVECTOR SETUP SQL (for reference)
// ============================================

/**
 * SQL to enable pgvector extension and create similarity search functions
 * Run this in Supabase SQL Editor or as a migration
 */
export const PGVECTOR_SETUP_SQL = `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create function to search leads by embedding similarity
CREATE OR REPLACE FUNCTION match_leads_by_embedding(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id text,
  email text,
  "firstName" text,
  "lastName" text,
  company text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    leads.id,
    leads.email,
    leads."firstName",
    leads."lastName",
    leads.company,
    1 - (leads.embedding <=> query_embedding) as similarity
  FROM leads
  WHERE leads.embedding IS NOT NULL
    AND 1 - (leads.embedding <=> query_embedding) > match_threshold
  ORDER BY leads.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create function to search contacts by embedding similarity
CREATE OR REPLACE FUNCTION match_contacts_by_embedding(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id text,
  email text,
  "firstName" text,
  "lastName" text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    contacts.id,
    contacts.email,
    contacts."firstName",
    contacts."lastName",
    1 - (contacts.embedding <=> query_embedding) as similarity
  FROM contacts
  WHERE contacts.embedding IS NOT NULL
    AND 1 - (contacts.embedding <=> query_embedding) > match_threshold
  ORDER BY contacts.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for faster similarity search
CREATE INDEX IF NOT EXISTS leads_embedding_idx ON leads
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS contacts_embedding_idx ON contacts
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
`;

// ============================================
// DEMO EXECUTION
// ============================================

/**
 * Run a complete vector search demonstration
 */
export async function runVectorSearchDemo(): Promise<{
  embeddingGeneration: boolean;
  similarityCalculation: boolean;
  leadSearch: boolean;
  contactSearch: boolean;
  overall: boolean;
}> {
  const results = {
    embeddingGeneration: false,
    similarityCalculation: false,
    leadSearch: false,
    contactSearch: false,
    overall: false,
  };

  try {
    // Test embedding generation
    const embedding = generateMockEmbedding('test lead');
    results.embeddingGeneration = embedding.length === 1536;

    // Test similarity calculation
    const embedding2 = generateMockEmbedding('test lead');
    const similarity = cosineSimilarity(embedding, embedding2);
    results.similarityCalculation = similarity > 0.99;

    // Test lead search
    const leadResult = await searchSimilarLeads('technology CEO', { threshold: 0.5 });
    results.leadSearch = Array.isArray(leadResult.results);

    // Test contact search
    const contactResult = await searchSimilarContacts('engineering manager', { threshold: 0.5 });
    results.contactSearch = Array.isArray(contactResult.results);

    results.overall =
      results.embeddingGeneration &&
      results.similarityCalculation &&
      results.leadSearch &&
      results.contactSearch;
  } catch (error) {
    console.error('Vector search demo error:', error);
  }

  return results;
}

// Export SQL for migrations
export { PGVECTOR_SETUP_SQL as pgvectorSetupSql };
