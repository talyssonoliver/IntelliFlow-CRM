/**
 * IFC-312 — Shared enrichment port + adapter.
 *
 * Port/adapter pattern per ADR-047 (hexagonal). Chain consumers depend only on
 * the `EnrichmentProvider` interface. Concrete adapter routing is isolated here
 * so that swapping the backing provider (LiteLLM → Clearbit/Apollo/etc.) does
 * not touch chain code.
 *
 * First-ship adapter uses the internal LLM (LiteLLM tier `standard`) via
 * `createLLMForTenant('structured', 'standard', {tenantId})`. Inputs pass
 * through `sanitizeStringField`; outputs are validated against Zod schemas
 * and written with provenance (`modelVersion`, `source`). Errors never throw
 * to the caller — always resolve to `null`.
 */

import { z } from 'zod';
import { createLLMForTenant } from '../lib/llm-factory.js';
import { sanitizeStringField } from '../utils/input-sanitizer.js';
import { aiConfig } from '../config/ai.config.js';

// ────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ────────────────────────────────────────────────────────────────────────────

const ENRICHMENT_SOURCE = z.enum(['llm', 'adapter', 'fallback']);

export const ContactEnrichmentSchema = z.object({
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  linkedinUrl: z.string().optional(),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
  source: ENRICHMENT_SOURCE,
});

export const AccountEnrichmentSchema = z.object({
  industry: z.string().optional(),
  employees: z.number().int().nonnegative().optional(),
  revenue: z.number().nonnegative().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
  source: ENRICHMENT_SOURCE,
});

export type ContactEnrichment = z.infer<typeof ContactEnrichmentSchema>;
export type AccountEnrichment = z.infer<typeof AccountEnrichmentSchema>;

// Schema used for the LLM's structured output — same shape but without
// the adapter-owned provenance fields (which we inject post-invoke).
const ContactEnrichmentLLMSchema = ContactEnrichmentSchema.omit({
  modelVersion: true,
  source: true,
});
const AccountEnrichmentLLMSchema = AccountEnrichmentSchema.omit({
  modelVersion: true,
  source: true,
});

// ────────────────────────────────────────────────────────────────────────────
// Seed types
// ────────────────────────────────────────────────────────────────────────────

export interface ContactSeed {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

export interface AccountSeed {
  name: string;
  website?: string;
  domain?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Port interface
// ────────────────────────────────────────────────────────────────────────────

export interface EnrichmentProvider {
  enrichContact(seed: ContactSeed, tenantId: string): Promise<ContactEnrichment | null>;
  enrichAccount(seed: AccountSeed, tenantId: string): Promise<AccountEnrichment | null>;
}

// ────────────────────────────────────────────────────────────────────────────
// Version constants
// ────────────────────────────────────────────────────────────────────────────

const LITELLM_MODEL_VERSION = 'enrichment-litellm-v1';
const MOCK_MODEL_VERSION = 'mock-v1';

// ────────────────────────────────────────────────────────────────────────────
// Seed sanitization
// ────────────────────────────────────────────────────────────────────────────

function sanitizeContactSeed(seed: ContactSeed): ContactSeed {
  const out: ContactSeed = { email: sanitizeStringField(seed.email) };
  if (seed.firstName) out.firstName = sanitizeStringField(seed.firstName);
  if (seed.lastName) out.lastName = sanitizeStringField(seed.lastName);
  if (seed.company) out.company = sanitizeStringField(seed.company);
  return out;
}

function sanitizeAccountSeed(seed: AccountSeed): AccountSeed {
  const out: AccountSeed = { name: sanitizeStringField(seed.name) };
  if (seed.website) out.website = sanitizeStringField(seed.website);
  if (seed.domain) out.domain = sanitizeStringField(seed.domain);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// LiteLLM adapter — production path
// ────────────────────────────────────────────────────────────────────────────

export class LiteLLMEnrichmentAdapter implements EnrichmentProvider {
  async enrichContact(seed: ContactSeed, tenantId: string): Promise<ContactEnrichment | null> {
    const sanitized = sanitizeContactSeed(seed);
    try {
      const model = await createLLMForTenant('structured', 'standard', { tenantId });
      const structured = model.withStructuredOutput(ContactEnrichmentLLMSchema);
      const raw = await structured.invoke(
        [
          {
            role: 'system',
            content:
              'You enrich a CRM contact with publicly-knowable professional attributes. ' +
              'Return ONLY fields you are confident in. Use null (omit) rather than guessing. ' +
              'Cite confidence as a number between 0 and 1.',
          },
          {
            role: 'user',
            content: `Contact seed: ${JSON.stringify(sanitized)}. Return enrichment JSON.`,
          },
        ] as unknown as Parameters<typeof structured.invoke>[0]
      );

      const parsed = ContactEnrichmentSchema.safeParse({
        ...raw,
        modelVersion: LITELLM_MODEL_VERSION,
        source: 'llm',
      });
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async enrichAccount(seed: AccountSeed, tenantId: string): Promise<AccountEnrichment | null> {
    const sanitized = sanitizeAccountSeed(seed);
    try {
      const model = await createLLMForTenant('structured', 'standard', { tenantId });
      const structured = model.withStructuredOutput(AccountEnrichmentLLMSchema);
      const raw = await structured.invoke(
        [
          {
            role: 'system',
            content:
              'You enrich a CRM account with firmographic data (industry key, employees, ' +
              'revenue USD, description). Only emit fields you are confident in. ' +
              'Confidence is 0-1.',
          },
          {
            role: 'user',
            content: `Account seed: ${JSON.stringify(sanitized)}. Return enrichment JSON.`,
          },
        ] as unknown as Parameters<typeof structured.invoke>[0]
      );

      const parsed = AccountEnrichmentSchema.safeParse({
        ...raw,
        modelVersion: LITELLM_MODEL_VERSION,
        source: 'llm',
      });
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Mock adapter — test + local dev
// ────────────────────────────────────────────────────────────────────────────

export class MockEnrichmentAdapter implements EnrichmentProvider {
  async enrichContact(seed: ContactSeed, _tenantId: string): Promise<ContactEnrichment | null> {
    // Deterministic stub — drives downstream tests without LLM.
    return ContactEnrichmentSchema.parse({
      company: seed.company ?? 'Mock Co',
      jobTitle: 'Mock Title',
      location: 'Mock City, MC',
      city: 'Mock City',
      country: 'MC',
      linkedinUrl: `https://linkedin.com/in/${seed.firstName ?? 'mock'}-${seed.lastName ?? 'user'}`,
      confidence: 0.5,
      modelVersion: MOCK_MODEL_VERSION,
      source: 'adapter',
    });
  }

  async enrichAccount(seed: AccountSeed, _tenantId: string): Promise<AccountEnrichment | null> {
    return AccountEnrichmentSchema.parse({
      industry: 'general',
      employees: 10,
      revenue: 1_000_000,
      description: `Mock enrichment for ${seed.name}`,
      website: seed.website ?? 'https://mock.example',
      confidence: 0.5,
      modelVersion: MOCK_MODEL_VERSION,
      source: 'adapter',
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

let _cached: EnrichmentProvider | null = null;

export function getEnrichmentAdapter(): EnrichmentProvider {
  if (_cached) return _cached;
  _cached = aiConfig.provider === 'mock'
    ? new MockEnrichmentAdapter()
    : new LiteLLMEnrichmentAdapter();
  return _cached;
}

// Test helper — clears the cached adapter so vi.doMock('ai.config') can pick.
export function __resetEnrichmentAdapterCache(): void {
  _cached = null;
}
