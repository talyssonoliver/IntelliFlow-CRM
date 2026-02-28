import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhookDocs } from '../webhook-docs';

// Mock WebhookTester to isolate docs tests
vi.mock('@/components/developer/webhook-tester', () => ({
  WebhookTester: () => <div data-testid="webhook-tester">Tester Mock</div>,
}));

// Mock clipboard for copy-to-clipboard coverage
const mockWriteText = vi.fn().mockResolvedValue(undefined);

// navigator.clipboard may not exist in jsdom — define it
if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    configurable: true,
  });
} else {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

describe('WebhookDocs', () => {
  it('renders all 5 tab triggers', () => {
    render(<WebhookDocs />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Event Catalog' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Security' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Retry/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Endpoint Tester' })).toBeInTheDocument();
  });

  it('default tab shows Overview content with inbound and outbound text', () => {
    render(<WebhookDocs />);
    expect(screen.getByText('Inbound Webhooks')).toBeInTheDocument();
    expect(screen.getByText('Outbound Webhooks')).toBeInTheDocument();
  });

  it('Event Catalog tab lists all 10 email webhook event types', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Event Catalog' }));

    const events = [
      'email.delivered',
      'email.bounced',
      'email.deferred',
      'email.dropped',
      'email.opened',
      'email.clicked',
      'email.unsubscribed',
      'email.spam_report',
      'email.blocked',
      'email.inbound',
    ];
    for (const event of events) {
      // Some events may appear in multiple tab panels (hidden); use getAllByText
      expect(screen.getAllByText(event).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('Event Catalog tab shows example payloads in code blocks', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Event Catalog' }));

    const codeBlocks = document.querySelectorAll('pre code');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1);
    // Check for payload content — may appear in multiple panels
    expect(screen.getAllByText(/email\.delivered/).length).toBeGreaterThanOrEqual(1);
  });

  it('Security tab shows HMAC-SHA256 verification code example with timingSafeEqual', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Security' }));

    // Code content may appear across hidden panel text; use getAllByText
    expect(screen.getAllByText(/timingSafeEqual/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/createHmac/).length).toBeGreaterThanOrEqual(1);
  });

  it('Security tab documents all 4 verifier types with header names', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Security' }));

    expect(screen.getByText('HMAC-SHA256')).toBeInTheDocument();
    expect(screen.getByText('Stripe')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('SendGrid')).toBeInTheDocument();
    expect(screen.getByText('x-signature')).toBeInTheDocument();
    expect(screen.getByText('stripe-signature')).toBeInTheDocument();
    expect(screen.getByText('x-hub-signature-256')).toBeInTheDocument();
    expect(screen.getByText('x-sendgrid-signature')).toBeInTheDocument();
  });

  it('Security tab has SendGrid note about HMAC placeholder', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Security' }));

    // SendGrid note appears in both table description and callout; use getAllByText
    expect(screen.getAllByText(/HMAC.*placeholder/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/ECDSA/i).length).toBeGreaterThanOrEqual(1);
  });

  it('Retry & Resilience tab shows retry config values', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: /Retry/i }));

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('5 minutes')).toBeInTheDocument();
  });

  it('Retry & Resilience tab documents circuit breaker states', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: /Retry/i }));

    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Half-Open')).toBeInTheDocument();
  });

  it('code blocks have copy-to-clipboard buttons that copy text', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);

    // Click first copy button — should call clipboard.writeText and show check icon
    await user.click(copyButtons[0]);

    // After successful copy, the icon text changes from 'content_copy' to 'check'
    await waitFor(() => {
      const checkIcons = screen.queryAllByText('check');
      expect(checkIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('icons have aria-hidden="true" attribute', () => {
    render(<WebhookDocs />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('Endpoint Tester tab embeds WebhookTester component', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Endpoint Tester' }));

    expect(screen.getByTestId('webhook-tester')).toBeInTheDocument();
  });

  it('Event Catalog accordion renders all 10 event types as triggers', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Event Catalog' }));

    const expectedEvents = [
      'email.delivered',
      'email.bounced',
      'email.deferred',
      'email.dropped',
      'email.opened',
      'email.clicked',
      'email.unsubscribed',
      'email.spam_report',
      'email.blocked',
      'email.inbound',
    ];
    // Each event should appear as an accordion trigger button
    // Trigger text includes the chevron icon text, so use regex matching
    const triggers = screen.getAllByRole('button', { name: /^email\./i });
    expect(triggers.length).toBe(10);
    for (const event of expectedEvents) {
      expect(
        triggers.some((t) => t.textContent?.includes(event))
      ).toBe(true);
    }
  });

  it('Event Catalog default-open accordion shows email.delivered code', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Event Catalog' }));

    // The default-open accordion item should contain the full envelope payload
    expect(screen.getAllByText(/evt_del_001/).length).toBeGreaterThanOrEqual(1);
  });

  it('Event Catalog clicking accordion item opens payload', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: 'Event Catalog' }));

    // Click the email.bounced accordion trigger
    const bouncedTrigger = screen.getByRole('button', { name: 'email.bounced' });
    await user.click(bouncedTrigger);

    // Should now show the bounced payload
    await waitFor(() => {
      expect(screen.getAllByText(/evt_bnc_002/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('Overview shows 4 detailed integration steps', () => {
    render(<WebhookDocs />);
    expect(screen.getByText('Register a Webhook Source')).toBeInTheDocument();
    expect(screen.getByText('Configure Signature Verification')).toBeInTheDocument();
    expect(screen.getByText('Set Up Event Handlers')).toBeInTheDocument();
    expect(screen.getByText('Monitor Delivery Health')).toBeInTheDocument();
  });

  it('Overview shows all 9 tRPC API procedures', () => {
    render(<WebhookDocs />);
    const procedures = [
      'handleWebhook',
      'registerSource',
      'unregisterSource',
      'getSources',
      'getMetrics',
      'processRetries',
      'getDeadLetterEntries',
      'reprocessDeadLetter',
      'cleanup',
    ];
    for (const proc of procedures) {
      expect(screen.getByText(proc)).toBeInTheDocument();
    }
  });

  it('Retry tab shows idempotency config and check outcomes', async () => {
    const user = userEvent.setup();
    render(<WebhookDocs />);
    await user.click(screen.getByRole('tab', { name: /Retry/i }));

    // Config values
    expect(screen.getByText('Key TTL')).toBeInTheDocument();
    expect(screen.getByText('24 hours')).toBeInTheDocument();
    expect(screen.getByText('Lock Timeout')).toBeInTheDocument();
    expect(screen.getByText('30 seconds')).toBeInTheDocument();
    expect(screen.getByText('Max Retries')).toBeInTheDocument();
    expect(screen.getByText('Cleanup Interval')).toBeInTheDocument();
    expect(screen.getByText('1 hour')).toBeInTheDocument();

    // Check outcomes
    expect(screen.getByText('PROCESS')).toBeInTheDocument();
    expect(screen.getByText('SKIP')).toBeInTheDocument();
    expect(screen.getByText('WAIT')).toBeInTheDocument();
  });
});
