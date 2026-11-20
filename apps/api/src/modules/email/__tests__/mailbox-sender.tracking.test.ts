/**
 * dispatchUserMail and open/click tracking (register row 41): the HTML handed to the mailbox carries a pixel
 * and rewritten links only for the settings that are on, and is exactly what the user wrote otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';
import { smtpAccountFields, smtpEndpointFields } from '@intelliflow/validators';

const quota = vi.hoisted(() => ({ release: vi.fn(), reserveQuota: vi.fn() }));
vi.mock('../../../shared/quota-guard', () => ({ reserveQuota: quota.reserveQuota }));

const transport = vi.hoisted(() => ({ send: vi.fn(), claim: vi.fn() }));
vi.mock('../mailbox-transport', () => ({
  sendThroughMailbox: transport.send,
  claimSendSlot: transport.claim,
}));

vi.mock('../../../security/audit-logger', () => ({
  getAuditLogger: () => ({ logAction: vi.fn().mockResolvedValue('audit-1') }),
}));

import { dispatchUserMail } from '../mailbox-sender';

const NOW = new Date(Date.UTC(2026, 9, 20, 12));
const mailbox = {
  id: 'mb-own',
  tenantId: TEST_UUIDS.tenant,
  scope: 'USER',
  userId: TEST_UUIDS.user1,
  kind: 'SMTP',
  status: 'ACTIVE',
  fromAddress: 'me@mail.example.com',
  fromName: 'Me',
  ...smtpEndpointFields('smtp.mail.example.com', 587, 'STARTTLS'),
  ...smtpAccountFields('me@mail.example.com', 'x'.repeat(20)),
  refreshToken: null,
  tokenVersion: 0,
};
const HTML = '<p>Hi <a href="https://shop.example.invalid/a">shop</a></p>';
const input = { to: ['a@example.invalid'], subject: 'Hello', htmlBody: HTML };
const deps = () => ({
  transports: {} as never,
  storage: { downloadEmailAttachment: vi.fn() },
  now: () => NOW,
});

function settings(trackOpens: boolean, trackClicks: boolean) {
  (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue({
    tenantId: TEST_UUIDS.tenant,
    trackOpens,
    trackClicks,
  });
}

/** The html the mailbox was asked to send. */
const sentHtml = (): string => transport.send.mock.calls[0]![6].html;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('API_PUBLIC_URL', 'https://api.example.invalid');
  quota.reserveQuota.mockResolvedValue(quota.release);
  transport.claim.mockResolvedValue(undefined);
  transport.send.mockResolvedValue({ provider: 'SMTP', providerMessageId: '<s@x>', rejected: [] });
  (prismaMock.emailMailbox.findMany as any).mockResolvedValue([mailbox]);
  (prismaMock.emailSuppression.findMany as any).mockResolvedValue([]);
  (prismaMock.emailRecord.create as any).mockImplementation(async ({ data }: any) => ({
    id: 'rec' + 'ord1234567890abcdefgh',
    ...data,
  }));
  (prismaMock.emailRecord.update as any).mockResolvedValue({});
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('dispatchUserMail tracking', () => {
  it('sends the html exactly as written when both settings are off', async () => {
    settings(false, false);
    await dispatchUserMail(createTestContext() as never, input, deps());
    expect(sentHtml()).toBe(HTML);
    // What is stored as the sent body is what the user wrote.
    expect((prismaMock.emailRecord.create as any).mock.calls[0][0].data.body).toBe(HTML);
  });

  it('sends the html as written when the settings row does not exist (the default is off)', async () => {
    (prismaMock.tenantEmailSettings.findUnique as any).mockResolvedValue(null);
    await dispatchUserMail(createTestContext() as never, input, deps());
    expect(sentHtml()).toBe(HTML);
  });

  it('adds the pixel, named after the stored record, when opens are on', async () => {
    settings(true, false);
    await dispatchUserMail(createTestContext() as never, input, deps());
    expect(sentHtml()).toContain('https://api.example.invalid/t/o/record1234567890abcdefgh/');
    expect(sentHtml()).toContain('href="https://shop.example.invalid/a"');
  });

  it('rewrites links, and adds no pixel, when only clicks are on', async () => {
    settings(false, true);
    await dispatchUserMail(createTestContext() as never, input, deps());
    expect(sentHtml()).toContain('https://api.example.invalid/t/c/record1234567890abcdefgh/');
    expect(sentHtml()).not.toContain('<img');
  });

  it('still sends, untracked, when the public api address is not configured', async () => {
    vi.stubEnv('API_PUBLIC_URL', '');
    settings(true, true);
    const result = await dispatchUserMail(createTestContext() as never, input, deps());
    expect(result.status).toBe('SENT');
    expect(sentHtml()).toBe(HTML);
  });
});
