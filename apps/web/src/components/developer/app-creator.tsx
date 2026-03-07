'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, Button, Input, Textarea, Label, Separator } from '@intelliflow/ui';
import type { ApiKeyScope } from '@/lib/developer/api-key-generator';
import type { DeveloperApp } from '@/lib/developer/demo-data';
import {
  generateOAuthCredentials,
  isValidWebhookUrl,
  type OAuthCredentials,
} from '@/lib/developer/oauth-setup';

export interface AppFormData {
  name: string;
  description: string;
  environment: 'production' | 'sandbox';
  scopes: ApiKeyScope[];
  webhookUrl: string;
}

interface CreatedAppResult {
  app: DeveloperApp;
  credentials: OAuthCredentials;
}

const initialFormData: AppFormData = {
  name: '',
  description: '',
  environment: 'sandbox',
  scopes: ['read'],
  webhookUrl: '',
};

export const SCOPE_OPTIONS: { value: ApiKeyScope; label: string }[] = [
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'admin', label: 'Admin' },
];

function CopyButton({ text, label }: Readonly<{ text: string; label: string }>) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 3000);
    }
  };

  let icon: string;
  if (copyFailed) {
    icon = 'error_outline';
  } else if (copied) {
    icon = 'check';
  } else {
    icon = 'content_copy';
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={`Copy ${label} to clipboard`}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {icon}
        </span>
      </button>
      {copyFailed && (
        <output className="text-xs text-destructive">
          Copy failed
        </output>
      )}
    </span>
  );
}

