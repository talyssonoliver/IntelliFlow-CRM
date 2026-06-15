// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// EmailMessage renders user-supplied HTML email bodies via
// `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.htmlBody) }}`.
// This is the runtime user-content sanitization path, so it must keep stripping
// active content (scripts, event handlers, javascript: URLs) after any bump of
// the underlying `dompurify` override (GHSA-vxr8-fq34-vvx9, >=3.4.9). These
// tests exercise the REAL isomorphic-dompurify — it is intentionally NOT mocked.

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

  it('strips javascript: URLs from anchors', () => {
    const { container } = renderMessage('<a href="javascript:window.__pwned=1">click</a>');
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href') ?? '').not.toContain('javascript:');
  });
});
