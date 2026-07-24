/**
 * M16 — Expanded PII redaction tests for GuardrailsAIService.sanitizeText
 *
 * sanitizeText is private, so we exercise it through the public scoreLead path:
 * the method is called on `result.reasoning` inside sanitizeOutput().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import type { AIServicePort, LeadScoringInput, LeadScoringResult } from '@intelliflow/application';
import type { AuditLogPort, AuditLogResult } from '@intelliflow/application';
import { GuardrailsAIService, type GuardrailsConfig } from '../GuardrailsAIService';

const mockSanitizationPipeline = vi.fn();
const mockDetectScoreBias = vi.fn();

vi.mock('@intelliflow/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@intelliflow/domain')>();
  return {
    ...actual,
    sanitizationPipeline: (...args: any[]) => mockSanitizationPipeline(...args),
    resetRateLimit: () => {},
    checkRateLimit: () => true,
  };
});

vi.mock('../../shared/bias-detector.js', () => ({
  detectScoreBias: (...args: any[]) => mockDetectScoreBias(...args),
}));

// -------------------------------------------------------------------

function makeMockAI(reasoning: string): AIServicePort {
  return {
    scoreLead: vi.fn().mockResolvedValue(
      Result.ok({
        score: 70,
        confidence: 0.8,
        modelVersion: 'v1',
        reasoning,
      } as LeadScoringResult)
    ),
    qualifyLead: vi.fn(),
    generateEmail: vi.fn(),
  };
}

function makeMockAudit(): AuditLogPort {
  return {
    logSecurityEvent: vi.fn().mockResolvedValue({
      eventId: 'e1',
      persistedAt: new Date(),
      status: 'PERSISTED',
      integrityHash: 'h',
    } as AuditLogResult),
    logBatchEvents: vi.fn(),
    verifyLogIntegrity: vi.fn(),
  };
}

const config: GuardrailsConfig = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  jurisdiction: 'EU',
  enableBiasDetection: false,
  rateLimit: 100,
  enableLogging: false, // silence audit calls in these focused tests
};

const baseInput: LeadScoringInput = {
  email: 'lead@example.com',
  firstName: 'Jane',
  lastName: 'Smith',
  company: 'Acme',
  title: 'VP',
  phone: '+447123456789',
  source: 'crm',
};

async function redact(reasoning: string): Promise<string | undefined> {
  const service = new GuardrailsAIService(makeMockAI(reasoning), makeMockAudit(), config);
  const r = await service.scoreLead(baseInput);
  return r.isSuccess ? r.value?.reasoning : undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSanitizationPipeline.mockResolvedValue({ text: 'safe', safe: true });
  mockDetectScoreBias.mockReturnValue({ biasDetected: false, violations: [] });
});

// -------------------------------------------------------------------

describe('M16 PII redaction — email (pre-existing)', () => {
  it('redacts a plain email address', async () => {
    const out = await redact('Contact john.doe@company.org for details');
    expect(out).not.toContain('john.doe@company.org');
    expect(out).toContain('[EMAIL_REDACTED]');
  });
});

describe('M16 PII redaction — US SSN', () => {
  it('redacts NNN-NN-NNNN pattern', async () => {
    const out = await redact('SSN: 123-45-6789 on file');
    expect(out).not.toContain('123-45-6789');
    expect(out).toContain('[REDACTED_SSN]');
  });

  it('does NOT redact a date-like pattern (YYYY-MM-DD)', async () => {
    const out = await redact('Born on 2001-03-14');
    // YYYY-MM-DD won't match NNN-NN-NNNN (different group sizes)
    expect(out).not.toContain('[REDACTED_SSN]');
  });
});

describe('M16 PII redaction — Credit card (Luhn)', () => {
  it('redacts a valid Visa-style card number (spaces)', async () => {
    // 4111 1111 1111 1111 is the canonical Luhn-valid test number
    const out = await redact('Card: 4111 1111 1111 1111 charged');
    expect(out).not.toContain('4111 1111 1111 1111');
    expect(out).toContain('[REDACTED_CC]');
  });

  it('redacts a valid card number without separators', async () => {
    const out = await redact('card=4111111111111111');
    expect(out).not.toContain('4111111111111111');
    expect(out).toContain('[REDACTED_CC]');
  });

  it('redacts a valid card number with dashes', async () => {
    // 4111-1111-1111-1111
    const out = await redact('number 4111-1111-1111-1111 processed');
    expect(out).not.toContain('4111-1111-1111-1111');
    expect(out).toContain('[REDACTED_CC]');
  });

  it('does NOT redact 16-digit sequence that fails Luhn', async () => {
    // 1234 5678 9012 3456 — fails Luhn
    const out = await redact('ref 1234 5678 9012 3456 found');
    expect(out).not.toContain('[REDACTED_CC]');
  });

  it('redacts a 15-digit Amex-style number (Luhn-valid)', async () => {
    // 378282246310005 — valid Amex test number
    const out = await redact('amex 378282246310005 ok');
    expect(out).not.toContain('378282246310005');
    expect(out).toContain('[REDACTED_CC]');
  });
});

describe('M16 PII redaction — IBAN', () => {
  it('redacts a German IBAN', async () => {
    // DE89370400440532013000 — valid format IBAN
    const out = await redact('Bank: DE89370400440532013000');
    expect(out).not.toContain('DE89370400440532013000');
    expect(out).toContain('[REDACTED_IBAN]');
  });

  it('redacts a GB IBAN', async () => {
    const out = await redact('IBAN GB29NWBK60161331926819 used');
    expect(out).not.toContain('GB29NWBK60161331926819');
    expect(out).toContain('[REDACTED_IBAN]');
  });

  it('does NOT redact a plain two-letter prefix that is not IBAN length', async () => {
    const out = await redact('code AB12 short');
    // AB12 has only 2 alphanumeric chars after check digits — less than 11 min
    expect(out).not.toContain('[REDACTED_IBAN]');
  });
});

describe('M16 PII redaction — NHS number', () => {
  it('redacts NHS number when NHS keyword is present', async () => {
    const out = await redact('NHS number: 943 476 5919 on record');
    expect(out).not.toContain('943 476 5919');
    expect(out).toContain('[REDACTED_NHS]');
  });

  it('redacts NHS number with dashes when NHS keyword present', async () => {
    const out = await redact('NHS: 943-476-5919');
    expect(out).not.toContain('943-476-5919');
    expect(out).toContain('[REDACTED_NHS]');
  });

  it('does NOT redact 10-digit group when NHS keyword is absent', async () => {
    const out = await redact('order reference 943 476 5919 confirmed');
    expect(out).not.toContain('[REDACTED_NHS]');
  });
});

describe('M16 PII redaction — Brazilian CPF', () => {
  it('redacts NNN.NNN.NNN-NN pattern', async () => {
    const out = await redact('CPF 123.456.789-09 verified');
    expect(out).not.toContain('123.456.789-09');
    expect(out).toContain('[REDACTED_CPF]');
  });

  it('does NOT redact a version number like 1.2.3-4 (too short)', async () => {
    const out = await redact('version 1.2.3-4 released');
    expect(out).not.toContain('[REDACTED_CPF]');
  });
});

describe('M16 PII redaction — multiple patterns in one string', () => {
  it('redacts all PII types found in a single reasoning string', async () => {
    const reasoning = [
      'Email: ceo@bigcorp.com',
      'SSN: 321-54-9876',
      'Card: 4111 1111 1111 1111',
      'IBAN: DE89370400440532013000',
      'NHS 001 002 0034',
      'CPF 321.654.987-00',
    ].join('; ');

    const out = await redact(reasoning);
    expect(out).not.toContain('ceo@bigcorp.com');
    expect(out).not.toContain('321-54-9876');
    expect(out).not.toContain('4111 1111 1111 1111');
    expect(out).not.toContain('DE89370400440532013000');
    expect(out).not.toContain('001 002 0034');
    expect(out).not.toContain('321.654.987-00');

    expect(out).toContain('[EMAIL_REDACTED]');
    expect(out).toContain('[REDACTED_SSN]');
    expect(out).toContain('[REDACTED_CC]');
    expect(out).toContain('[REDACTED_IBAN]');
    expect(out).toContain('[REDACTED_NHS]');
    expect(out).toContain('[REDACTED_CPF]');
  });
});

describe('M16 PII redaction — clean text unchanged', () => {
  it('returns reasoning unchanged when no PII present', async () => {
    const clean = 'This lead has a high engagement score based on company size.';
    const out = await redact(clean);
    expect(out).toBe(clean);
  });
});
