/**
 * Survey service tests (MVP-012): token lifecycle, send, answer, automatic triggers and the 30-day
 * throttle, against a small in-memory stand-in for the Prisma client. Names are invented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateNPS } from '@intelliflow/domain';
import {
  createAndSendSurvey,
  lookupPublicSurvey,
  queueAutoSurvey,
  queueSurveyForResolvedTicket,
  queueSurveyForWonDeal,
  submitPublicSurvey,
  cleanComment,
  type SurveyDb,
  type SurveyEmailSender,
} from '../survey-service';
import { hashSurveyToken, tokenMatchesHash, SURVEY_TOKEN_PATTERN } from '../survey-token';
import { isValidSurveyScore, sentimentForScore } from '../survey-scoring';
import { buildSurveyEmail } from '../survey-email';

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value == null;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('gte' in cond) return value != null && value >= cond.gte;
      if ('gt' in cond) return value != null && value > cond.gt;
      return false;
    }
    return value === cond;
  });
}

function makeDb() {
  const surveys: Row[] = [];
  const contacts: Row[] = [
    {
      id: 'c1',
      tenantId: TENANT_A,
      email: 'mara@example.invalid',
      firstName: 'Mara',
      lastName: 'Quill',
      accountId: 'acc1',
    },
    {
      id: 'c2',
      tenantId: TENANT_B,
      email: 'orin@example.invalid',
      firstName: 'Orin',
      lastName: 'Vale',
      accountId: null,
    },
  ];
  const settings: Row[] = [];
  const restrictions: Row[] = [];
  const deals: Row[] = [{ id: 'd1', tenantId: TENANT_A, contactId: 'c1' }];
  const tickets: Row[] = [
    { id: 't1', tenantId: TENANT_A, contactId: null, contactEmail: 'mara@example.invalid' },
  ];
  let seq = 0;
  const db = {
    contact: {
      findFirst: vi.fn(async ({ where }: any) => contacts.find((c) => matches(c, where)) ?? null),
    },
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => ({
        name: where.id === TENANT_A ? 'Harbour Mill Co' : 'Other Co',
      })),
    },
    opportunity: {
      findFirst: vi.fn(async ({ where }: any) => deals.find((d) => matches(d, where)) ?? null),
    },
    ticket: {
      findFirst: vi.fn(async ({ where }: any) => tickets.find((t) => matches(t, where)) ?? null),
    },
    processingRestriction: {
      findFirst: vi.fn(
        async ({ where }: any) =>
          restrictions.find(
            (r) =>
              r.tenantId === where.tenantId &&
              r.subjectEmail === where.subjectEmail &&
              r.liftedAt == null
          ) ?? null
      ),
    },
    feedbackSurveySetting: {
      findUnique: vi.fn(
        async ({ where }: any) => settings.find((s) => s.tenantId === where.tenantId) ?? null
      ),
    },
    feedbackSurvey: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `s${++seq}`, ...data };
        surveys.push(row);
        return { id: row.id };
      }),
      count: vi.fn(async ({ where }: any) => surveys.filter((s) => matches(s, where)).length),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = surveys.find((s) => s.tokenHash === where.tokenHash);
        return row ?? null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hits = surveys.filter((s) => matches(s, where));
        hits.forEach((s) => Object.assign(s, data));
        return { count: hits.length };
      }),
    },
  };
  return { db: db as unknown as SurveyDb, surveys, settings, restrictions, raw: db };
}

function okSender(): SurveyEmailSender & { sendEmail: ReturnType<typeof vi.fn> } {
  return { sendEmail: vi.fn(async () => ({ isFailure: false })) };
}

/** The raw token only exists inside the emailed link. */
function tokenFrom(sender: { sendEmail: ReturnType<typeof vi.fn> }): string {
  const text: string = sender.sendEmail.mock.calls.at(-1)![0].textBody;
  return /\/feedback\/([A-Za-z0-9_-]{43})/.exec(text)![1];
}

const NOW = new Date('2026-11-27T10:00:00Z');
const DAY = 86_400_000;

describe('token helpers', () => {
  it('matches only the hash of the same token', () => {
    const hash = hashSurveyToken('a'.repeat(43));
    expect(tokenMatchesHash('a'.repeat(43), hash)).toBe(true);
    expect(tokenMatchesHash('b'.repeat(43), hash)).toBe(false);
    expect(SURVEY_TOKEN_PATTERN.test('a'.repeat(43))).toBe(true);
    expect(SURVEY_TOKEN_PATTERN.test('short')).toBe(false);
  });
});

