/**
 * #890: cases.create must not link a case to another tenant's account or user. The
 * foreign keys reference bare ids, so the router checks both against the caller's
 * tenant (approved agent actions create cases through this procedure too).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';
import { casesRouter } from '../cases.router';

const CLIENT = 'cmclient00000000001';
const ASSIGNEE = TEST_UUIDS.user2;

function caller() {
  return casesRouter.createCaller(createTestContext());
}

const input = {
  title: 'Contract review',
  clientId: CLIENT,
  assignedTo: ASSIGNEE,
  priority: 'MEDIUM' as const,
};

beforeEach(() => {
  (prismaMock.account.findFirst as any).mockReset();
  (prismaMock.user.findFirst as any).mockReset();
  (prismaMock.case.create as any).mockReset();
});

describe('cases.create tenant ownership (#890)', () => {
  it('refuses a client account that is not in the tenant, with no write', async () => {
    (prismaMock.account.findFirst as any).mockResolvedValue(null);
    (prismaMock.user.findFirst as any).mockResolvedValue({ id: ASSIGNEE });

    await expect(caller().create(input)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Client account not found',
    });
    expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
      where: { id: CLIENT, tenantId: TEST_UUIDS.tenant },
      select: { id: true },
    });
    expect(prismaMock.case.create).not.toHaveBeenCalled();
  });

  it('refuses an assignee who is not a user of the tenant, with no write', async () => {
    (prismaMock.account.findFirst as any).mockResolvedValue({ id: CLIENT });
    (prismaMock.user.findFirst as any).mockResolvedValue(null);

    await expect(caller().create(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The assignee must be a user of this workspace.',
    });
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ASSIGNEE }),
        select: { id: true },
      })
    );
    expect(prismaMock.case.create).not.toHaveBeenCalled();
  });

  it('creates the case when both belong to the tenant', async () => {
    (prismaMock.account.findFirst as any).mockResolvedValue({ id: CLIENT });
    (prismaMock.user.findFirst as any).mockResolvedValue({ id: ASSIGNEE });
    (prismaMock.case.create as any).mockResolvedValue({
      id: 'case-1',
      title: input.title,
      description: null,
      status: 'OPEN',
      priority: 'MEDIUM',
      deadline: null,
      clientId: CLIENT,
      assignedTo: ASSIGNEE,
      tenantId: TEST_UUIDS.tenant,
      tasks: [],
      client: { id: CLIENT, name: 'Acme' },
      assignee: { id: ASSIGNEE, name: 'Ada', email: 'ada@example.invalid', avatarUrl: null },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await caller()
      .create(input)
      .catch(() => undefined);

    expect(prismaMock.case.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: CLIENT,
          assignedTo: ASSIGNEE,
          tenantId: TEST_UUIDS.tenant,
        }),
      })
    );
  });
});
