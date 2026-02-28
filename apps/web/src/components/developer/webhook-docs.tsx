'use client';

import { useState } from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@intelliflow/ui';
import { WebhookTester } from '@/components/developer/webhook-tester';

const EMAIL_WEBHOOK_EVENTS = [
  { type: 'email.delivered', description: 'Email successfully delivered' },
  { type: 'email.bounced', description: 'Email bounced' },
  { type: 'email.deferred', description: 'Email delivery deferred' },
  { type: 'email.dropped', description: 'Email dropped by provider' },
  { type: 'email.opened', description: 'Email opened by recipient' },
  { type: 'email.clicked', description: 'Link clicked in email' },
  { type: 'email.unsubscribed', description: 'Recipient unsubscribed' },
  { type: 'email.spam_report', description: 'Email reported as spam' },
  { type: 'email.blocked', description: 'Email blocked by provider' },
  { type: 'email.inbound', description: 'Inbound email received' },
] as const;

const SIGNATURE_VERIFIERS = [
  {
    name: 'HMAC-SHA256',
    header: 'x-signature',
    description: 'Standard HMAC-SHA256 signature verification using a shared secret.',
  },
  {
    name: 'Stripe',
    header: 'stripe-signature',
    description: 'Stripe-style signature with timestamp tolerance for replay protection.',
  },
  {
    name: 'GitHub',
    header: 'x-hub-signature-256',
    description: 'GitHub webhook signature using sha256= prefix format.',
  },
  {
    name: 'SendGrid',
    header: 'x-sendgrid-signature',
    description:
      'SendGrid signature verification. Note: Current implementation uses HMAC placeholder — production requires proper ECDSA verification.',
  },
] as const;

const WEBHOOK_API_ENDPOINTS = [
  {
    procedure: 'handleWebhook',
    type: 'mutation',
    access: 'public',
    description: 'Receive and process incoming webhook events from external services',
  },
  {
    procedure: 'registerSource',
    type: 'mutation',
    access: 'protected',
    description: 'Register a new webhook source with provider credentials and signature config',
  },
  {
    procedure: 'unregisterSource',
    type: 'mutation',
    access: 'protected',
    description: 'Remove a registered webhook source by name',
  },
  {
    procedure: 'getSources',
    type: 'query',
    access: 'protected',
    description: 'List all registered webhook sources and their configuration',
  },
  {
    procedure: 'getMetrics',
    type: 'query',
    access: 'protected',
    description: 'Retrieve webhook processing metrics (success rates, latency, counts)',
  },
  {
    procedure: 'processRetries',
    type: 'mutation',
    access: 'protected',
    description: 'Manually trigger processing of pending webhook retries',
  },
  {
    procedure: 'getDeadLetterEntries',
    type: 'query',
    access: 'protected',
    description: 'List failed webhooks that exceeded the retry limit',
  },
  {
    procedure: 'reprocessDeadLetter',
    type: 'mutation',
    access: 'protected',
    description: 'Manually retry a specific dead letter entry by event ID',
  },
  {
    procedure: 'cleanup',
    type: 'mutation',
    access: 'protected',
    description: 'Remove expired idempotency entries (called periodically via cron)',
  },
] as const;

