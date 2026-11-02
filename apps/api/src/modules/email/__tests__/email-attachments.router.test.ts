import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, TEST_UUIDS } from '../../../test/setup';
import { emailAttachmentsRouter } from '../email-attachments.router';

const tenantId = TEST_UUIDS.tenant;
const storage = { uploadEmailAttachment: vi.fn(), downloadEmailAttachment: vi.fn() };
const caller = (over: Record<string, unknown> = {}) =>
  emailAttachmentsRouter.createCaller({
    ...createTestContext(over as never),
    adapters: { mailboxTransports: {}, storageService: storage },
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  storage.uploadEmailAttachment.mockResolvedValue(`${tenantId}/uuid-report.pdf`);
});

describe('emailAttachments.upload', () => {
  it('stores the decoded file under the caller tenant and returns its reference', async () => {
    const content = Buffer.from('pdf-bytes');
    await expect(
      caller().upload({
        fileName: 'report.pdf',
        contentType: 'application/pdf',
        contentBase64: content.toString('base64'),
      })
    ).resolves.toEqual({
      storagePath: `${tenantId}/uuid-report.pdf`,
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      size: content.length,
    });
    expect(storage.uploadEmailAttachment).toHaveBeenCalledWith(
      tenantId,
      content,
      'report.pdf',
      'application/pdf'
    );
  });

  it('refuses an executable type before storing anything', async () => {
    await expect(
      caller().upload({
        fileName: 'run.exe',
        contentType: 'application/octet-stream',
        contentBase64: 'AAAA',
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(storage.uploadEmailAttachment).not.toHaveBeenCalled();
  });

  it('maps a storage failure to a service error without the storage message', async () => {
    storage.uploadEmailAttachment.mockRejectedValue(new Error('bucket detail'));
    const error = await caller()
      .upload({ fileName: 'a.pdf', contentType: 'application/pdf', contentBase64: 'AAAA' })
      .then(
        () => {
          throw new Error('expected a rejection');
        },
        (e: unknown) => e as Error
      );
    expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(error.message).not.toContain('bucket detail');
  });

  it('requires a verified user', async () => {
    await expect(
      caller({ user: { ...createTestContext().user!, emailVerified: false } }).upload({
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        contentBase64: 'AAAA',
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