describe('scoring', () => {
  it('validates score ranges per type and maps sentiment', () => {
    expect(isValidSurveyScore('NPS', 0)).toBe(true);
    expect(isValidSurveyScore('NPS', 11)).toBe(false);
    expect(isValidSurveyScore('CSAT', 0)).toBe(false);
    expect(isValidSurveyScore('CSAT', 5)).toBe(true);
    expect(isValidSurveyScore('CSAT', 3.5)).toBe(false);
    expect(sentimentForScore('NPS', 9)).toBe('POSITIVE');
    expect(sentimentForScore('NPS', 7)).toBe('NEUTRAL');
    expect(sentimentForScore('NPS', 6)).toBe('NEGATIVE');
    expect(sentimentForScore('CSAT', 4)).toBe('POSITIVE');
    expect(sentimentForScore('CSAT', 3)).toBe('NEUTRAL');
    expect(sentimentForScore('CSAT', 1)).toBe('NEGATIVE');
  });
});

describe('survey email', () => {
  it('escapes company names and keeps the subject on one line', () => {
    const message = buildSurveyEmail({
      companyName: 'Bad <b>Co</b>\nBcc: x',
      surveyType: 'NPS',
      link: 'https://app.example.invalid/feedback/abc',
      recipientEmail: 'mara@example.invalid',
    });
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(message.htmlBody).not.toContain('<b>Co</b>');
    expect(message.to).toEqual(['mara@example.invalid']);
  });
});

describe('createAndSendSurvey', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores only the token hash, sets an expiry, emails the link and marks it sent', async () => {
    const { db, surveys } = makeDb();
    const sender = okSender();
    const result = await createAndSendSurvey(
      db,
      sender,
      { tenantId: TENANT_A, contactId: 'c1', surveyType: 'NPS', trigger: 'MANUAL' },
      NOW
    );
    expect(result).toMatchObject({ ok: true, delivered: true });
    const token = tokenFrom(sender);
    expect(surveys[0].tokenHash).toBe(hashSurveyToken(token));
    expect(JSON.stringify(surveys[0])).not.toContain(token);
    expect(surveys[0].tokenExpiresAt.getTime()).toBe(NOW.getTime() + 14 * DAY);
    expect(surveys[0]).toMatchObject({ status: 'SENT', accountId: 'acc1', trigger: 'MANUAL' });
    expect(sender.sendEmail.mock.calls[0][0].to).toEqual(['mara@example.invalid']);
  });

  it('sends nothing to a contact under a processing restriction', async () => {
    const { db, surveys, restrictions } = makeDb();
    restrictions.push({
      tenantId: TENANT_A,
      subjectEmail: 'mara@example.invalid',
      liftedAt: null,
      blocksMarketing: true,
      createdAt: NOW,
    });
    const sender = okSender();
    const result = await createAndSendSurvey(
      db,
      sender,
      { tenantId: TENANT_A, contactId: 'c1', surveyType: 'NPS', trigger: 'MANUAL' },
      NOW
    );
    expect(result).toEqual({ ok: false, reason: 'restricted' });
    expect(surveys).toHaveLength(0);
    expect(sender.sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing when the restriction check itself fails', async () => {
    const { db, surveys, raw } = makeDb();
    raw.processingRestriction.findFirst.mockRejectedValueOnce(new Error('db down'));
    const sender = okSender();
    const result = await createAndSendSurvey(
      db,
      sender,
      { tenantId: TENANT_A, contactId: 'c1', surveyType: 'NPS', trigger: 'MANUAL' },
      NOW
    );
    expect(result).toEqual({ ok: false, reason: 'restricted' });
    expect(surveys).toHaveLength(0);
    expect(sender.sendEmail).not.toHaveBeenCalled();
  });

  it('still sends when only another tenant restricted the same address', async () => {
    const { db, restrictions } = makeDb();
    restrictions.push({ tenantId: TENANT_B, subjectEmail: 'mara@example.invalid', liftedAt: null });
    const sender = okSender();
    const result = await createAndSendSurvey(
      db,
      sender,
      { tenantId: TENANT_A, contactId: 'c1', surveyType: 'NPS', trigger: 'MANUAL' },
      NOW
    );
    expect(result).toMatchObject({ ok: true, delivered: true });
  });

  it('refuses a contact that belongs to another tenant', async () => {
    const { db, surveys } = makeDb();
    const sender = okSender();
    const result = await createAndSendSurvey(
      db,
      sender,
      { tenantId: TENANT_A, contactId: 'c2', surveyType: 'CSAT', trigger: 'MANUAL' },
      NOW
    );
    expect(result).toEqual({ ok: false, reason: 'contact_not_found' });
    expect(surveys).toHaveLength(0);
    expect(sender.sendEmail).not.toHaveBeenCalled();
  });

  it('leaves the survey pending and reports it when the email fails', async () => {
    const { db, surveys } = makeDb();
    const sender = { sendEmail: vi.fn(async () => ({ isFailure: true })) };
    const result = await createAndSendSurvey(
      db,
      sender,
      { tenantId: TENANT_A, contactId: 'c1', surveyType: 'NPS', trigger: 'MANUAL' },
      NOW
    );
    expect(result).toMatchObject({ ok: true, delivered: false });
    expect(surveys[0].status).toBe('PENDING');
    expect(surveys[0].sentAt).toBeUndefined();
  });
});

