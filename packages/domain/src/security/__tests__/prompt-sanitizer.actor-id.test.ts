/**
 * Prompt Sanitizer actor id - production bug (AI analysis failed for every lead)
 *
 * The API container runs GuardrailsAIService with the literal system actor
 * ('system'), and real User ids are cuid(), not uuid. A uuid-only check rejected
 * both, so every lead's AI analysis failed "security validation". The id must
 * accept cuid, uuid and the system actor, and still reject anything unsafe.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  safePromptSchema,
  sanitizationPipeline,
  resetRateLimit,
  SYSTEM_ACTOR_ID,
  MAX_ACTOR_ID_LENGTH,
} from '../prompt-sanitizer';

const TEXT = 'Score this lead: CTO at Acme Corp';
const CUID = 'cmh3k2x9a0000qz8l4d7r1v2b';
const UUID = '550e8400-e29b-41d4-a716-446655440000';

const parse = (userId: string) => safePromptSchema.safeParse({ text: TEXT, userId });

describe('safePromptSchema userId', () => {
  beforeEach(() => resetRateLimit());

  it('exports the system actor as the literal the container uses', () => {
    expect(SYSTEM_ACTOR_ID).toBe('system');
  });

  it.each([
    ['system actor', 'system'],
    ['cuid user id', CUID],
    ['uuid user id', UUID],
  ])('accepts a %s', (_label, userId) => {
    expect(parse(userId).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['whitespace', 'user 1'],
    ['path traversal', '../etc'],
    ['markup', '<script>'],
    ['quote', "a'b"],
    ['newline', 'a\nb'],
    ['semicolon', 'a;b'],
    ['over the length cap', 'a'.repeat(MAX_ACTOR_ID_LENGTH + 1)],
  ])('rejects an unsafe id: %s', (_label, userId) => {
    expect(parse(userId).success).toBe(false);
  });

  it('accepts an id at exactly the length cap', () => {
    expect(parse('a'.repeat(MAX_ACTOR_ID_LENGTH)).success).toBe(true);
  });

  it('lets the pipeline sanitize a lead prompt for the system actor', async () => {
    await expect(sanitizationPipeline({ text: TEXT, userId: 'system' })).resolves.toMatchObject({
      userId: 'system',
    });
  });

  it('rate-limits by the supplied key, so one tenant cannot exhaust another', async () => {
    for (let i = 0; i < 3; i++) {
      await sanitizationPipeline({
        text: TEXT,
        userId: 'system',
        rateLimitKey: 'tenant-a',
        maxRequestsPerMinute: 3,
      });
    }
    await expect(
      sanitizationPipeline({
        text: TEXT,
        userId: 'system',
        rateLimitKey: 'tenant-a',
        maxRequestsPerMinute: 3,
      })
    ).rejects.toThrow(/rate limit/i);
    await expect(
      sanitizationPipeline({
        text: TEXT,
        userId: 'system',
        rateLimitKey: 'tenant-b',
        maxRequestsPerMinute: 3,
      })
    ).resolves.toBeDefined();
  });
});
