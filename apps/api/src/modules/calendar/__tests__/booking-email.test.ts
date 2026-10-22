/**
 * PG-203 — booking emails (runner R4, owner Q6): fixed templates, every value
 * escaped, admin-authored subjects with line breaks stripped, no free-text
 * answers echoed to the (unverified) booker address.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildBookerConfirmation,
  buildHostNotification,
  formatBookingTime,
  sendBookingEmails,
  type BookingEmailDetails,
} from '../booking-email';

function details(overrides: Partial<BookingEmailDetails> = {}): BookingEmailDetails {
  return {
    firmName: 'Smith & Co Law',
    eventName: 'Initial consultation',
    startsAt: new Date('2026-11-02T10:00:00Z'),
    endsAt: new Date('2026-11-02T10:30:00Z'),
    timezone: 'Europe/London',
    locationType: 'VIDEO',
    locationDetails: 'https://meet.example.invalid/smith',
    bookerName: 'Ada <script>alert(1)</script> Lovelace',
    bookerEmail: 'ada@example.invalid',
    answers: { phone: '+44 20 7946 0000', company: 'Analytical & Co', notes: '<b>urgent</b>' },
    hostEmail: 'host@firm.example.invalid',
    matchedExistingRecord: false,
    ...overrides,
  };
}

describe('formatBookingTime', () => {
  it('formats the range in the firm timezone and names the zone', () => {
    expect(formatBookingTime(details())).toBe(
      'Monday 2 November 2026, 10:00–10:30 (Europe/London)'
    );
    expect(formatBookingTime(details({ timezone: 'America/New_York' }))).toBe(
      'Monday 2 November 2026, 05:00–05:30 (America/New_York)'
    );
  });
});

describe('buildBookerConfirmation', () => {
  it('goes to the booker with the host as reply-to and a fixed subject', () => {
    const mail = buildBookerConfirmation(details());
    expect(mail.to).toEqual(['ada@example.invalid']);
    expect(mail.replyTo).toBe('host@firm.example.invalid');
    expect(mail.subject).toBe('Booking confirmed: Initial consultation');
    expect(mail.cc).toBeUndefined();
  });

  it('carries no visitor-typed text: neither the name nor the free-text answers', () => {
    const mail = buildBookerConfirmation(
      details({ bookerName: 'Your account is locked, reset it at evil.example.invalid' })
    );
    expect(mail.textBody!.split('\n')[0]).toBe('Hello,');
    expect(mail.htmlBody).toContain('<p>Hello,</p>');
    expect(mail.htmlBody).toContain('Smith &amp; Co Law');
    for (const body of [mail.htmlBody!, mail.textBody!]) {
      expect(body).not.toContain('evil.example.invalid');
      expect(body).not.toContain('urgent');
      expect(body).not.toContain('Analytical');
      expect(body).not.toContain('7946');
    }
    expect(mail.textBody).toContain('Monday 2 November 2026, 10:00–10:30 (Europe/London)');
    expect(mail.textBody).toMatch(/to change or cancel this booking, contact Smith & Co Law/i);
  });

  it('strips line breaks from an admin-authored event name in the subject', () => {
    const mail = buildBookerConfirmation(
      details({ eventName: 'Intro\r\nBcc: victim@example.invalid' })
    );
    expect(mail.subject).toBe('Booking confirmed: Intro Bcc: victim@example.invalid');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('renders the location by type: https video link, address, phone and custom text', () => {
    expect(buildBookerConfirmation(details()).htmlBody).toContain(
      '<a href="https://meet.example.invalid/smith">https://meet.example.invalid/smith</a>'
    );
    const inPerson = buildBookerConfirmation(
      details({ locationType: 'IN_PERSON', locationDetails: '1 <High> St' })
    );
    expect(inPerson.htmlBody).toContain('1 &lt;High&gt; St');
    const phone = buildBookerConfirmation(
      details({ locationType: 'PHONE', locationDetails: null })
    );
    expect(phone.textBody).toMatch(/phone/i);
    const custom = buildBookerConfirmation(
      details({ locationType: 'CUSTOM', locationDetails: 'Teams' })
    );
    expect(custom.textBody).toContain('Teams');
  });

  it('never renders a non-https video link as a link', () => {
    const mail = buildBookerConfirmation(details({ locationDetails: 'javascript:alert(1)' }));
    expect(mail.htmlBody).not.toContain('href="javascript');
    expect(mail.htmlBody).toContain('javascript:alert(1)');
  });
});

describe('buildHostNotification', () => {
  it("goes to the host's stored email with a fixed subject and escaped answers", () => {
    const mail = buildHostNotification(details());
    expect(mail.to).toEqual(['host@firm.example.invalid']);
    expect(mail.subject).toBe('New booking: Initial consultation');
    expect(mail.replyTo).toBeUndefined();
    expect(mail.htmlBody).toContain('&lt;b&gt;urgent&lt;/b&gt;');
    expect(mail.htmlBody).toContain('Analytical &amp; Co');
    expect(mail.htmlBody).not.toContain('<b>urgent</b>');
    expect(mail.textBody).toContain('ada@example.invalid');
    expect(mail.textBody).toMatch(/not been verified/i);
    expect(mail.textBody).not.toMatch(/matches an existing record/i);
  });

  it('flags a booker whose email matches an existing record', () => {
    const mail = buildHostNotification(details({ matchedExistingRecord: true }));
    expect(mail.textBody).toMatch(/matches an existing record/i);
    expect(mail.htmlBody).toMatch(/matches an existing record/i);
  });

  it('omits answer rows the booker did not give', () => {
    const mail = buildHostNotification(details({ answers: {} }));
    expect(mail.textBody).not.toMatch(/Phone:|Company:|Notes:/);
  });
});

describe('sendBookingEmails', () => {
  it('sends both emails', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ isFailure: false, isSuccess: true });
    await sendBookingEmails({ sendEmail }, details());
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail.mock.calls.map(([m]) => m.to[0])).toEqual([
      'ada@example.invalid',
      'host@firm.example.invalid',
    ]);
  });

  it('never throws on a failed or throwing send, and logs without PII', async () => {
    const sendEmail = vi
      .fn()
      .mockResolvedValueOnce({ isFailure: true, isSuccess: false, error: new Error('rejected') })
      .mockRejectedValueOnce(new Error('network'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(sendBookingEmails({ sendEmail }, details())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('ada@example.invalid');
    expect(logged).not.toContain('host@firm.example.invalid');
    warn.mockRestore();
  });
});

describe('host notification hardening (security review F4/F5)', () => {
  it('quotes multi-line notes and strips breaks from single-line answers and the name', () => {
    const mail = buildHostNotification(
      details({
        bookerName: 'Ada\nEmail: ceo@firm.example.invalid (verified)',
        answers: {
          phone: '+44 20 7946 0000\nCompany: Fake',
          company: 'Acme',
          notes: 'line one\nEmail: boss@firm.example.invalid (verified)',
        },
      })
    );
    const lines = mail.textBody!.split('\n');
    expect(lines).not.toContain('Email: ceo@firm.example.invalid (verified)');
    expect(lines).not.toContain('Email: boss@firm.example.invalid (verified)');
    expect(lines).toContain('> Email: boss@firm.example.invalid (verified)');
    expect(lines.some((l) => l.startsWith('Phone: ') && l.includes('Company: Fake'))).toBe(true);
  });

  it('treats Unicode line separators like newlines (codex)', () => {
    const spoof = 'Email: boss@firm.example.invalid (verified)';
    const mail = buildHostNotification(
      details({
        bookerName: `Ada\u2028${spoof}`,
        answers: { phone: `+44 20 7946 0000\u2029${spoof}`, notes: `one\u2028${spoof}` },
      })
    );
    const lines = mail.textBody!.split(/\r\n|[\n\r\u0085\u2028\u2029]/);
    expect(lines).not.toContain(spoof);
    expect(lines).toContain(`> ${spoof}`);
  });

  it('tells the host when the booking was linked to an earlier booking lead, or no lead was made', () => {
    const linked = buildHostNotification(details({ linkedEarlierBookingLead: true }));
    expect(linked.textBody).toContain('linked to the lead an earlier public booking created');
    const failed = buildHostNotification(details({ leadNotCreated: true }));
    expect(failed.htmlBody).toContain('A lead could not be created for this booker automatically');
  });
});