describe('token lifecycle: lookup and answer', () => {
  async function sendOne(type: 'NPS' | 'CSAT' = 'NPS') {
    const ctx = makeDb();
    const sender = okSender();
    await createAndSendSurvey(
      ctx.db,
      sender,
      { tenantId: TENANT_A, contactId: 'c1', surveyType: type, trigger: 'MANUAL' },
      NOW
    );
    return { ...ctx, token: tokenFrom(sender) };
  }

  it('valid token: shows the question type and only the company name', async () => {
    const { db, token } = await sendOne();
    const result = await lookupPublicSurvey(db, token, NOW);
    expect(result).toEqual({ status: 'ok', surveyType: 'NPS', companyName: 'Harbour Mill Co' });
  });

  it('unknown token reads as invalid', async () => {
    const { db } = await sendOne();
    expect(await lookupPublicSurvey(db, 'z'.repeat(43), NOW)).toEqual({ status: 'invalid' });
    expect(await submitPublicSurvey(db, { token: 'z'.repeat(43), score: 9 }, NOW)).toEqual({
      status: 'invalid',
    });
  });

  it('expired token is refused and nothing is stored', async () => {
    const { db, surveys, token } = await sendOne();
    const later = new Date(NOW.getTime() + 15 * DAY);
    expect(await lookupPublicSurvey(db, token, later)).toEqual({ status: 'expired' });
    expect(await submitPublicSurvey(db, { token, score: 9 }, later)).toEqual({ status: 'expired' });
    expect(surveys[0].status).toBe('SENT');
    expect(surveys[0].score).toBeUndefined();
  });

  it('stores the answer once; a reused token is refused', async () => {
    const { db, surveys, token } = await sendOne();
    const first = await submitPublicSurvey(
      db,
      { token, score: 9, comment: '  Great team\u0007 ' },
      NOW
    );
    expect(first).toEqual({ status: 'ok' });
    expect(surveys[0]).toMatchObject({
      status: 'RESPONDED',
      score: 9,
      comment: 'Great team',
      sentiment: 'POSITIVE',
      tenantId: TENANT_A,
    });
    expect(surveys[0].tokenUsedAt).toEqual(NOW);
    expect(await submitPublicSurvey(db, { token, score: 2 }, NOW)).toEqual({ status: 'used' });
    expect(await lookupPublicSurvey(db, token, NOW)).toEqual({ status: 'used' });
    expect(surveys[0].score).toBe(9);
  });

  it('two simultaneous submits cannot both win', async () => {
    const { db, surveys, token } = await sendOne();
    const [a, b] = await Promise.all([
      submitPublicSurvey(db, { token, score: 10 }, NOW),
      submitPublicSurvey(db, { token, score: 0 }, NOW),
    ]);
    expect([a.status, b.status].filter((s) => s === 'ok')).toHaveLength(1);
    expect(surveys.filter((s) => s.status === 'RESPONDED')).toHaveLength(1);
  });

  it('rejects a score outside the type range', async () => {
    const { db, surveys, token } = await sendOne('CSAT');
    expect(await submitPublicSurvey(db, { token, score: 0 }, NOW)).toEqual({ status: 'bad_score' });
    expect(await submitPublicSurvey(db, { token, score: 7 }, NOW)).toEqual({ status: 'bad_score' });
    expect(surveys[0].status).toBe('SENT');
  });

  it('takes the tenant from the stored row, never from the visitor', async () => {
    const { db, surveys, token } = await sendOne();
    await submitPublicSurvey(db, { token, score: 8, tenantId: TENANT_B } as any, NOW);
    expect(surveys[0].tenantId).toBe(TENANT_A);
  });

  it('answers feed the NPS the analytics page shows', async () => {
    const ctx = makeDb();
    const scores = [10, 9, 8, 3];
    for (const score of scores) {
      const sender = okSender();
      await createAndSendSurvey(
        ctx.db,
        sender,
        { tenantId: TENANT_A, contactId: 'c1', surveyType: 'NPS', trigger: 'MANUAL' },
        NOW
      );
      await submitPublicSurvey(ctx.db, { token: tokenFrom(sender), score }, NOW);
    }
    const answered = ctx.surveys.filter((s) => s.status === 'RESPONDED' && s.tenantId === TENANT_A);
    expect(answered).toHaveLength(4);
    expect(calculateNPS(answered.map((s) => s.score))).toBe(25);
    expect(answered.map((s) => s.sentiment)).toEqual([
      'POSITIVE',
      'POSITIVE',
      'NEUTRAL',
      'NEGATIVE',
    ]);
  });
});

