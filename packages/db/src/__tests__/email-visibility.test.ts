import { describe, expect, it } from 'vitest';
import {
  emailVisibilityWhere,
  emailVisibleSql,
  loggedPersonalMailIds,
  mailViewerOf,
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

describe('mailViewerOf', () => {
  it('copies the scope that decides which leads are visible', () => {
    expect(
      mailViewerOf({ tenantId: 't', userId: 'u', role: 'MANAGER', teamMemberIds: ['a'] })
    ).toEqual({ tenantId: 't', userId: 'u', role: 'MANAGER', teamMemberIds: ['a'] });
  });
});
