import { describe, expect, it } from 'vitest';
import {
  chatAttachmentLocators,
  classifyStoredLocator,
  isManagedRef,
  type StoredObjectConfig,
} from '../stored-object';

const config: StoredObjectConfig = {
  storageHost: 'abc.supabase.example.invalid',
  emailBucket: 'email-attachments',
};
const T = 'tenant-a';
const url = (bucket: string, rest: string, host = config.storageHost) =>
  `https://${host}/storage/v1/object/sign/${bucket}/${rest}?token=x`;
const UNMANAGED = { kind: 'UNMANAGED' };

describe('classifyStoredLocator (IFC-316)', () => {
  it('takes an email attachment path under the tenant in the email bucket', () => {
    expect(classifyStoredLocator('EMAIL_ATTACHMENT', `${T}/1-a.pdf`, T, config)).toEqual({
      kind: 'OBJECT',
      ref: { bucket: 'email-attachments', path: `${T}/1-a.pdf` },
    });
  });

  it('a bare path from a lead, chat or ticket file is not ours: nothing uploads those files to storage', () => {
    for (const source of ['LEAD_FILE', 'CHAT_ATTACHMENT', 'TICKET_ATTACHMENT'] as const) {
      expect(classifyStoredLocator(source, `${T}/x/b.png`, T, config)).toEqual(UNMANAGED);
    }
  });

  it("takes this project's storage URL, with the bucket named in it", () => {
    expect(
      classifyStoredLocator('CHAT_ATTACHMENT', url('email-attachments', `${T}/c.png`), T, config)
    ).toEqual({ kind: 'OBJECT', ref: { bucket: 'email-attachments', path: `${T}/c.png` } });
  });

  it('never takes another tenant, another bucket, another host or a traversal', () => {
    const lead = (v: string) => classifyStoredLocator('LEAD_FILE', v, T, config);
    // Only the email bucket exists as ours: any other bucket name is not a CRM object.
    expect(lead(url('crm-files', `${T}/a.pdf`))).toEqual(UNMANAGED);
    expect(lead('tenant-b/a.pdf')).toEqual(UNMANAGED);
    expect(lead(url('email-attachments', 'tenant-b/a.pdf'))).toEqual(UNMANAGED);
    expect(lead(url('case-documents', `${T}/a.pdf`))).toEqual(UNMANAGED);
    expect(lead(url('email-attachments', `${T}/a.pdf`, 'evil.example.invalid'))).toEqual(UNMANAGED);
    expect(lead(`${T}/../tenant-b/a.pdf`)).toEqual(UNMANAGED);
    expect(lead(`${T}/%2e%2e/a.pdf`)).toEqual(UNMANAGED);
    expect(lead(url('email-attachments', `${T}/%2e%2e/b.pdf`))).toEqual(UNMANAGED);
    // A step that collapses to a path still inside the tenant must not be read as that path.
    expect(lead(url('email-attachments', `${T}/x/%2e%2e/b.pdf`))).toEqual(UNMANAGED);
    expect(lead(url('email-attachments', `${T}/x/../b.pdf`))).toEqual(UNMANAGED);
    expect(lead(url('email-attachments', `${T}/x/%2E%2e/b.pdf`))).toEqual(UNMANAGED);
    expect(lead(url('email-attachments', `${T}/x\\b.pdf`))).toEqual(UNMANAGED);
    expect(lead(`${T}/x/./b.pdf`)).toEqual(UNMANAGED);
    expect(lead('https://files.example.invalid/a.pdf')).toEqual(UNMANAGED);
    expect(lead('not a url or path')).toEqual(UNMANAGED);
  });

  it('with no storage host every URL is unmanaged; a tenant path still works', () => {
    const bare = { ...config, storageHost: null };
    expect(
      classifyStoredLocator('LEAD_FILE', url('email-attachments', `${T}/a.pdf`), T, bare)
    ).toEqual(UNMANAGED);
    expect(classifyStoredLocator('EMAIL_ATTACHMENT', `${T}/a.pdf`, T, bare).kind).toBe('OBJECT');
  });

  it('treats blank, inline and own-route locators as no object', () => {
    const none = [null, undefined, '', '  ', 'data:image/png;base64,AAAA...'];
    for (const v of [...none, '/api/email/attachments/e1/a.pdf']) {
      expect(classifyStoredLocator('TICKET_ATTACHMENT', v, T, config)).toEqual({ kind: 'NONE' });
    }
  });
});

describe('isManagedRef', () => {
  it('is the delete guard: tenant prefix and owned bucket', () => {
    expect(isManagedRef({ bucket: 'email-attachments', path: `${T}/a` }, T, config)).toBe(true);
    expect(isManagedRef({ bucket: 'email-attachments', path: 'tenant-b/a' }, T, config)).toBe(
      false
    );
    expect(isManagedRef({ bucket: 'other', path: `${T}/a` }, T, config)).toBe(false);
    expect(isManagedRef({ bucket: 'crm-files', path: `${T}/a` }, T, config)).toBe(false);
  });
});

describe('chatAttachmentLocators', () => {
  it('reads locator fields of each attachment and ignores names', () => {
    expect(
      chatAttachmentLocators([
        { name: 'a.png', url: 'tenant-a/a.png' },
        { name: 'b.png', storagePath: 'tenant-a/b.png', fileUrl: 'https://x.example.invalid/b' },
        { name: 'c.png' },
        'tenant-a/d.png',
        'plain-name.png',
      ])
    ).toEqual([
      'tenant-a/a.png',
      'https://x.example.invalid/b',
      'tenant-a/b.png',
      'tenant-a/d.png',
    ]);
    expect(chatAttachmentLocators(null)).toEqual([]);
    expect(chatAttachmentLocators({ url: 'tenant-a/e' })).toEqual(['tenant-a/e']);
  });
});
