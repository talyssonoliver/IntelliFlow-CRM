/**
 * The open rate on a lead's profile card: the procedure's scoping, and the address pattern. What the
 * counts are for each kind of mail is proved against a real database in
 * tests/integration/lead-email-engagement.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';
import { emailLogRouter } from '../email-log.router';
import { addressPattern } from '../lead-email-engagement';

const LEAD_ID = 'clh0000000000000000000l01';
const ADDRESS = 'ada@example.invalid';

describe('addressPattern', () => {
  it('matches the address as a whole entry of a recipient list, and escapes regex characters', () => {
    const re = new RegExp(addressPattern(ADDRESS), 'i');
    expect(re.test('ada@example.invalid')).toBe(true);
    expect(re.test('Bob <b@x.invalid>, Ada <ADA@example.invalid>')).toBe(true);
    expect(re.test('b@x.invalid; ada@example.invalid')).toBe(true);
    // Not a longer address that merely contains it, and the dot is a dot, not "any character".
    expect(re.test('someone-ada@example.invalid')).toBe(false);
    expect(re.test('ada@example.invalid.other')).toBe(false);
    expect(re.test('ada@exampleXinvalid')).toBe(false);
  });

  it('escapes every regex metacharacter in an address', () => {
    const re = new RegExp(addressPattern('a+b(1)@x.invalid'));
    expect(re.test('a+b(1)@x.invalid')).toBe(true);
    expect(re.test('aab(1)@x.invalid')).toBe(false);
  });
});

describe('emailLog.engagementForLead', () => {
  const caller = () => emailLogRouter.createCaller(createTestContext() as never);

  beforeEach(() => {
    (prismaMock.lead.findFirst as any).mockResolvedValue({ email: ADDRESS });
    (prismaMock.$queryRaw as any).mockResolvedValue([{ sent: 4, opened: 3 }]);
  });

  it('returns the database counts, asking for the lead tenant and address only', async () => {
    await expect(caller().engagementForLead({ leadId: LEAD_ID })).resolves.toEqual({
      sent: 4,
      opened: 3,
    });
    expect((prismaMock.lead.findFirst as any).mock.calls[0][0].where).toMatchObject({
      id: LEAD_ID,
      tenantId: TEST_UUIDS.tenant,
    });
    // One aggregate query, nothing loaded and capped: the tenant and the address go in as parameters.
    expect(prismaMock.emailRecord.findMany).not.toHaveBeenCalled();
    const sql = (prismaMock.$queryRaw as any).mock.calls[0][0];
    expect(sql.values).toContain(TEST_UUIDS.tenant);
    expect(sql.values).toContain(addressPattern(ADDRESS));
    expect(sql.values).toContain(ADDRESS);
    // The tenant is a bound parameter in the where clause, not interpolated text.
    expect(sql.sql).toContain('r."tenantId" = ?');
    expect(sql.sql).not.toContain(TEST_UUIDS.tenant);
  });

  it('returns zeros for no rows, and zero for a lead the caller cannot see (no mail query at all)', async () => {
    (prismaMock.$queryRaw as any).mockResolvedValue([]);
    await expect(caller().engagementForLead({ leadId: LEAD_ID })).resolves.toEqual({
      sent: 0,
      opened: 0,
    });
    (prismaMock.$queryRaw as any).mockClear();
    (prismaMock.lead.findFirst as any).mockResolvedValue(null);
    await expect(caller().engagementForLead({ leadId: LEAD_ID })).resolves.toEqual({
      sent: 0,
      opened: 0,
    });
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });
});
