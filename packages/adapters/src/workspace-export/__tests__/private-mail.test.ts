/**
 * Personal mail is private (owner decision 26/11/2026, no admin override): the export carries only
 * mail the whole team may read, the attachment rows of exactly that mail, and only its files.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkspaceExport } from '../export-workspace';
import { defaultExportFileBuckets, resolveEmailAttachmentsBucket } from '../entities';
import { makeDb, memoryFiles, readZip } from './helpers';

const T = 'tenant_a_aaaaaaaaaaaaaaaaaaaa';
const when = new Date('2026-11-01T10:00:00.000Z');

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

const mail = (id: string, over: Record<string, unknown>) => ({
  id,
  tenantId: T,
  subject: `subject ${id}`,
  body: `BODY-${id}`,
  mailboxId: null,
  userId: null,
  contactId: null,
  metadata: null,
  createdAt: when,
  ...over,
});

const att = (id: string, emailId: string) => ({
  id,
  tenantId: T,
  emailId,
  fileName: `${id}.txt`,
  fileUrl: `${T}/${id}.txt`,
  fileSize: 1,
  fileType: 'txt',
  createdAt: when,
});

function seed() {
  return makeDb({
    tenant: [
      {
        id: T,
        name: 'Alpha',
        slug: 'alpha',
        status: 'ACTIVE',
        plan: 'STARTER',
        createdAt: when,
        updatedAt: when,
      },
    ],
    contact: [
      { id: 'c1', tenantId: T },
      { id: 'c_other', tenantId: 'tenant_b' },
    ],
    lead: [{ id: 'lead_1', tenantId: T }],
    emailMailbox: [
      { id: 'mb_company', tenantId: T, scope: 'TENANT', userId: null },
      { id: 'mb_personal', tenantId: T, scope: 'USER', userId: 'u1' },
    ],
    emailRecord: [
      mail('company', { mailboxId: 'mb_company' }),
      mail('inbound_nobody', {}),
      mail('logged_contact', { mailboxId: 'mb_personal', userId: 'u1', contactId: 'c1' }),
      mail('logged_lead', {
        mailboxId: 'mb_personal',
        userId: 'u1',
        metadata: { leadId: 'lead_1' },
      }),
      // Logged to a lead or contact that no longer exists: the link is dangling, the mail is
      // private again (the in-app policy hides it from everyone but its owner).
      mail('dangling_contact', { mailboxId: 'mb_personal', userId: 'u1', contactId: 'deleted_c' }),
      mail('dangling_lead', {
        mailboxId: 'mb_personal',
        userId: 'u1',
        metadata: { leadId: 'deleted_lead' },
      }),
      // A contact of another workspace is no link of this one.
      mail('foreign_contact', { mailboxId: 'mb_personal', userId: 'u1', contactId: 'c_other' }),
      mail('personal', { mailboxId: 'mb_personal', userId: 'u1' }),
      mail('personal_owner_in_metadata', { metadata: { mailboxOwnerId: 'u1' } }),
      mail('composed_in_crm', { userId: 'u1' }),
      mail('draft_company', { mailboxId: 'mb_company', metadata: { isDraft: true } }),
      mail('draft_logged', {
        mailboxId: 'mb_personal',
        userId: 'u1',
        contactId: 'c1',
        metadata: { isDraft: true },
      }),
      mail('other_tenant', { tenantId: 'tenant_b', mailboxId: 'mb_company' }),
    ],
    emailAttachment: [
      att('a_company', 'company'),
      att('a_logged', 'logged_contact'),
      att('a_personal', 'personal'),
      att('a_draft', 'draft_company'),
      att('a_dangling', 'dangling_contact'),
    ],
  });
}

const EXPORTED = ['company', 'inbound_nobody', 'logged_contact', 'logged_lead'];

describe('private mail stays out of the workspace export', () => {
  it('exports only company, ownerless and logged mail, never personal mail or drafts', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-m-'));
    const out = join(dir, 'a.zip');
    const result = await runWorkspaceExport({ db: seed(), tenantId: T, outputPath: out });
    const zip = readZip(out);
    const ids = (JSON.parse(zip['data/emails.json']!) as Array<{ id: string }>)
      .map((r) => r.id)
      .sort();
    expect(ids).toEqual([...EXPORTED].sort());
    for (const hidden of [
      'personal',
      'dangling_contact',
      'dangling_lead',
      'foreign_contact',
      'personal_owner_in_metadata',
      'composed_in_crm',
      'draft_company',
      'draft_logged',
    ]) {
      expect(zip['data/emails.csv'], hidden).not.toContain(`BODY-${hidden}`);
      expect(zip['data/emails.json'], hidden).not.toContain(`BODY-${hidden}`);
    }
    expect(zip['data/emails.csv']).not.toContain('BODY-other_tenant');
    expect(result.rowCounts.emails).toBe(EXPORTED.length);
  });

  it('exports only the attachment rows of the exported mail', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-m-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: T, outputPath: out });
    const rows = JSON.parse(readZip(out)['data/email_attachments.json']!) as Array<{
      id: string;
    }>;
    expect(rows.map((r) => r.id).sort()).toEqual(['a_company', 'a_logged']);
  });

  it('copies from the email-attachments bucket only the files of exported attachments', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-m-'));
    const out = join(dir, 'a.zip');
    const files = memoryFiles({
      'email-attachments': {
        [`${T}/a_company.txt`]: 'company file',
        [`${T}/a_logged.txt`]: 'logged file',
        [`${T}/a_personal.txt`]: 'PERSONAL-FILE',
        [`${T}/a_draft.txt`]: 'DRAFT-FILE',
        [`${T}/a_dangling.txt`]: 'DANGLING-FILE',
        [`${T}/orphan.txt`]: 'ORPHAN-FILE',
      },
      'case-documents': { [`${T}/contract.pdf`]: 'case doc' },
    });
    const result = await runWorkspaceExport({ db: seed(), tenantId: T, outputPath: out, files });
    const zip = readZip(out);
    expect(
      Object.keys(zip)
        .filter((k) => k.startsWith('files/'))
        .sort()
    ).toEqual([
      'files/case-documents/contract.pdf',
      'files/email-attachments/a_company.txt',
      'files/email-attachments/a_logged.txt',
    ]);
    expect(Object.values(zip).join('\n')).not.toMatch(
      /PERSONAL-FILE|DRAFT-FILE|ORPHAN-FILE|DANGLING-FILE/
    );
    expect(result.manifest.warnings.join(' ')).toMatch(/4 stored email attachment/);
  });

  it('says in the README that personal mail and drafts are excluded', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-m-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: T, outputPath: out });
    const readme = readZip(out)['README.txt']!;
    expect(readme).toMatch(/own mailbox and unsent drafts are private/);
    expect(readme).toMatch(/excluded/);
  });

  it('applies the filter to a renamed email-attachments bucket, whatever its name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-m-'));
    const out = join(dir, 'a.zip');
    const files = memoryFiles({
      'custom-attachments': {
        [`${T}/a_company.txt`]: 'company file',
        [`${T}/a_personal.txt`]: 'PERSONAL-FILE',
      },
      'email-attachments': { [`${T}/legacy.txt`]: 'LEGACY-FILE' },
    });
    await runWorkspaceExport({
      db: seed(),
      tenantId: T,
      outputPath: out,
      files,
      emailAttachmentsBucket: 'custom-attachments',
      buckets: ['custom-attachments'],
    });
    const zip = readZip(out);
    expect(Object.keys(zip).filter((k) => k.startsWith('files/'))).toEqual([
      'files/custom-attachments/a_company.txt',
    ]);
    expect(Object.values(zip).join(' ')).not.toContain('PERSONAL-FILE');
  });

  it('takes the bucket name from EMAIL_ATTACHMENTS_BUCKET, like the storage adapter', () => {
    expect(resolveEmailAttachmentsBucket({})).toBe('email-attachments');
    expect(resolveEmailAttachmentsBucket({ EMAIL_ATTACHMENTS_BUCKET: 'custom-attachments' })).toBe(
      'custom-attachments'
    );
    expect(defaultExportFileBuckets('custom-attachments')).toEqual([
      'custom-attachments',
      'case-documents',
    ]);
  });
});
