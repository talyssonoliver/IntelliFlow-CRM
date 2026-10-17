import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageAdapter } from '../InMemoryStorageAdapter';

describe('InMemoryStorageAdapter (StorageServicePort double)', () => {
  let storage: InMemoryStorageAdapter;
  const body = Buffer.from('%PDF-1.4 test');

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
  });

  it('keys quarantine uploads by tenant and sanitises the filename', async () => {
    const key = await storage.uploadToQuarantine(body, '../evil name.pdf', 'tenant-a');
    expect(key.startsWith('tenant-a/')).toBe(true);
    expect(key).toContain('.._evil_name.pdf');
    expect(key).not.toContain(' ');
  });

  it('gives distinct keys to two uploads of the same file', async () => {
    const a = await storage.uploadToQuarantine(body, 'a.pdf', 't');
    const b = await storage.uploadToQuarantine(body, 'a.pdf', 't');
    expect(a).not.toBe(b);
  });

  it('moves quarantine to primary: readable there, gone from quarantine', async () => {
    const q = await storage.uploadToQuarantine(body, 'a.pdf', 't');
    const finalKey = await storage.moveToPrimary(q, 't/hash');
    expect(finalKey).toBe('t/hash');
    expect(await storage.download('t/hash')).toEqual(body);
    expect(storage.quarantineKeys()).toEqual([]);
    expect(storage.primaryKeys()).toEqual(['t/hash']);
  });

  it('does not alias caller buffers', async () => {
    const input = Buffer.from('abc');
    const q = await storage.uploadToQuarantine(input, 'a.txt', 't');
    input[0] = 0;
    await storage.moveToPrimary(q, 'k');
    expect((await storage.download('k')).toString()).toBe('abc');
  });

  it('rejects moving a key that is not in quarantine', async () => {
    await expect(storage.moveToPrimary('t/missing', 'k')).rejects.toThrow(/quarantine/);
    expect(storage.primaryKeys()).toEqual([]);
  });

  it('does not serve quarantined objects from download', async () => {
    const q = await storage.uploadToQuarantine(body, 'a.pdf', 't');
    await expect(storage.download(q)).rejects.toThrow(/not found/);
  });

  it('deletes from quarantine and tolerates a missing key', async () => {
    const q = await storage.uploadToQuarantine(body, 'a.pdf', 't');
    await storage.deleteFromQuarantine(q);
    expect(storage.quarantineKeys()).toEqual([]);
    await expect(storage.deleteFromQuarantine(q)).resolves.toBeUndefined();
  });

  it('signs URLs only for primary objects, on a non-resolvable host', async () => {
    const q = await storage.uploadToQuarantine(body, 'a.pdf', 't');
    await expect(storage.getSignedUrl(q, 60)).rejects.toThrow(/not found/);
    await storage.moveToPrimary(q, 't/hash');
    const url = new URL(await storage.getSignedUrl('t/hash', 60));
    expect(url.hostname.endsWith('.invalid')).toBe(true);
    expect(url.searchParams.get('expiresIn')).toBe('60');
  });

  it('injects failures for exactly N calls and then recovers', async () => {
    storage.failNext('uploadToQuarantine', 2);
    await expect(storage.uploadToQuarantine(body, 'a.pdf', 't')).rejects.toThrow(/Injected/);
    await expect(storage.uploadToQuarantine(body, 'a.pdf', 't')).rejects.toThrow(/Injected/);
    await expect(storage.uploadToQuarantine(body, 'a.pdf', 't')).resolves.toContain('t/');
    expect(storage.callCount('uploadToQuarantine')).toBe(3);
    expect(storage.quarantineKeys()).toHaveLength(1);
  });

  it('reset clears objects, failures and counters', async () => {
    await storage.uploadToQuarantine(body, 'a.pdf', 't');
    storage.failNext('download');
    storage.reset();
    expect(storage.quarantineKeys()).toEqual([]);
    expect(storage.callCount('uploadToQuarantine')).toBe(0);
    const q = await storage.uploadToQuarantine(body, 'a.pdf', 't');
    await storage.moveToPrimary(q, 'k');
    await expect(storage.download('k')).resolves.toEqual(body);
  });
});