export function AppCreator() {
  const [formData, setFormData] = useState<AppFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof AppFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdApp, setCreatedApp] = useState<CreatedAppResult | null>(null);
  const [secretDismissed, setSecretDismissed] = useState(false);

  const updateField = <K extends keyof AppFormData>(key: K, value: AppFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleScope = (scope: Readonly<ApiKeyScope>) => {
    setFormData((prev) => {
      const scopes = prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope];
      return { ...prev, scopes };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next.scopes;
      return next;
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof AppFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'App name is required';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'App name must be 100 characters or less';
    }

    if (formData.description.length > 500) {
      newErrors.description = 'Description must be 500 characters or less';
    }

    if (formData.scopes.length === 0) {
      newErrors.scopes = 'At least one scope is required';
    }

    const webhookError = isValidWebhookUrl(formData.webhookUrl, formData.environment);
    if (webhookError) {
      newErrors.webhookUrl = webhookError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    const credentials = generateOAuthCredentials(formData.environment);

    const app: DeveloperApp = {
      id: `app-${crypto.randomUUID().slice(0, 8)}`,
      name: formData.name.trim(),
      description: formData.description.trim(),
      clientId: credentials.clientId,
      status: 'pending',
      environment: formData.environment,
      createdAt: new Date().toISOString(),
      apiKeys: [],
      scopes: formData.scopes,
      ...(formData.webhookUrl.trim() && { webhookUrl: formData.webhookUrl.trim() }),
    };

    setCreatedApp({ app, credentials });
    setIsSubmitting(false);
  };

  const handleCreateAnother = () => {
    setFormData(initialFormData);
    setErrors({});
    setCreatedApp(null);
    setSecretDismissed(false);
    setIsSubmitting(false);
  };

  if (createdApp) {
    return (
      <div data-testid="app-creator">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link href="/developers/apps" className="hover:text-foreground transition-colors">
                Developer Apps
              </Link>
            </li>
            <li>
              <span className="material-symbols-outlined text-xs" aria-hidden="true">
                chevron_right
              </span>
            </li>
            <li aria-current="page" className="text-foreground font-medium">
              App Created
            </li>
          </ol>
        </nav>

        <h1 className="text-2xl font-bold text-foreground mb-6">App Created Successfully</h1>

        {!secretDismissed && (
          <div
            className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-r-lg mb-6"
            role="alert"
          >
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">
              <span
                className="material-symbols-outlined text-sm align-middle mr-1"
                aria-hidden="true"
              >
                warning
              </span>{' '}
              Save your credentials
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              Your client secret will only be shown once. Copy it now and store it securely.
            </p>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">{createdApp.app.name}</h2>
            {createdApp.app.description && (
              <p className="text-sm text-muted-foreground">{createdApp.app.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Client ID</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded font-mono">
                    {createdApp.credentials.clientId}
                  </code>
                  <CopyButton text={createdApp.credentials.clientId} label="client ID" />
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-xs text-muted-foreground">
                  {secretDismissed ? 'Client Secret (masked)' : 'Client Secret (one-time display)'}
                </Label>
                {secretDismissed ? (
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 text-sm bg-muted px-3 py-2 rounded font-mono break-all">
                      {createdApp.credentials.maskedSecret}
                    </code>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-sm bg-muted px-3 py-2 rounded font-mono break-all">
                        {createdApp.credentials.clientSecret}
                      </code>
                      <CopyButton
                        text={createdApp.credentials.clientSecret}
                        label="client secret"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Masked value for your records:{' '}
                      <code>{createdApp.credentials.maskedSecret}</code>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setSecretDismissed(true)}
                    >
                      I&apos;ve saved my credentials
                    </Button>
                  </>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Environment</span>
                  <p className="font-medium capitalize">{createdApp.app.environment}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Scopes</span>
                  <p className="font-medium">{createdApp.app.scopes.join(', ')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={handleCreateAnother} variant="outline">
            Create Another App
          </Button>
          <Link
            href="/developers/apps"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          >
            Back to Developer Apps
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="app-creator">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link href="/developers/apps" className="hover:text-foreground transition-colors">
              Developer Apps
            </Link>
          </li>
          <li>
            <span className="material-symbols-outlined text-xs" aria-hidden="true">
              chevron_right
            </span>
          </li>
          <li aria-current="page" className="text-foreground font-medium">
            Create New App
          </li>
        </ol>
      </nav>

      <h1 className="text-2xl font-bold text-foreground mb-6">Create New App</h1>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-6"
        aria-label="Create new developer app"
      >
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">App Details</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Label htmlFor="app-name">App Name</Label>
              <Input
                id="app-name"
                type="text"
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="My Application"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'app-name-error' : undefined}
                maxLength={100}
              />
              {errors.name && (
                <p id="app-name-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="app-description">Description</Label>
              <Textarea
                id="app-description"
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Describe your application..."
                rows={3}
                aria-invalid={!!errors.description}
                aria-describedby={errors.description ? 'app-description-error' : undefined}
                maxLength={500}
              />
              {errors.description && (
                <p
                  id="app-description-error"
                  className="text-sm text-destructive mt-1"
                  role="alert"
                >
                  {errors.description}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">Configuration</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <fieldset>
              <legend className="text-sm font-medium mb-3">Environment</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="environment"
                    value="sandbox"
                    checked={formData.environment === 'sandbox'}
                    onChange={() => updateField('environment', 'sandbox')}
                    className="accent-primary"
                  />
                  <span className="text-sm">Sandbox</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="environment"
                    value="production"
                    checked={formData.environment === 'production'}
                    onChange={() => updateField('environment', 'production')}
                    className="accent-primary"
                  />
                  <span className="text-sm">Production</span>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium mb-3">API Scopes</legend>
              <div className="flex gap-4">
                {SCOPE_OPTIONS.map((scope) => (
                  <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.scopes.includes(scope.value)}
                      onChange={() => toggleScope(scope.value)}
                      className="accent-primary"
                      aria-describedby={errors.scopes ? 'scope-error' : undefined}
                    />
                    <span className="text-sm">{scope.label}</span>
                  </label>
                ))}
              </div>
              {errors.scopes && (
                <p id="scope-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.scopes}
                </p>
              )}
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
            <p className="text-sm text-muted-foreground">
              Optional webhook endpoint for event notifications
            </p>
          </CardHeader>
          <CardContent>
            <div>
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input
                id="webhook-url"
                type="url"
                value={formData.webhookUrl}
                onChange={(e) => updateField('webhookUrl', e.target.value)}
                placeholder="https://example.com/webhooks"
                aria-invalid={!!errors.webhookUrl}
                aria-describedby={errors.webhookUrl ? 'webhook-url-error' : undefined}
              />
              {errors.webhookUrl && (
                <p id="webhook-url-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.webhookUrl}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formData.environment === 'production'
                  ? 'Production webhooks require HTTPS.'
                  : 'Sandbox allows HTTP for local development.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create App'}
          </Button>
          <Link
            href="/developers/apps"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