const SAMPLE_PAYLOADS_FULL: Record<string, object> = {
  'email.delivered': {
    id: 'evt_del_001',
    type: 'email.delivered',
    timestamp: '2026-01-15T10:30:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_abc123',
      recipient: 'user@example.com',
      subject: 'Welcome to IntelliFlow',
      deliveredAt: '2026-01-15T10:30:00.000Z',
    },
  },
  'email.bounced': {
    id: 'evt_bnc_002',
    type: 'email.bounced',
    timestamp: '2026-01-15T10:31:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_def456',
      recipient: 'invalid@example.com',
      bounceType: 'hard',
      reason: '550 User not found',
    },
  },
  'email.deferred': {
    id: 'evt_def_003',
    type: 'email.deferred',
    timestamp: '2026-01-15T10:32:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_ghi789',
      recipient: 'user@example.com',
      attempts: 2,
      reason: 'Mailbox temporarily full',
    },
  },
  'email.dropped': {
    id: 'evt_drp_004',
    type: 'email.dropped',
    timestamp: '2026-01-15T10:33:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_jkl012',
      recipient: 'user@example.com',
      reason: 'Unsubscribed address',
    },
  },
  'email.opened': {
    id: 'evt_opn_005',
    type: 'email.opened',
    timestamp: '2026-01-15T11:00:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_mno345',
      recipient: 'user@example.com',
      openedAt: '2026-01-15T11:00:00.000Z',
      userAgent: 'Mozilla/5.0',
    },
  },
  'email.clicked': {
    id: 'evt_clk_006',
    type: 'email.clicked',
    timestamp: '2026-01-15T11:05:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_pqr678',
      recipient: 'user@example.com',
      url: 'https://app.intelliflow.com/welcome',
      clickedAt: '2026-01-15T11:05:00.000Z',
    },
  },
  'email.unsubscribed': {
    id: 'evt_uns_007',
    type: 'email.unsubscribed',
    timestamp: '2026-01-15T12:00:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_stu901',
      recipient: 'user@example.com',
      listId: 'list_marketing',
      unsubscribedAt: '2026-01-15T12:00:00.000Z',
    },
  },
  'email.spam_report': {
    id: 'evt_spm_008',
    type: 'email.spam_report',
    timestamp: '2026-01-15T13:00:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_vwx234',
      recipient: 'user@example.com',
      reportedAt: '2026-01-15T13:00:00.000Z',
    },
  },
  'email.blocked': {
    id: 'evt_blk_009',
    type: 'email.blocked',
    timestamp: '2026-01-15T14:00:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      messageId: 'msg_yza567',
      recipient: 'user@example.com',
      reason: 'IP blacklisted',
      provider: 'sendgrid',
    },
  },
  'email.inbound': {
    id: 'evt_inb_010',
    type: 'email.inbound',
    timestamp: '2026-01-15T15:00:00.000Z',
    version: '1.0',
    source: 'sendgrid',
    payload: {
      from: 'customer@example.com',
      to: 'support@intelliflow.com',
      subject: 'Help with my account',
      textBody: 'I need assistance with billing.',
    },
  },
};

const IDEMPOTENCY_CONFIG = [
  { parameter: 'Key TTL', value: '24 hours', description: 'How long idempotency keys are retained before expiry' },
  { parameter: 'Lock Timeout', value: '30 seconds', description: 'Max time a processing lock is held before release' },
  { parameter: 'Max Retries', value: '3', description: 'Maximum retry attempts for failed idempotent operations' },
  { parameter: 'Cleanup Interval', value: '1 hour', description: 'How often expired entries are purged from the store' },
] as const;

