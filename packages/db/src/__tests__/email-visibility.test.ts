import { describe, expect, it } from 'vitest';
import {
  emailTeamVisibleWhere,
  isTeamVisibleEmail,
  emailVisibilityWhere,
  emailVisibleSql,
  loggedPersonalMailIds,
  LOGGED_PERSONAL_MAIL_ID_CAP,
  mailViewerOf,
  visibleEmailWhere,
  visiblePeopleWhere,
  emailActivityWhere,
  emailActivitySql,
} from '../email-visibility';

type Where = ReturnType<typeof emailVisibilityWhere>;
const mailboxRules = (where: Where) => (where.AND[1] as { OR: Record<string, unknown>[] }).OR;

describe('emailVisibilityWhere (register #64)', () => {
  it('lets a user read the company mailbox and their own mailbox, never another user mailbox', () => {
    const or = mailboxRules(emailVisibilityWhere('u1'));
    expect(or).toContainEqual({ mailbox: { is: { scope: 'TENANT' } } });
    expect(or).toContainEqual({ mailbox: { is: { scope: 'USER', userId: 'u1' } } });
    // No branch opens a USER mailbox without naming the viewer.
    const userScoped = or.filter((rule) => JSON.stringify(rule).includes('"USER"'));
    expect(userScoped).toHaveLength(1);
  });

  it('keeps a draft with the person writing it', () => {
    const [drafts] = emailVisibilityWhere('u1').AND as [{ OR: unknown[] }, unknown];
    expect(drafts.OR).toContainEqual({ userId: 'u1' });
    expect(drafts.OR).toHaveLength(3);
  });

  it('adds mail logged to a visible lead or contact only when given its ids (fails closed without)', () => {
    expect(JSON.stringify(emailVisibilityWhere('u1'))).not.toContain('"in"');
    expect(mailboxRules(emailVisibilityWhere('u1', ['m1', 'm2']))).toContainEqual({
      id: { in: ['m1', 'm2'] },
    });
  });

  it('has no role argument: an administrator gets no extra branch', () => {
    expect(emailVisibilityWhere.length).toBeLessThanOrEqual(2); // viewer id, optional logged ids
    expect(JSON.stringify(emailVisibilityWhere('admin'))).not.toMatch(/ADMIN|role/);
  });
});

describe('emailVisibleSql / loggedPersonalMailIds', () => {
  const sqlOf = (role: string | null, team?: string[]) =>
    emailVisibleSql(
      { tenantId: 't', userId: 'u', role, teamMemberIds: team },
      { mail: 'r', mailbox: 'm' }
    ).sql;

  it('scopes logged mail to the leads and contacts the viewer can see, like createTenantWhereClause', () => {
    expect(sqlOf('ADMIN')).not.toContain('"ownerId"');
    expect(sqlOf('SALES_REP')).toContain('"ownerId" =');
    expect(sqlOf('MANAGER', ['x'])).toContain('"ownerId" IN');
    expect(sqlOf('MANAGER')).toContain('"ownerId" =');
  });

  it('keeps drafts with their writer and lets the company mailbox through', () => {
    const text = sqlOf('SALES_REP');
    expect(text).toContain("'isDraft'");
    expect(text).toContain("m.scope = 'TENANT'");
  });

  it('queries only the viewer tenant', async () => {
    const seen: unknown[][] = [];
    const db = {
      $queryRaw: async (query: { values: unknown[] }) => {
        seen.push(query.values);
        return [{ id: 'm1' }];
      },
    };
    expect(await loggedPersonalMailIds(db as never, { tenantId: 'T', userId: 'U' })).toEqual([
      'm1',
    ]);
    expect(seen[0]).toContain('T');
  });
});

describe('loggedPersonalMailIds bound', () => {
  it('limits the id list to the cap, newest first', async () => {
    const seen: { values: unknown[]; strings: string[] }[] = [];
    const db = {
      $queryRaw: async (query: { values: unknown[]; strings: string[] }) => {
        seen.push(query);
        return [];
      },
    };
    await loggedPersonalMailIds(db as never, { tenantId: 'T', userId: 'U', role: 'ADMIN' });
    expect(seen[0].values).toContain(LOGGED_PERSONAL_MAIL_ID_CAP);
    expect(seen[0].strings.join(' ')).toContain('ORDER BY e."createdAt" DESC');
  });
});

