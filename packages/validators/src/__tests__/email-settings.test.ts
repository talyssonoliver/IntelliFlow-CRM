import { describe, expect, it } from 'vitest';
import {
  addSuppressionInputSchema,
  removeSuppressionInputSchema,
  sendUserEmailInputSchema,
  updateEmailSettingsInputSchema,
} from '../email-settings';

describe('updateEmailSettingsInputSchema', () => {
  it('accepts a partial update', () => {
    expect(updateEmailSettingsInputSchema.parse({ trackOpens: true })).toEqual({
      trackOpens: true,
    });
  });

  it('accepts a reply-to address and clears it with null', () => {
    expect(
      updateEmailSettingsInputSchema.parse({ replyToAddress: 'Replies@Example.com' }).replyToAddress
    ).toBe('replies@example.com');
    expect(
      updateEmailSettingsInputSchema.parse({ replyToAddress: null }).replyToAddress
    ).toBeNull();
  });

  it.each([0, 11, 2.5])('rejects soft bounce threshold %s', (softBounceThreshold) => {
    expect(updateEmailSettingsInputSchema.safeParse({ softBounceThreshold }).success).toBe(false);
  });

  it('accepts the threshold bounds 1 and 10', () => {
    expect(updateEmailSettingsInputSchema.safeParse({ softBounceThreshold: 1 }).success).toBe(true);
    expect(updateEmailSettingsInputSchema.safeParse({ softBounceThreshold: 10 }).success).toBe(
      true
    );
  });

  it('rejects an unknown hard bounce action and unknown keys', () => {
    expect(updateEmailSettingsInputSchema.safeParse({ hardBounceAction: 'DELETE' }).success).toBe(
      false
    );
    expect(updateEmailSettingsInputSchema.safeParse({ tenantId: 't' }).success).toBe(false);
  });

  it('rejects a reply-to with a header injection attempt', () => {
    expect(
      updateEmailSettingsInputSchema.safeParse({
        replyToAddress: 'a@b.example\r\nBcc: c@d.example',
      }).success
    ).toBe(false);
  });
});

describe('suppression inputs', () => {
  it('normalizes the address on add', () => {
    expect(addSuppressionInputSchema.parse({ email: ' Gone@Example.COM ' })).toEqual({
      email: 'gone@example.com',
    });
  });

  it('requires an id on remove', () => {
    expect(removeSuppressionInputSchema.safeParse({ id: '' }).success).toBe(false);
    expect(removeSuppressionInputSchema.safeParse({ id: 'c' + 'x'.repeat(24) }).success).toBe(true);
  });
});

describe('sendUserEmailInputSchema', () => {
  const base = { to: ['a@example.com'], subject: 'Hello', htmlBody: '<p>Hi</p>' };

  it('accepts a minimal message', () => {
    expect(sendUserEmailInputSchema.safeParse(base).success).toBe(true);
  });

  it('rejects CR/LF in the subject and an over-long subject', () => {
    expect(
      sendUserEmailInputSchema.safeParse({ ...base, subject: 'a\r\nBcc: x@y.example' }).success
    ).toBe(false);
    expect(sendUserEmailInputSchema.safeParse({ ...base, subject: 's'.repeat(999) }).success).toBe(
      false
    );
  });

  it('rejects more than 100 recipients across to, cc and bcc', () => {
    const many = Array.from({ length: 51 }, (_, i) => `r${i}@example.com`);
    expect(sendUserEmailInputSchema.safeParse({ ...base, to: many, cc: many }).success).toBe(false);
  });

  it('rejects an html body over 2 MB', () => {
    expect(
      sendUserEmailInputSchema.safeParse({ ...base, htmlBody: 'x'.repeat(2 * 1024 * 1024 + 1) })
        .success
    ).toBe(false);
  });

  it('accepts attachments by storage path and rejects dangerous file names', () => {
    const attachment = {
      storagePath: 'tenant-1/abc-report.pdf',
      fileName: 'report.pdf',
      contentType: 'application/pdf',
      size: 1024,
    };
    expect(sendUserEmailInputSchema.safeParse({ ...base, attachments: [attachment] }).success).toBe(
      true
    );
    expect(
      sendUserEmailInputSchema.safeParse({
        ...base,
        attachments: [{ ...attachment, fileName: 'a"\r\nb.pdf' }],
      }).success
    ).toBe(false);
    expect(
      sendUserEmailInputSchema.safeParse({
        ...base,
        attachments: [{ ...attachment, storagePath: '../other-tenant/x.pdf' }],
      }).success
    ).toBe(false);
  });

  it('rejects the old fileUrl attachment shape', () => {
    expect(
      sendUserEmailInputSchema.safeParse({
        ...base,
        attachments: [{ fileName: 'a.pdf', fileSize: 1, fileUrl: 'https://example.com/a.pdf' }],
      }).success
    ).toBe(false);
  });
});
