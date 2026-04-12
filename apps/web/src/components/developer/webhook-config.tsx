'use client';

import { Input, Label } from '@intelliflow/ui';

export interface WebhookConfigProps {
  value: string;
  onChange: (value: string) => void;
  environment: 'production' | 'sandbox';
  error?: string;
}

const inputId = 'webhook-url-input';
const errorId = 'webhook-url-error';

export function WebhookConfig({
  value,
  onChange,
  environment,
  error,
}: Readonly<WebhookConfigProps>) {
  return (
    <div data-testid="webhook-config" className="space-y-2">
      <Label htmlFor={inputId}>Webhook URL</Label>
      <Input
        id={inputId}
        type="url"
        placeholder="https://example.com/webhooks"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        className="focus-visible:ring-2"
      />
      <p className="text-sm text-muted-foreground">
        {environment === 'production'
          ? 'Production webhooks require HTTPS.'
          : 'Sandbox allows HTTP for local development.'}
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
