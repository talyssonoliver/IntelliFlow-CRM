// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';

// EmailMessage renders user-supplied HTML email bodies via
// `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.htmlBody) }}` —
// the runtime user-content sanitization path. Two kinds of coverage here:
//
//  1. Generic sanitization smoke tests (script/event-handler/javascript: URL
//     stripping) — these prove the sanitizer is actually WIRED into the render
//     path and removes active content. They are NOT a reproduction of any
//     specific DOMPurify advisory (a trivial <script> is stripped by every
//     release), so they alone do not prove a given CVE is patched.
//  2. A version-floor guard (last test) that fails if the resolved dompurify
//     drops below the patched override floor (>=3.4.9, GHSA-vxr8-fq34-vvx9) —
//     this is the actual regression guard for the override; a downgrade into
//     the vulnerable range fails the suite.
//
// The real isomorphic-dompurify is intentionally NOT mocked.

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

vi.mock('@/components/shared', () => ({
  EntityHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { EmailMessage } = await import('../EmailMessage');

function renderMessage(htmlBody: string) {
  return render(
    <EmailMessage
      message={{
        id: 'msg-1',
        subject: 'Test',
        htmlBody,
        from: { address: 'sender@example.com', name: 'Sender' },
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        receivedAt: '2026-02-16T10:00:00Z',
        attachments: [],
      }}
      isExpanded
      onToggle={vi.fn()}
      onReply={vi.fn()}
      onReplyAll={vi.fn()}
      onForward={vi.fn()}
    />
  );
}

// Parse "3.4.10" -> [3, 4, 10]; compare lexicographically by segment.
function isAtLeast(version: string, floor: [number, number, number]): boolean {
  const parts = version.split('.').map((n) => Number.parseInt(n, 10));
  const [vMaj, vMin, vPatch] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  const [fMaj, fMin, fPatch] = floor;
  if (vMaj !== fMaj) return vMaj > fMaj;
  if (vMin !== fMin) return vMin > fMin;
  return vPatch >= fPatch;
}

describe('EmailMessage DOMPurify sanitization', () => {
  it('renders benign HTML content from the email body', () => {
    renderMessage('<p>Hello <strong>world</strong></p>');
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('strips <script> tags from the rendered email body', () => {
    const { container } = renderMessage('<p>safe</p><script>window.__pwned = true;</script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('__pwned');
  });

  it('strips inline event-handler attributes (onerror/onclick)', () => {
    const { container } = renderMessage(
      '<img src="x" onerror="window.__pwned = true">' +
        '<div onclick="window.__pwned = true">x</div>'
    );
    expect(container.innerHTML).not.toContain('onerror');
    expect(container.innerHTML).not.toContain('onclick');
  });

  it('strips javascript: URLs from anchors regardless of scheme case', () => {
    // A mixed-case scheme (JaVaScRiPt:) executes identically in the browser, so
    // the assertion must be case-insensitive — a substring check for the literal
    // lowercase token would let a regression of the dompurify override through.
    const { container } = renderMessage(
      '<a href="javascript:window.__pwned=1">lower</a>' +
        '<a href="JaVaScRiPt:window.__pwned=1">mixed</a>'
    );
    const anchors = container.querySelectorAll('a');
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect((anchor.getAttribute('href') ?? '').toLowerCase()).not.toContain('javascript:');
    }
  });

  it('resolves a dompurify at or above the patched override floor (>=3.4.9)', () => {
    // Regression guard for the pnpm override (GHSA-vxr8-fq34-vvx9): if the
    // override is reverted/relaxed so dompurify resolves below 3.4.9, this fails.
    expect(typeof DOMPurify.version).toBe('string');
    expect(isAtLeast(DOMPurify.version, [3, 4, 9])).toBe(true);
  });
});
