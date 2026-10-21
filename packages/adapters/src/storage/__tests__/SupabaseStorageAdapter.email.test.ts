import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => {
  const bucketApi = {
    upload: vi.fn(),
    download: vi.fn(),
    createSignedUrl: vi.fn(),
  };
  return {
    bucketApi,
    getBucket: vi.fn(),
    createBucket: vi.fn(),
    from: vi.fn(() => bucketApi),
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ storage: storageMock })),
}));

import { SupabaseStorageAdapter } from '../SupabaseStorageAdapter';

describe('SupabaseStorageAdapter — email attachments (PG-207)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getBucket.mockResolvedValue({ data: { id: 'email-attachments' }, error: null });
    storageMock.createBucket.mockResolvedValue({ data: {}, error: null });
    storageMock.bucketApi.upload.mockImplementation(async (path: string) => ({
      data: { path },
      error: null,
    }));
    storageMock.bucketApi.download.mockResolvedValue({
      data: new Blob([Buffer.from('file-bytes')]),
      error: null,
    });
  });

  it('stores under <tenantId>/ in the private email-attachments bucket with a sanitised name', async () => {
    const adapter = new SupabaseStorageAdapter('http://localhost:54321', 'k');
    const path = await adapter.uploadEmailAttachment(
      'tenant-a',
      Buffer.from('x'),
      '../my report.pdf',
      'application/pdf'
    );
    expect(storageMock.from).toHaveBeenCalledWith('email-attachments');
    expect(path).toMatch(/^tenant-a\/[0-9a-f-]{36}-\.\._my_report\.pdf$/);
    expect(storageMock.bucketApi.upload).toHaveBeenCalledWith(path, Buffer.from('x'), {
      contentType: 'application/pdf',
      upsert: false,
    });
  });

  it('creates the bucket once, private, when it does not exist', async () => {
    storageMock.getBucket.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    const adapter = new SupabaseStorageAdapter('http://localhost:54321', 'k');
    await adapter.uploadEmailAttachment('t', Buffer.from('x'), 'a.pdf', 'application/pdf');
    await adapter.uploadEmailAttachment('t', Buffer.from('y'), 'b.pdf', 'application/pdf');
    expect(storageMock.createBucket).toHaveBeenCalledTimes(1);
    expect(storageMock.createBucket).toHaveBeenCalledWith('email-attachments', { public: false });
    expect(storageMock.getBucket).toHaveBeenCalledTimes(1);
  });

  it('honours EMAIL_ATTACHMENTS_BUCKET', async () => {
    vi.stubEnv('EMAIL_ATTACHMENTS_BUCKET', 'custom-bucket');
    const adapter = new SupabaseStorageAdapter('http://localhost:54321', 'k');
    await adapter.uploadEmailAttachment('t', Buffer.from('x'), 'a.pdf', 'application/pdf');
    expect(storageMock.from).toHaveBeenCalledWith('custom-bucket');
    vi.unstubAllEnvs();
  });

  it('downloads only paths under the caller tenant', async () => {
    const adapter = new SupabaseStorageAdapter('http://localhost:54321', 'k');
    await expect(
      adapter.downloadEmailAttachment('tenant-a', 'tenant-a/abc-a.pdf')
    ).resolves.toEqual(Buffer.from('file-bytes'));
    await expect(adapter.downloadEmailAttachment('tenant-a', 'tenant-b/abc-a.pdf')).rejects.toThrow(
      /outside the tenant/
    );
    await expect(
      adapter.downloadEmailAttachment('tenant-a', 'tenant-a/../tenant-b/x.pdf')
    ).rejects.toThrow(/outside the tenant/);
  });

  it('signs short-lived download links only for paths under the caller tenant', async () => {
    storageMock.bucketApi.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://storage.example.invalid/signed' },
      error: null,
    });
    const adapter = new SupabaseStorageAdapter('http://localhost:54321', 'k');
    await expect(
      adapter.emailAttachmentDownloadUrl('tenant-a', 'tenant-a/abc-a.pdf', 300)
    ).resolves.toBe('https://storage.example.invalid/signed');
    expect(storageMock.from).toHaveBeenCalledWith('email-attachments');
    expect(storageMock.bucketApi.createSignedUrl).toHaveBeenCalledWith('tenant-a/abc-a.pdf', 300);
    await expect(
      adapter.emailAttachmentDownloadUrl('tenant-a', 'tenant-b/abc-a.pdf', 300)
    ).rejects.toThrow(/outside the tenant/);
    storageMock.bucketApi.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: 'detail' },
    });
    await expect(
      adapter.emailAttachmentDownloadUrl('tenant-a', 'tenant-a/abc-a.pdf', 300)
    ).rejects.toThrow('Email attachment link failed');
  });

  it('surfaces storage failures without the provider message', async () => {
    storageMock.bucketApi.upload.mockResolvedValueOnce({
      data: null,
      error: { message: 'internal detail' },
    });
    const adapter = new SupabaseStorageAdapter('http://localhost:54321', 'k');
    const error = await adapter
      .uploadEmailAttachment('t', Buffer.from('x'), 'a.pdf', 'application/pdf')
      .catch((e: unknown) => e);
    expect(String((error as Error).message)).toBe('Email attachment upload failed');
    storageMock.bucketApi.download.mockResolvedValueOnce({
      data: null,
      error: { message: 'detail' },
    });
    await expect(adapter.downloadEmailAttachment('t', 't/a.pdf')).rejects.toThrow(
      'Email attachment download failed'
    );
  });
});