describe('visibleEmailWhere and the people scope', () => {
  it('looks the logged ids up and folds them into the where', async () => {
    const db = { $queryRaw: async () => [{ id: 'm1' }] };
    const where = await visibleEmailWhere(db as never, { tenantId: 'T', userId: 'U' });
    expect(JSON.stringify(where)).toContain('m1');
  });

  it('skips the lookup for an empty only list', async () => {
    const db = {
      $queryRaw: async () => {
        throw new Error('not expected');
      },
    };
    expect(await loggedPersonalMailIds(db as never, { tenantId: 'T', userId: 'U' }, [])).toEqual(
      []
    );
  });

  it('scopes people by role', () => {
    expect(visiblePeopleWhere({ userId: 'u', role: 'ADMIN' })).toEqual({});
    expect(visiblePeopleWhere({ userId: 'u', role: 'MANAGER', teamMemberIds: ['a'] })).toEqual({
      ownerId: { in: ['u', 'a'] },
    });
    expect(visiblePeopleWhere({ userId: 'u', role: 'USER' })).toEqual({ ownerId: 'u' });
  });

  it('shows EMAIL timeline entries only for people the viewer can see', () => {
    expect(emailActivityWhere('lead', null)).toEqual({ type: { not: 'EMAIL' } });
    expect(emailActivityWhere('lead', { userId: 'u', role: 'USER' })).toEqual({
      OR: [{ type: { not: 'EMAIL' } }, { lead: { is: { ownerId: 'u' } } }],
    });
  });

  it('builds the SQL form of the timeline rule', () => {
    const text = (q: { strings: string[] }) => q.strings.join('?');
    expect(text(emailActivitySql('lead', 'T', null) as never)).toContain("<> 'EMAIL'");
    const contact = emailActivitySql('contact', 'T', { userId: 'u', role: 'USER' });
    expect(text(contact as never)).toContain('IN (');
    const lead = emailActivitySql('lead', 'T', { userId: 'u', role: 'ADMIN' });
    expect(text(lead as never)).toContain('IN (');
  });
});

describe('mailViewerOf', () => {
  it('copies the scope that decides which leads are visible', () => {
    expect(
      mailViewerOf({ tenantId: 't', userId: 'u', role: 'MANAGER', teamMemberIds: ['a'] })
    ).toEqual({ tenantId: 't', userId: 'u', role: 'MANAGER', teamMemberIds: ['a'] });
  });
});

describe('emailTeamVisibleWhere (mail with no personal viewer)', () => {
  const where = emailTeamVisibleWhere();
  const [drafts, mailboxes] = where.AND as [{ OR: unknown[] }, { OR: Record<string, unknown>[] }];

  it('never lets a draft through: no branch names a writer', () => {
    expect(JSON.stringify(drafts)).not.toContain('userId');
    expect(drafts.OR).toHaveLength(2);
  });

  it('opens the company mailbox, ownerless inbound mail and mail logged to a lead or contact', () => {
    expect(mailboxes.OR).toContainEqual({ mailbox: { is: { scope: 'TENANT' } } });
    expect(mailboxes.OR).toContainEqual(expect.objectContaining({ mailboxId: null, userId: null }));
    expect(mailboxes.OR).toContainEqual({ contactId: { not: null } });
    expect(mailboxes.OR).toContainEqual({ metadata: { path: ['leadId'], string_starts_with: '' } });
  });

  it('has no branch for a personal mailbox, a viewer or a role', () => {
    const text = JSON.stringify(where);
    expect(text).not.toContain('"USER"');
    expect(text).not.toMatch(/ADMIN|role/);
    expect(emailTeamVisibleWhere.length).toBe(0);
  });
});

describe('isTeamVisibleEmail (the exact form, with the existence check)', () => {
  const ctx = {
    tenantMailboxIds: new Set(['mb_company']),
    contactIds: new Set(['c1']),
    leadIds: new Set(['l1']),
  };
  const row = (over: Record<string, unknown>) => ({
    mailboxId: null,
    userId: null,
    contactId: null,
    metadata: null,
    ...over,
  });

  it('lets through company mail, ownerless inbound mail and mail logged to a live lead or contact', () => {
    expect(isTeamVisibleEmail(row({ mailboxId: 'mb_company' }), ctx)).toBe(true);
    expect(isTeamVisibleEmail(row({}), ctx)).toBe(true);
    expect(
      isTeamVisibleEmail(row({ mailboxId: 'mb_me', userId: 'u1', contactId: 'c1' }), ctx)
    ).toBe(true);
    expect(
      isTeamVisibleEmail(row({ mailboxId: 'mb_me', userId: 'u1', metadata: { leadId: 'l1' } }), ctx)
    ).toBe(true);
  });

  it('keeps personal mail private when its lead or contact no longer exists', () => {
    expect(
      isTeamVisibleEmail(row({ mailboxId: 'mb_me', userId: 'u1', contactId: 'gone' }), ctx)
    ).toBe(false);
    expect(
      isTeamVisibleEmail(
        row({ mailboxId: 'mb_me', userId: 'u1', metadata: { leadId: 'gone' } }),
        ctx
      )
    ).toBe(false);
  });

  it('never lets a draft through, and never mail that is only personal', () => {
    expect(
      isTeamVisibleEmail(row({ mailboxId: 'mb_company', metadata: { isDraft: true } }), ctx)
    ).toBe(false);
    expect(isTeamVisibleEmail(row({ contactId: 'c1', metadata: { isDraft: true } }), ctx)).toBe(
      false
    );
    expect(isTeamVisibleEmail(row({ mailboxId: 'mb_me', userId: 'u1' }), ctx)).toBe(false);
    expect(isTeamVisibleEmail(row({ userId: 'u1' }), ctx)).toBe(false);
    expect(isTeamVisibleEmail(row({ metadata: { mailboxOwnerId: 'u1' } }), ctx)).toBe(false);
  });
});