const IDEMPOTENCY_OUTCOMES = [
  {
    outcome: 'PROCESS',
    description: 'New event — no existing entry found. The event is locked and processed normally.',
    color: 'green',
  },
  {
    outcome: 'SKIP',
    description: 'Duplicate event — already completed successfully. Returns the cached response.',
    color: 'blue',
  },
  {
    outcome: 'WAIT',
    description: 'Concurrent request — another instance is processing the same event. Returns 409 Conflict.',
    color: 'yellow',
  },
] as const;

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {label && (
        <div className="text-xs text-muted-foreground mb-1 font-medium">{label}</div>
      )}
      <pre className="font-mono bg-muted rounded-lg p-4 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={`Copy ${label || 'code'} to clipboard`}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 id="overview-intro" className="text-lg font-semibold text-foreground mb-3">
          What are Webhooks?
        </h2>
        <p className="text-muted-foreground mb-4">
          Webhooks enable real-time communication between IntelliFlow CRM and your applications.
          There are two types of webhook integrations:
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-blue-500" aria-hidden="true">
                call_received
              </span>
              <h3 className="font-medium">Inbound Webhooks</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Receive events from external services (email providers, payment processors) into
              IntelliFlow CRM for processing and routing.
            </p>
          </div>
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-emerald-500" aria-hidden="true">
                call_made
              </span>
              <h3 className="font-medium">Outbound Webhooks</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Send real-time event notifications from IntelliFlow CRM to your endpoints when CRM
              events occur. Currently available via notification preferences.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 id="payload-envelope" className="text-lg font-semibold text-foreground mb-3">
          Standard Payload Envelope
        </h2>
        <p className="text-muted-foreground mb-3">
          All webhook events use a standardized envelope format:
        </p>
        <CodeBlock
          label="WebhookEventSchema"
          code={`{
  "id": "evt_abc123",           // Event UUID for idempotency
  "type": "email.delivered",    // Event type
  "timestamp": "2026-01-15T10:30:00.000Z",  // ISO-8601
  "version": "1.0",            // Schema version
  "source": "sendgrid",        // Registered source name
  "payload": { ... },          // Event-specific data
  "metadata": { ... }          // Optional metadata
}`}
        />
      </section>

      <section>
        <h2 id="integration-steps" className="text-lg font-semibold text-foreground mb-3">
          Integration Steps
        </h2>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-sm font-medium shrink-0">
              1
            </span>
            <div>
              <div className="font-medium">Register a Webhook Source</div>
              <div className="text-sm text-muted-foreground">
                Call <code className="font-mono text-xs bg-muted px-1 rounded">webhooks.registerSource</code> with
                your provider name, shared secret, signature header, and verifier type (hmac-sha256, stripe, github, or custom).
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-sm font-medium shrink-0">
              2
            </span>
            <div>
              <div className="font-medium">Configure Signature Verification</div>
              <div className="text-sm text-muted-foreground">
                Point your provider to the <code className="font-mono text-xs bg-muted px-1 rounded">webhooks.handleWebhook</code> endpoint.
                Incoming requests are verified using timing-safe comparison against the registered signature header.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-sm font-medium shrink-0">
              3
            </span>
            <div>
              <div className="font-medium">Set Up Event Handlers</div>
              <div className="text-sm text-muted-foreground">
                Subscribe to the event types you need (e.g. <code className="font-mono text-xs bg-muted px-1 rounded">email.delivered</code>,{' '}
                <code className="font-mono text-xs bg-muted px-1 rounded">email.bounced</code>). Use{' '}
                <code className="font-mono text-xs bg-muted px-1 rounded">allowedEvents</code> during registration to filter events at the source level.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 text-sm font-medium shrink-0">
              4
            </span>
            <div>
              <div className="font-medium">Monitor Delivery Health</div>
              <div className="text-sm text-muted-foreground">
                Use <code className="font-mono text-xs bg-muted px-1 rounded">webhooks.getMetrics</code> for success rates and latency,{' '}
                <code className="font-mono text-xs bg-muted px-1 rounded">webhooks.getDeadLetterEntries</code> to inspect failures, and{' '}
                <code className="font-mono text-xs bg-muted px-1 rounded">webhooks.reprocessDeadLetter</code> to retry individual events.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 id="api-endpoints" className="text-lg font-semibold text-foreground mb-3">
          API Endpoints
        </h2>
        <p className="text-muted-foreground mb-3">
          All webhook management is exposed via 9 tRPC procedures on the <code className="font-mono text-xs bg-muted px-1 rounded">webhooks</code> router.
        </p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Procedure</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Access</th>
                <th className="text-left p-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {WEBHOOK_API_ENDPOINTS.map((ep) => (
                <tr key={ep.procedure} className="border-t">
                  <td className="p-3 font-mono text-xs">{ep.procedure}</td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        ep.type === 'query'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}
                    >
                      {ep.type}
                    </span>
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        ep.access === 'public'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                      }`}
                    >
                      {ep.access}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{ep.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EventCatalogTab() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 id="email-events" className="text-lg font-semibold text-foreground mb-3">
          Email Webhook Events
        </h2>
        <p className="text-muted-foreground mb-4">
          IntelliFlow CRM processes 10 email webhook event types covering delivery, engagement,
          compliance, and inbound messages.
        </p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Event Type</th>
                <th className="text-left p-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {EMAIL_WEBHOOK_EVENTS.map((event) => (
                <tr key={event.type} className="border-t">
                  <td className="p-3 font-mono text-xs">{event.type}</td>
                  <td className="p-3 text-muted-foreground">{event.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 id="example-payloads" className="text-lg font-semibold text-foreground mb-3">
          Example Payloads
        </h2>
        <p className="text-muted-foreground mb-3">
          Each payload uses the standard envelope format. Expand an event type to see the full JSON.
        </p>
        <Accordion type="single" collapsible defaultValue="email.delivered">
          {EMAIL_WEBHOOK_EVENTS.map((event) => (
            <AccordionItem key={event.type} value={event.type}>
              <AccordionTrigger className="font-mono text-sm">
                {event.type}
              </AccordionTrigger>
              <AccordionContent>
                <CodeBlock
                  label={event.type}
                  code={JSON.stringify(SAMPLE_PAYLOADS_FULL[event.type], null, 2)}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}

function SecurityTab() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 id="signature-verification" className="text-lg font-semibold text-foreground mb-3">
          Signature Verification
        </h2>
        <p className="text-muted-foreground mb-4">
          IntelliFlow CRM supports 4 signature verification methods. Each provider sends a
          signature in a specific HTTP header that must be verified using timing-safe comparison
          to prevent timing attacks.
        </p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Verifier</th>
                <th className="text-left p-3 font-medium">Header</th>
                <th className="text-left p-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {SIGNATURE_VERIFIERS.map((verifier) => (
                <tr key={verifier.name} className="border-t">
                  <td className="p-3 font-medium">{verifier.name}</td>
                  <td className="p-3 font-mono text-xs">{verifier.header}</td>
                  <td className="p-3 text-muted-foreground text-xs">{verifier.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 id="hmac-example" className="text-lg font-semibold text-foreground mb-3">
          HMAC-SHA256 Verification Example
        </h2>
        <p className="text-muted-foreground mb-3">
          Use <code className="font-mono text-sm bg-muted px-1 rounded">timingSafeEqual</code>{' '}
          from Node.js crypto module to compare signatures. This prevents timing-based side-channel
          attacks that could leak information about the expected signature.
        </p>
        <CodeBlock
          label="HMAC-SHA256 verification"
          code={`import { createHmac, timingSafeEqual } from 'crypto';

