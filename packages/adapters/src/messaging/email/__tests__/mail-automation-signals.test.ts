/** MVP-011 (register #57): the header facts the enquiry guard reads, from Graph and Gmail headers. */
import { describe, expect, it } from 'vitest';
import { headerLookup, readAutomationSignals } from '../mail-automation-signals';
import { initialDeltaUrl, toSyncedMessage } from '../graph-mail-delta';

describe('readAutomationSignals', () => {
  it('collects the automation headers, case-insensitively, and the media type alone', () => {
    const get = headerLookup([
      { name: 'auto-submitted', value: ' auto-replied ' },
      { name: 'List-ID', value: '<l.example.invalid>' },
      { name: 'List-Unsubscribe', value: '<mailto:u@example.invalid>' },
      { name: 'Precedence', value: 'bulk' },
      { name: 'Content-Type', value: 'Multipart/Report; report-type=delivery-status; boundary=x' },
      { name: 'In-Reply-To', value: '<a@x.invalid>' },
      { name: 'References', value: '<a@x.invalid>' },
    ]);
    expect(readAutomationSignals(get)).toEqual({
      autoSubmitted: 'auto-replied',
      listId: true,
      listUnsubscribe: true,
      precedence: 'bulk',
      contentType: 'multipart/report',
      inReplyTo: '<a@x.invalid>',
      references: '<a@x.invalid>',
    });
  });

  it('returns nothing for a mail without them', () => {
    expect(readAutomationSignals(headerLookup([{ name: 'Subject', value: 'Hi' }]))).toEqual({});
    expect(readAutomationSignals(headerLookup(null))).toEqual({});
  });
});

describe('Graph messages carry their signals', () => {
  it('reads internetMessageHeaders into signals', () => {
    const synced = toSyncedMessage(
      {
        id: 'm1',
        receivedDateTime: '2026-11-15T10:00:00Z',
        internetMessageHeaders: [{ name: 'Auto-Submitted', value: 'auto-generated' }],
      },
      100
    );
    expect(synced?.signals).toEqual({ autoSubmitted: 'auto-generated' });
  });
});

describe('the Graph delta request', () => {
  it('asks for the message headers the guard reads', () => {
    const url = decodeURIComponent(initialDeltaUrl('inbox', 30, new Date('2026-11-15T10:00:00Z')));
    expect(url).toContain('internetMessageHeaders');
  });
});
