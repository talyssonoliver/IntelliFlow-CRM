/**
 * GeminiEmbeddings — LangChain `Embeddings` adapter for Google's Generative
 * Language embeddings API (`gemini-embedding-001`).
 *
 * Why a hand-rolled adapter instead of `@langchain/google-genai`:
 *  - No new runtime dependency (the supabase-js bump that needed Node 22 — see
 *    #238 — is a reminder that every dep is a prod-boot risk).
 *  - Exact control over `outputDimensionality` so vectors match the CRM's
 *    pgvector(1536) columns with NO schema migration. `gemini-embedding-001`
 *    uses Matryoshka representation learning, so dims < 3072 are truncations
 *    that Google recommends L2-normalizing before cosine similarity — we do.
 *
 * Construction never makes a network call (safe at module-init, where
 * `new EmbeddingChain()` builds the embeddings — see #238). A missing key only
 * fails when an embedding is actually requested, with a clear error.
 */
import { Embeddings, type EmbeddingsParams } from '@langchain/core/embeddings';

export interface GeminiEmbeddingsParams extends EmbeddingsParams {
  apiKey: string;
  /** Defaults to `gemini-embedding-001`. */
  model?: string;
  /** Output dimension (must match the pgvector column). Defaults to 1536. */
  dimensions?: number;
  /** Override the API base (tests). */
  baseUrl?: string;
}

type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

interface EmbedContentResponse {
  embedding?: { values?: number[] };
}

export class GeminiEmbeddings extends Embeddings {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly baseUrl: string;

  constructor(params: GeminiEmbeddingsParams) {
    super(params);
    this.apiKey = params.apiKey;
    this.model = params.model ?? 'gemini-embedding-001';
    this.dimensions = params.dimensions ?? 1536;
    this.baseUrl = params.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t, 'RETRIEVAL_DOCUMENT')));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embed(text, 'RETRIEVAL_QUERY');
  }

  private async embed(text: string, taskType: EmbedTaskType): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error(
        'GEMINI_API_KEY must be set for Gemini embeddings (EMBEDDING_PROVIDER=gemini). ' +
          'Get a key at https://aistudio.google.com/apikey.'
      );
    }
    // `this.caller` (from the base Embeddings class) applies retry + concurrency limits.
    const json = await this.caller.call(async () => {
      const res = await fetch(`${this.baseUrl}/models/${this.model}:embedContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: this.dimensions,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Gemini embeddings HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      return (await res.json()) as EmbedContentResponse;
    });

    const values = json.embedding?.values;
    if (!values || values.length === 0) {
      throw new Error('Gemini embeddings returned an empty vector');
    }
    return this.normalize(values);
  }

  /** L2-normalize — required for MRL-truncated dims (< 3072) per Google's guidance. */
  private normalize(vector: number[]): number[] {
    let sumSq = 0;
    for (const x of vector) sumSq += x * x;
    const norm = Math.sqrt(sumSq);
    return norm > 0 ? vector.map((x) => x / norm) : vector;
  }
}
