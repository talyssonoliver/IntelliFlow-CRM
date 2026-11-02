/**
 * PG-203 D8: the production wiring of the DSAR deadline alerts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const wiring = vi.hoisted(() => ({
  prisma: { $transaction: vi.fn() },
  sender: { sendEmail: vi.fn() },
}));

vi.mock('@intelliflow/db', () => ({ prisma: wiring.prisma }));
vi.mock('../../../container.js', () => ({
  container: { adapters: { notificationService: wiring.sender } },
}));

import { createDsarSlaDeps } from '../dsar-sla-scheduler';

const ORIGINAL_APP_URL = process.env.APP_URL;

afterEach(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL_APP_URL;
});

describe('createDsarSlaDeps', () => {
  it('uses the shared client, the container sender and APP_URL', async () => {
    process.env.APP_URL = 'https://app.example.invalid';
    const deps = await createDsarSlaDeps();
    expect(deps.sender).toBe(wiring.sender);
    expect(deps.appUrl()).toBe('https://app.example.invalid');
    expect(deps.now()).toBeInstanceOf(Date);
    expect(deps.log).toBe(console);

    wiring.prisma.$transaction.mockResolvedValue('ran');
    await expect(deps.store.withSweepLock(vi.fn())).resolves.toBe('ran');
    expect(wiring.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
