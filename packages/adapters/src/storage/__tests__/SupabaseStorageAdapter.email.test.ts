import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => {
  const bucketApi = {
    upload: vi.fn(),
    download: vi.fn(),
    createSignedUrl: vi.fn(),
    remove: vi.fn(),
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
    // The storage URL is normalised after it is built: encoded traversal must not pass.
    for (const path of ['tenant-a/%2e%2e/tenant-b/x.pdf', 'tenant-a/..\\tenant-b\\x.pdf']) {
      await expect(adapter.downloadEmailAttachment('tenant-a', path)).rejects.toThrow(
        /outside the tenant/
      );
      await expect(adapter.emailAttachmentDownloadUrl('tenant-a', path, 300)).rejects.toThrow(
        /outside the tenant/
      );
    }
    expect(storageMock.bucketApi.download).toHaveBeenCalledTimes(1);
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

describe('SupabaseStorageAdapter — deleting an erased person’s objects (IFC-316)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.bucketApi.remove.mockResolvedValue({ data: [], error: null });
  });
  const adapter = () => new SupabaseStorageAdapter('http://localhost:54321', 'k');

  it('deletes in one call per bucket, only inside the tenant prefix and only from the email bucket', async () => {
    const result = await adapter().deleteStoredObjects('tenant-a', [
      { id: '1', bucket: 'email-attachments', path: 'tenant-a/1-a.pdf' },
      { id: '2', bucket: 'email-attachments', path: 'tenant-a/b.png' },
      { id: '3', bucket: 'email-attachments', path: 'tenant-a/c.png' },
    ]);
    expect(result).toEqual({ failed: [] });
    expect(storageMock.from).toHaveBeenCalledWith('email-attachments');
    expect(storageMock.bucketApi.remove).toHaveBeenCalledTimes(1);
    expect(storageMock.bucketApi.remove).toHaveBeenCalledWith([
      'tenant-a/1-a.pdf',
      'tenant-a/b.png',
      'tenant-a/c.png',
    ]);
  });

  it('refuses, and never sends to storage, a path outside the tenant, a traversal or a foreign bucket', async () => {
    const result = await adapter().deleteStoredObjects('tenant-a', [
      { id: '1', bucket: 'email-attachments', path: 'tenant-b/x.pdf' },
      { id: '2', bucket: 'email-attachments', path: 'tenant-a/../tenant-b/x.pdf' },
      { id: '3', bucket: 'email-attachments', path: 'tenant-a/%2e%2e/x.pdf' },
      { id: '4', bucket: 'case-documents', path: 'tenant-a/x.pdf' },
      // A bucket that no CRM upload path writes to is not ours either.
      { id: '6', bucket: 'crm-files', path: 'tenant-a/x.pdf' },
      { id: '5', bucket: 'email-attachments', path: 'tenant-a' },
    ]);
    expect(result.failed).toEqual(
      ['1', '2', '3', '4', '6', '5'].map((id) => ({ id, code: 'REFUSED' }))
    );
    expect(storageMock.bucketApi.remove).not.toHaveBeenCalled();
  });

  it('refuses the bad object only; the good ones in the same call are still deleted', async () => {
    const result = await adapter().deleteStoredObjects('tenant-a', [
      { id: '1', bucket: 'email-attachments', path: 'tenant-a/ok.pdf' },
      { id: '2', bucket: 'email-attachments', path: 'tenant-b/no.pdf' },
    ]);
    expect(result.failed).toEqual([{ id: '2', code: 'REFUSED' }]);
    expect(storageMock.bucketApi.remove).toHaveBeenCalledWith(['tenant-a/ok.pdf']);
  });

  it('returns a storage failure instead of throwing, whether it is an error or an exception', async () => {
    storageMock.bucketApi.remove.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    const objects = [{ id: '1', bucket: 'email-attachments', path: 'tenant-a/a.pdf' }];
    expect(await adapter().deleteStoredObjects('tenant-a', objects)).toEqual({
      failed: [{ id: '1', code: 'STORAGE_ERROR' }],
    });
    storageMock.bucketApi.remove.mockRejectedValueOnce(new Error('network'));
    expect(await adapter().deleteStoredObjects('tenant-a', objects)).toEqual({
      failed: [{ id: '1', code: 'STORAGE_ERROR' }],
    });
  });

  it('does nothing for an empty list', async () => {
    expect(await adapter().deleteStoredObjects('tenant-a', [])).toEqual({ failed: [] });
    expect(storageMock.from).not.toHaveBeenCalled();
  });
});
