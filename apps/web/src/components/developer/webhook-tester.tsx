'use client';

import { useState } from 'react';
import { Input, Button, Badge, Textarea } from '@intelliflow/ui';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@intelliflow/ui';

const EMAIL_WEBHOOK_EVENTS = [
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
] as const;

type EmailWebhookEvent = (typeof EMAIL_WEBHOOK_EVENTS)[number];

const SAMPLE_PAYLOADS: Record<EmailWebhookEvent, object> = {
  'email.delivered': {
    messageId: 'msg_abc123',
    recipient: 'user@example.com',
    subject: 'Welcome to IntelliFlow',
    deliveredAt: '2026-01-15T10:30:00.000Z',
  },
  'email.bounced': {
    messageId: 'msg_def456',
    recipient: 'invalid@example.com',
    bounceType: 'hard',
    reason: '550 User not found',
  },
  'email.deferred': {
    messageId: 'msg_ghi789',
    recipient: 'user@example.com',
    attempts: 2,
    reason: 'Mailbox temporarily full',
  },
  'email.dropped': {
    messageId: 'msg_jkl012',
    recipient: 'user@example.com',
    reason: 'Unsubscribed address',
  },
  'email.opened': {
    messageId: 'msg_mno345',
    recipient: 'user@example.com',
    openedAt: '2026-01-15T11:00:00.000Z',
    userAgent: 'Mozilla/5.0',
  },
  'email.clicked': {
    messageId: 'msg_pqr678',
    recipient: 'user@example.com',
    url: 'https://app.intelliflow.com/welcome',
    clickedAt: '2026-01-15T11:05:00.000Z',
  },
  'email.unsubscribed': {
    messageId: 'msg_stu901',
    recipient: 'user@example.com',
    listId: 'list_marketing',
    unsubscribedAt: '2026-01-15T12:00:00.000Z',
  },
  'email.spam_report': {
    messageId: 'msg_vwx234',
    recipient: 'user@example.com',
    reportedAt: '2026-01-15T13:00:00.000Z',
  },
  'email.blocked': {
    messageId: 'msg_yza567',
    recipient: 'user@example.com',
    reason: 'IP blacklisted',
    provider: 'sendgrid',
  },
  'email.inbound': {
    from: 'customer@example.com',
    to: 'support@intelliflow.com',
    subject: 'Help with my account',
    textBody: 'I need assistance with billing.',
  },
};

function buildEnvelope(eventType: EmailWebhookEvent) {
  return JSON.stringify(
    {
      id: `evt_test_${Date.now()}`,
      type: eventType,
      timestamp: new Date().toISOString(),
      version: '1.0',
      source: 'webhook-tester',
      payload: SAMPLE_PAYLOADS[eventType],
    },
    null,
    2
  );
}

interface TestResult {
  status: number;
  latencyMs: number;
  body: string;
  responseHeaders: Record<string, string>;
}

function getStatusVariant(status: number) {
  if (status >= 200 && status < 300) return 'success' as const;
  if (status >= 400 && status < 500) return 'warning' as const;
  if (status >= 500) return 'destructive' as const;
  return 'secondary' as const;
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function WebhookTester() {
  const [url, setUrl] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EmailWebhookEvent>('email.delivered');
  const [payload, setPayload] = useState(() => buildEnvelope('email.delivered'));
  const [result, setResult] = useState<TestResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEventChange = (value: string) => {
    const event = value as EmailWebhookEvent;
    setSelectedEvent(event);
    setPayload(buildEnvelope(event));
  };

  const handleSend = async () => {
    setIsPending(true);
    setResult(null);
    setError(null);

    try {
      const parsedPayload = JSON.parse(payload);
      const response = await fetch('/api/developer/webhook-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, payload: parsedPayload, headers: {} }),
      });

      const data: TestResult = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsPending(false);
    }
  };

  const handleClear = () => {
    setUrl('');
    setSelectedEvent('email.delivered');
    setPayload(buildEnvelope('email.delivered'));
    setResult(null);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 id="tester-config" className="text-lg font-semibold text-foreground mb-3">
          Test Configuration
        </h2>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="webhook-url" className="text-sm font-medium mb-1.5 block">
              Endpoint URL
            </label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://your-endpoint.example.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="event-type" className="text-sm font-medium mb-1.5 block">
              Event Type
            </label>
            <Select value={selectedEvent} onValueChange={handleEventChange}>
              <SelectTrigger id="event-type">
                <SelectValue placeholder="Select event type" />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_WEBHOOK_EVENTS.map((event) => (
                  <SelectItem key={event} value={event}>
                    {event}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="webhook-payload" className="text-sm font-medium mb-1.5 block">
              Payload
            </label>
            <Textarea
              id="webhook-payload"
              className="font-mono text-sm min-h-[200px]"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSend} disabled={!url || isPending}>
              {isPending ? (
                <>
                  <span
                    className="material-symbols-outlined text-sm animate-spin mr-1.5"
                    aria-hidden="true"
                  >
                    progress_activity
                  </span>
                  Sending...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm mr-1.5" aria-hidden="true">
                    send
                  </span>
                  Send Test Webhook
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleClear} type="button">
              Clear
            </Button>
          </div>
        </div>
      </section>

      {(result || error) && (
        <section>
          <h2 id="tester-response" className="text-lg font-semibold text-foreground mb-3">
            Response
          </h2>
          {error ? (
            <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="destructive">Error</Badge>
              </div>
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : result ? (
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-4 mb-4">
                <Badge variant={getStatusVariant(result.status)}>
                  {result.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {result.latencyMs}ms
                </span>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1 font-medium">
                  Response Body
                </div>
                <pre className="font-mono bg-muted rounded-lg p-4 text-sm overflow-x-auto">
                  <code>{formatBody(result.body)}</code>
                </pre>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