describe('cleanComment', () => {
  it('drops control characters, trims and caps the length', () => {
    expect(cleanComment(undefined)).toBeNull();
    expect(cleanComment('   ')).toBeNull();
    expect(cleanComment('a\u0000b\nc')).toBe('ab\nc');
    expect(cleanComment('x'.repeat(5000))).toHaveLength(2000);
  });
});

describe('automatic triggers', () => {
  it('won deal queues an NPS to the deal contact', async () => {
    const { db, surveys } = makeDb();
    const sender = okSender();
    expect(await queueSurveyForWonDeal(db, sender, TENANT_A, 'd1')).toBe('queued');
    expect(surveys[0]).toMatchObject({ type: 'NPS', trigger: 'DEAL_WON', dealId: 'd1' });
  });

  it('resolved ticket queues a CSAT, finding the contact by the ticket email', async () => {
    const { db, surveys } = makeDb();
    const sender = okSender();
    expect(await queueSurveyForResolvedTicket(db, sender, TENANT_A, 't1')).toBe('queued');
    expect(surveys[0]).toMatchObject({ type: 'CSAT', trigger: 'TICKET_RESOLVED', ticketId: 't1' });
  });

  it('is on by default and off when the tenant switches it off', async () => {
    const { db, surveys, settings } = makeDb();
    const sender = okSender();
    settings.push({ tenantId: TENANT_A, autoSendOnDealWon: false, autoSendOnTicketResolved: true });
    expect(await queueSurveyForWonDeal(db, sender, TENANT_A, 'd1')).toBe('disabled');
    expect(surveys).toHaveLength(0);
    expect(await queueSurveyForResolvedTicket(db, sender, TENANT_A, 't1')).toBe('queued');
  });

  it('sends at most one survey per contact per 30 days', async () => {
    const { db, surveys } = makeDb();
    const sender = okSender();
    const input = { tenantId: TENANT_A, trigger: 'DEAL_WON' as const, contactId: 'c1' };
    expect(await queueAutoSurvey(db, sender, input, NOW)).toBe('queued');
    expect(await queueAutoSurvey(db, sender, input, new Date(NOW.getTime() + 10 * DAY))).toBe(
      'throttled'
    );
    expect(surveys).toHaveLength(1);
    expect(await queueAutoSurvey(db, sender, input, new Date(NOW.getTime() + 31 * DAY))).toBe(
      'queued'
    );
    expect(surveys).toHaveLength(2);
  });

  it('skips a won deal whose contact restricted processing', async () => {
    const { db, surveys, restrictions } = makeDb();
    restrictions.push({ tenantId: TENANT_A, subjectEmail: 'mara@example.invalid', liftedAt: null });
    const sender = okSender();
    expect(await queueSurveyForWonDeal(db, sender, TENANT_A, 'd1')).toBe('restricted');
    expect(surveys).toHaveLength(0);
    expect(sender.sendEmail).not.toHaveBeenCalled();
  });

  it('a failed send does not count against the throttle', async () => {
    const { db } = makeDb();
    const failing = { sendEmail: vi.fn(async () => ({ isFailure: true })) };
    const input = { tenantId: TENANT_A, trigger: 'DEAL_WON' as const, contactId: 'c1' };
    expect(await queueAutoSurvey(db, failing, input, NOW)).toBe('not_sent');
    expect(await queueAutoSurvey(db, okSender(), input, NOW)).toBe('queued');
  });

  it('skips quietly with no contact or no email sender, and never throws', async () => {
    const { db } = makeDb();
    expect(
      await queueAutoSurvey(db, okSender(), {
        tenantId: TENANT_A,
        trigger: 'DEAL_WON',
        contactId: null,
      })
    ).toBe('no_contact');
    expect(
      await queueAutoSurvey(db, undefined, {
        tenantId: TENANT_A,
        trigger: 'DEAL_WON',
        contactId: 'c1',
      })
    ).toBe('no_sender');
    const broken = {
      sendEmail: vi.fn(async () => {
        throw new Error('smtp down');
      }),
    };
    expect(
      await queueAutoSurvey(db, broken, {
        tenantId: TENANT_A,
        trigger: 'DEAL_WON',
        contactId: 'c1',
      })
    ).toBe('not_sent');
  });
});