function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}`}
        />
      </section>

      <section>
        <h2 id="sendgrid-note" className="text-lg font-semibold text-foreground mb-3">
          SendGrid Verification Note
        </h2>
        <div className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-r-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Important:</strong> The current SendGrid signature verifier uses an HMAC
            placeholder implementation. Production deployments should use proper ECDSA
            verification as specified by SendGrid&apos;s Signed Event Webhook documentation.
          </p>
        </div>
      </section>
    </div>
  );
}

function RetryResilienceTab() {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 id="retry-policy" className="text-lg font-semibold text-foreground mb-3">
          Retry Policy
        </h2>
        <p className="text-muted-foreground mb-4">
          Failed webhook deliveries are automatically retried with exponential backoff:
        </p>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Parameter</th>
                <th className="text-left p-3 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-3">Max Attempts</td>
                <td className="p-3 font-mono">5</td>
              </tr>
              <tr className="border-t">
                <td className="p-3">Backoff Multiplier</td>
                <td className="p-3 font-mono">2x</td>
              </tr>
              <tr className="border-t">
                <td className="p-3">Jitter</td>
                <td className="p-3 font-mono">30%</td>
              </tr>
              <tr className="border-t">
                <td className="p-3">Max Delay</td>
                <td className="p-3 font-mono">5 minutes</td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock
          label="Retry configuration"
          code={`{
  maxAttempts: 5,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
  jitterPercent: 0.3,
  maxDelayMs: 300000  // 5 minutes
}`}
        />
      </section>

      <section>
        <h2 id="circuit-breaker" className="text-lg font-semibold text-foreground mb-3">
          Circuit Breaker
        </h2>
        <p className="text-muted-foreground mb-4">
          The circuit breaker prevents cascading failures by temporarily stopping requests to
          failing endpoints:
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 text-sm font-medium">
              1
            </span>
            <div>
              <div className="font-medium">Closed</div>
              <div className="text-sm text-muted-foreground">
                Normal operation — requests pass through. Opens after 5 consecutive failures.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 text-sm font-medium">
              2
            </span>
            <div>
              <div className="font-medium">Open</div>
              <div className="text-sm text-muted-foreground">
                All requests rejected immediately. Transitions to half-open after 60 seconds.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 text-sm font-medium">
              3
            </span>
            <div>
              <div className="font-medium">Half-Open</div>
              <div className="text-sm text-muted-foreground">
                Limited test requests allowed. Closes after 3 consecutive successes; opens on any
                failure.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 id="dead-letter-queue" className="text-lg font-semibold text-foreground mb-3">
          Dead Letter Queue
        </h2>
        <p className="text-muted-foreground">
          Events that exhaust all retry attempts are moved to the dead letter queue for manual
          review and reprocessing. The current implementation uses in-memory storage — production
          deployments will use Redis for persistence.
        </p>
      </section>

      <section>
        <h2 id="idempotency" className="text-lg font-semibold text-foreground mb-3">
          Idempotency
        </h2>
        <p className="text-muted-foreground mb-4">
          Every webhook event is deduplicated using an idempotency key derived from the source and
          event ID. This guarantees exactly-once processing even when providers retry deliveries.
        </p>

        <h3 className="text-sm font-semibold text-foreground mb-2">Configuration</h3>
        <div className="border rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Parameter</th>
                <th className="text-left p-3 font-medium">Value</th>
                <th className="text-left p-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {IDEMPOTENCY_CONFIG.map((row) => (
                <tr key={row.parameter} className="border-t">
                  <td className="p-3 font-medium">{row.parameter}</td>
                  <td className="p-3 font-mono text-xs">{row.value}</td>
                  <td className="p-3 text-muted-foreground text-xs">{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-sm font-semibold text-foreground mb-2">Check Outcomes</h3>
        <div className="flex flex-col gap-3 mb-4">
          {IDEMPOTENCY_OUTCOMES.map((item) => (
            <div key={item.outcome} className="flex items-start gap-3 p-3 border rounded-lg">
              <span
                className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                  item.color === 'green'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : item.color === 'blue'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                }`}
              >
                {item.outcome}
              </span>
              <div className="text-sm text-muted-foreground">{item.description}</div>
            </div>
          ))}
        </div>

        <h3 className="text-sm font-semibold text-foreground mb-2">Key Generation</h3>
        <CodeBlock
          label="Idempotency key generation"
          code={`import { createHash } from 'crypto';

function generateKey(
  source: string,
  eventId: string,
  prefix = 'idempotency:'
): string {
  const data = \`\${source}:\${eventId}\`;
  const hash = createHash('sha256')
    .update(data)
    .digest('hex')
    .slice(0, 32);
  return \`\${prefix}\${hash}\`;
}`}
        />
      </section>
    </div>
  );
}

export function WebhookDocs() {
  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="events">Event Catalog</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="retry">Retry &amp; Resilience</TabsTrigger>
        <TabsTrigger value="tester">Endpoint Tester</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <OverviewTab />
      </TabsContent>

      <TabsContent value="events">
        <EventCatalogTab />
      </TabsContent>

      <TabsContent value="security">
        <SecurityTab />
      </TabsContent>

      <TabsContent value="retry">
        <RetryResilienceTab />
      </TabsContent>

      <TabsContent value="tester">
        <WebhookTester />
      </TabsContent>
    </Tabs>
  );
}
