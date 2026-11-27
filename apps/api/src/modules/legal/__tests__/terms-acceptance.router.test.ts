/**
 * Terms Acceptance Router Tests — IFC-309
 *
 * Tests: idempotency, input isolation (AC-003/004/005), cross-tenant isolation (NF-002),
 * immutability (NF-005), UNAUTHORIZED on unauthenticated calls (AC-007).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const USER_1 = 'user-111';
const TERMS_V1 = 'v1.0';

const mockUpsertRecord = {
  id: 'cla0000000000000000000001',
  tenantId: TENANT_A,
  userId: USER_1,
  termsVersion: TERMS_V1,
  acceptedAt: new Date('2026-06-29T10:00:00.000Z'),
  ipAddress: '203.0.113.42',
  userAgent: 'Mozilla/5.0',
  route: '/terms',
};

const mockPrisma = {
  termsAcceptance: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  },
};

function makeMockReq(xffHeader?: string, userAgentHeader?: string) {
  return {
    headers: {
      get: vi.fn((name: string) => {
        if (name === 'x-forwarded-for') return xffHeader ?? null;
        if (name === 'user-agent') return userAgentHeader ?? 'TestAgent/1.0';
        // CSRF guard: mutations require either an Origin or a custom anti-CSRF header.
        // Supply a Bearer token so assertMutationCsrfSafe passes in direct caller tests.
        if (name === 'authorization') return 'Bearer ' + 'x'.repeat(8);
        return null;
      }),
      has: vi.fn((name: string) => name === 'authorization'),
    },
  };
}

function makeCtx(
  tenantId: string = TENANT_A,
  userId: string = USER_1,
  xffHeader?: string,
  userAgentHeader?: string
) {
  return {
    prisma: mockPrisma as any,
    // Router uses ctx.prismaWithTenant (RLS-scoped) for all data ops.
    prismaWithTenant: mockPrisma as any,
    user: {
      userId,
      email: 'test@example.com',
      role: 'USER',
      tenantId,
      emailVerified: true,
    },
    tenant: {
      tenantId,
      tenantType: 'user' as const,
      userId,
      role: 'user' as const,
    },
    req: makeMockReq(xffHeader, userAgentHeader),
    services: {},
  };
}

async function createCaller(ctx: ReturnType<typeof makeCtx>) {
  const mod = (await import('../terms-acceptance.router.js')) as any;
  const { termsAcceptanceRouter } = mod;
  return termsAcceptanceRouter.createCaller(ctx);
}

describe('termsAcceptanceRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.termsAcceptance.upsert.mockResolvedValue(mockUpsertRecord);
    mockPrisma.termsAcceptance.findFirst.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // accept mutation
  // -------------------------------------------------------------------------
  describe('accept mutation', () => {
    it('persists record and returns { accepted: true, acceptedAt }', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, '10.0.0.1, 203.0.113.42'));
      const result = await caller.accept({
        termsVersion: TERMS_V1,
        route: '/terms',
      });

      expect(result.accepted).toBe(true);
      expect(result.acceptedAt).toBeInstanceOf(Date);
      expect(mockPrisma.termsAcceptance.upsert).toHaveBeenCalledOnce();
    });

    it('is idempotent — second call returns same result, no error (AC-002)', async () => {
      const caller = await createCaller(makeCtx());
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });
      const result2 = await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      expect(result2.accepted).toBe(true);
      // upsert called both times (idempotency is enforced at DB level)
      expect(mockPrisma.termsAcceptance.upsert).toHaveBeenCalledTimes(2);

      // Confirm the upsert always uses empty update: {} (AC-002, NF-005)
      const calls = mockPrisma.termsAcceptance.upsert.mock.calls;
      for (const [args] of calls) {
        expect(args.update).toEqual({});
      }
    });

    it('extracts ipAddress from x-forwarded-for header, not from input (AC-004)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, '192.168.1.1, 203.0.113.99'));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      // rightmost hop (trusted edge)
      expect(upsertArgs.create.ipAddress).toBe('203.0.113.99');
    });

    it('stores null ipAddress when no x-forwarded-for header present (AC-004)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, undefined));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.ipAddress).toBeNull();
    });

    it('stores null for malformed x-forwarded-for values (AC-004 — sanitizeIp guard)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, 'not-an-ip-at-all'));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      // sanitizeIp rejects malformed values to prevent garbage in the DB audit column
      expect(upsertArgs.create.ipAddress).toBeNull();
    });

    it('extracts userAgent from request user-agent header server-side — not from input', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, undefined, 'Mozilla/5.0 Test'));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.userAgent).toBe('Mozilla/5.0 Test');
    });

    it('takes tenantId from session ctx — not from input (AC-005)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.tenantId).toBe(TENANT_A);
    });

    it('takes userId from session ctx — not from input (AC-005)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.userId).toBe(USER_1);
    });

    it('Zod schema STRIPS any "acceptedAt" field in input — it never reaches the upsert (AC-003)', async () => {
      const caller = await createCaller(makeCtx());
      // Zod strips unknown fields by default; the extra field is silently ignored.
      // Behaviour decision (IFC-309 gap closure): strip-and-ignore, not reject. Stored values
      // are always server-derived, so a spoofed field can never reach the database.
      await expect(
        caller.accept({
          termsVersion: TERMS_V1,
          route: '/terms',
          acceptedAt: new Date().toISOString(),
        } as any)
      ).resolves.toBeDefined();
      // The important constraint is that acceptedAt does NOT appear in the upsert create
      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create).not.toHaveProperty('acceptedAt');
    });

    it('Zod schema does not allow tenantId in input (AC-005) — extra fields stripped', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1));

      await caller.accept({
        termsVersion: TERMS_V1,
        route: '/terms',
        tenantId: TENANT_B,
      } as any);

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      // Must use TENANT_A from ctx, not TENANT_B from input
      expect(upsertArgs.create.tenantId).toBe(TENANT_A);
    });

    it('ignores a client-supplied ipAddress and stores the x-forwarded-for value (AC-004)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, '10.0.0.1, 203.0.113.77'));
      await expect(
        caller.accept({
          termsVersion: TERMS_V1,
          route: '/terms',
          ipAddress: '198.51.100.99',
        } as any)
      ).resolves.toMatchObject({ accepted: true });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.ipAddress).toBe('203.0.113.77');
      expect(upsertArgs.create.ipAddress).not.toBe('198.51.100.99');
    });

    it('stores null ipAddress, not the client value, when the header is absent (AC-004)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, undefined));
      await caller.accept({
        termsVersion: TERMS_V1,
        route: '/terms',
        ipAddress: '198.51.100.99',
      } as any);

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.ipAddress).toBeNull();
    });

    it('ignores a client-supplied userId and uses the session user in where and create (AC-005)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1));
      await expect(
        caller.accept({
          termsVersion: TERMS_V1,
          route: '/terms',
          userId: 'user-attacker',
        } as any)
      ).resolves.toMatchObject({ accepted: true });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.userId).toBe(USER_1);
      expect(upsertArgs.where.tenantId_userId_termsVersion.userId).toBe(USER_1);
      expect(JSON.stringify(upsertArgs)).not.toContain('user-attacker');
    });

    it('ignores a client-supplied userAgent and stores the request header value', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, undefined, 'RealAgent/2.0'));
      await caller.accept({
        termsVersion: TERMS_V1,
        route: '/terms',
        userAgent: 'SpoofedAgent/9.9',
      } as any);

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.userAgent).toBe('RealAgent/2.0');
    });

    it('truncates an overlong user-agent header to the 512-char column limit', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, undefined, 'a'.repeat(600)));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.userAgent).toHaveLength(512);
    });

    it('stores null userAgent and ipAddress when the request carries no headers of interest', async () => {
      const ctx = makeCtx(TENANT_A, USER_1);
      ctx.req.headers.get = vi.fn(() => null);
      const caller = await createCaller(ctx);
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.userAgent).toBeNull();
      expect(upsertArgs.create.ipAddress).toBeNull();
    });

    it('stores null ip and user-agent when the context has no request at all', async () => {
      const ctx = { ...makeCtx(TENANT_A, USER_1), req: undefined } as any;
      const caller = await createCaller(ctx);
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.ipAddress).toBeNull();
      expect(upsertArgs.create.userAgent).toBeNull();
    });

    it('stores a valid IPv6 address from x-forwarded-for', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1, '10.0.0.1, 2001:db8::1'));
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.create.ipAddress).toBe('2001:db8::1');
    });

    it('rejects input without a termsVersion or with an overlong route', async () => {
      const caller = await createCaller(makeCtx());
      await expect(caller.accept({ route: '/terms' } as any)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
      });
      await expect(
        caller.accept({ termsVersion: TERMS_V1, route: 'r'.repeat(256) })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(mockPrisma.termsAcceptance.upsert).not.toHaveBeenCalled();
    });

    it('NEGATIVE: unauthenticated call (no ctx.user) throws UNAUTHORIZED and persists nothing (AC-007)', async () => {
      const ctx = { ...makeCtx(), user: null } as any;
      const caller = await createCaller(ctx);

      await expect(
        caller.accept({ termsVersion: TERMS_V1, route: '/terms' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mockPrisma.termsAcceptance.upsert).not.toHaveBeenCalled();
    });

    it('NEGATIVE: a session without a tenantId throws UNAUTHORIZED and persists nothing', async () => {
      const ctx = makeCtx();
      (ctx.user as any).tenantId = undefined;
      const caller = await createCaller(ctx);

      await expect(
        caller.accept({ termsVersion: TERMS_V1, route: '/terms' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mockPrisma.termsAcceptance.upsert).not.toHaveBeenCalled();
    });

    it('upsert where clause uses the @@unique composite key', async () => {
      const caller = await createCaller(makeCtx());
      await caller.accept({ termsVersion: TERMS_V1, route: '/terms' });

      const upsertArgs = mockPrisma.termsAcceptance.upsert.mock.calls[0]![0];
      expect(upsertArgs.where).toEqual({
        tenantId_userId_termsVersion: {
          tenantId: TENANT_A,
          userId: USER_1,
          termsVersion: TERMS_V1,
        },
      });
    });
  });

  // -------------------------------------------------------------------------
  // getAcceptance query
  // -------------------------------------------------------------------------
  describe('getAcceptance query', () => {
    it('returns { accepted: true, acceptedAt } for an existing record (AC-006)', async () => {
      mockPrisma.termsAcceptance.findFirst.mockResolvedValue({
        acceptedAt: mockUpsertRecord.acceptedAt,
      });
      const caller = await createCaller(makeCtx());
      const result = await caller.getAcceptance({ termsVersion: TERMS_V1 });

      expect(result.accepted).toBe(true);
      expect(result.acceptedAt).toEqual(mockUpsertRecord.acceptedAt);
    });

    it('returns { accepted: false, acceptedAt: null } for non-existent record (AC-006)', async () => {
      mockPrisma.termsAcceptance.findFirst.mockResolvedValue(null);
      const caller = await createCaller(makeCtx());
      const result = await caller.getAcceptance({ termsVersion: TERMS_V1 });

      expect(result.accepted).toBe(false);
      expect(result.acceptedAt).toBeNull();
    });

    it('NEGATIVE: cross-tenant isolation — tenantId-B ctx gets false even if user accepted under tenantId-A (NF-002)', async () => {
      // First, simulate user accepting under TENANT_A
      mockPrisma.termsAcceptance.findFirst.mockResolvedValue(null); // no record for TENANT_B

      // Query from TENANT_B context for the same userId
      const callerB = await createCaller(makeCtx(TENANT_B, USER_1));
      const result = await callerB.getAcceptance({ termsVersion: TERMS_V1 });

      expect(result.accepted).toBe(false);
      // Confirm findFirst was called with TENANT_B, not TENANT_A (isolation)
      const findArgs = mockPrisma.termsAcceptance.findFirst.mock.calls[0]![0];
      expect(findArgs.where.tenantId).toBe(TENANT_B);
      expect(findArgs.where.userId).toBe(USER_1);
    });

    it('NEGATIVE: unauthenticated getAcceptance throws UNAUTHORIZED and queries nothing (AC-007)', async () => {
      const ctx = { ...makeCtx(), user: null } as any;
      const caller = await createCaller(ctx);

      await expect(caller.getAcceptance({ termsVersion: TERMS_V1 })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
      expect(mockPrisma.termsAcceptance.findFirst).not.toHaveBeenCalled();
    });

    it('ignores a client-supplied tenantId or userId on getAcceptance (NF-002)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1));
      await caller.getAcceptance({
        termsVersion: TERMS_V1,
        tenantId: TENANT_B,
        userId: 'user-attacker',
      } as any);

      const findArgs = mockPrisma.termsAcceptance.findFirst.mock.calls[0]![0];
      expect(findArgs.where.tenantId).toBe(TENANT_A);
      expect(findArgs.where.userId).toBe(USER_1);
    });

    it('getAcceptance always filters by tenantId from session, never input (NF-002)', async () => {
      const caller = await createCaller(makeCtx(TENANT_A, USER_1));
      await caller.getAcceptance({ termsVersion: TERMS_V1 });

      const findArgs = mockPrisma.termsAcceptance.findFirst.mock.calls[0]![0];
      expect(findArgs.where.tenantId).toBe(TENANT_A);
      expect(findArgs.where.userId).toBe(USER_1);
    });
  });

  // -------------------------------------------------------------------------
  // Immutability / No update / No delete (NF-005)
  // -------------------------------------------------------------------------
  describe('router exports only accept and getAcceptance (NF-005)', () => {
    it('does not export update, delete, or remove procedures', async () => {
      const mod = (await import('../terms-acceptance.router.js')) as any;
      const { termsAcceptanceRouter } = mod;

      const procedureKeys = Object.keys(termsAcceptanceRouter._def.procedures);
      expect(procedureKeys).toContain('accept');
      expect(procedureKeys).toContain('getAcceptance');
      expect(procedureKeys).not.toContain('update');
      expect(procedureKeys).not.toContain('delete');
      expect(procedureKeys).not.toContain('remove');
    });
  });

  // -------------------------------------------------------------------------
  // Procedure type: plain tenantProcedure (AC-007)
  // -------------------------------------------------------------------------
  describe('uses plain tenantProcedure — not moduleTenantProcedure (AC-007)', () => {
    it('does not import or call moduleTenantProcedure in the router file', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const routerFile = path.join(__dirname, '..', 'terms-acceptance.router.ts');
      const content = fs.readFileSync(routerFile, 'utf8');
      // Only check import/call lines — comments may mention it to explain the design decision.
      const codeLines = content
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'));
      expect(codeLines.join('\n')).not.toMatch(/moduleTenantProcedure/);
    });
  });
});
