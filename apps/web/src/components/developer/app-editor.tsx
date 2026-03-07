'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Textarea,
  Label,
  Separator,
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@intelliflow/ui';
import type { ApiKeyScope } from '@/lib/developer/api-key-generator';
import { findAppById } from '@/lib/developer/demo-data';
import { isValidWebhookUrl } from '@/lib/developer/oauth-setup';
import { SCOPE_OPTIONS } from '@/components/developer/app-creator';
import { WebhookConfig } from '@/components/developer/webhook-config';

export interface AppEditorProps {
  appId: string;
}

export interface AppEditFormData {
  name: string;
  description: string;
  scopes: ApiKeyScope[];
  webhookUrl: string;
}

function CopyButton({ text, label }: Readonly<{ text: string; label: string }>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fallback — clipboard API may be unavailable
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label={`Copy ${label} to clipboard`}
    >
      <span className="material-symbols-outlined text-sm" aria-hidden="true">
        {copied ? 'check' : 'content_copy'}
      </span>
    </button>
  );
}

export function AppEditor({ appId }: Readonly<AppEditorProps>) {
  const router = useRouter();
  const app = appId ? findAppById(appId) : undefined;

  const [formData, setFormData] = useState<AppEditFormData>(() => ({
    name: app?.name ?? '',
    description: app?.description ?? '',
    scopes: app?.scopes ?? ['read'],
    webhookUrl: app?.webhookUrl ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof AppEditFormData | 'webhook', string>>>(
    {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scopeChanged, setScopeChanged] = useState(false);

  if (!app) {
    return (
      <div data-testid="app-editor">
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">App Not Found</h2>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              The developer app you are looking for does not exist or has been removed.
            </p>
            <Link
              href="/developers/apps"
              className="text-primary underline hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Back to Developer Apps
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const updateField = <K extends keyof AppEditFormData>(key: K, value: AppEditFormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleScope = (scope: ApiKeyScope) => {
    setFormData((prev) => {
      const scopes = prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope];
      return { ...prev, scopes };
    });
    setScopeChanged(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.scopes;
      return next;
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof AppEditFormData | 'webhook', string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Name must be 100 characters or less';
    }

    if (formData.description.length > 500) {
      newErrors.description = 'Description must be 500 characters or less';
    }

    if (formData.scopes.length === 0) {
      newErrors.scopes = 'At least one scope is required';
    }

    const webhookError = isValidWebhookUrl(formData.webhookUrl, app.environment);
    if (webhookError) {
      newErrors.webhook = webhookError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    // Demo tier: brief delay to simulate save
    await new Promise((resolve) => setTimeout(resolve, 300));
    router.push(`/developers/apps/${appId}`);
  };

  let statusVariant: 'default' | 'secondary' | 'outline';
  if (app.status === 'active') {
    statusVariant = 'default';
  } else if (app.status === 'inactive') {
    statusVariant = 'secondary';
  } else {
    statusVariant = 'outline';
  }

  return (
    <div data-testid="app-editor">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-sm text-muted-foreground mb-6"
      >
        <Link
          href="/developers/apps"
          className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Developer Apps
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/developers/apps/${appId}`}
          className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          {app.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-foreground font-medium">
          Edit App
        </span>
      </nav>

      {/* Inactive app warning */}
      {app.status === 'inactive' && (
        <div
          className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-4 mb-6"
          role="alert"
        >
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            This app is inactive. Changes will take effect if the app is reactivated.
          </p>
        </div>
      )}

      {/* Card: App Details */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">App Details</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="app-name">App Name</Label>
            <Input
              id="app-name"
              type="text"
              maxLength={100}
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={errors.name ? 'name-error' : undefined}
              className="focus-visible:ring-2"
            />
            {errors.name && (
              <p id="name-error" role="alert" className="text-sm text-destructive mt-1">
                {errors.name}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="app-description">Description</Label>
            <Textarea
              id="app-description"
              maxLength={500}
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              aria-invalid={errors.description ? 'true' : undefined}
              aria-describedby={errors.description ? 'description-error' : undefined}
              className="focus-visible:ring-2"
            />
            {errors.description && (
              <p id="description-error" role="alert" className="text-sm text-destructive mt-1">
                {errors.description}
              </p>
            )}
          </div>

          <Separator />

          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground text-xs">Client ID</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm font-mono">{app.clientId}</code>
                <CopyButton text={app.clientId} label="Client ID" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Environment</Label>
              <div className="flex items-center gap-2 mt-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Badge variant={app.environment === 'production' ? 'default' : 'secondary'}>
                          {app.environment}
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Environment is bound to API key prefixes and cannot be changed</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Created</Label>
              <p data-testid="created-at" className="text-sm mt-1">
                {new Date(app.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Status</Label>
              <div className="mt-1">
                <Badge data-testid="status-badge" variant={statusVariant}>
                  {app.status}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card: Configuration (Scopes) */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">Configuration</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>OAuth Scopes</Label>
            <div className="flex flex-col gap-2 mt-2">
              {SCOPE_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.scopes.includes(option.value)}
                    onChange={() => toggleScope(option.value)}
                    aria-label={option.label}
                    className="rounded border-border focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
            {errors.scopes && (
              <p role="alert" className="text-sm text-destructive mt-1">
                {errors.scopes}
              </p>
            )}
            {scopeChanged && (
              <p className="text-sm text-muted-foreground mt-2">
                Changing scopes may affect existing API keys. Changes take effect immediately.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Card: Webhooks */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="text-xl font-semibold">Webhooks</h2>
        </CardHeader>
        <CardContent>
          <WebhookConfig
            value={formData.webhookUrl}
            onChange={(val) => {
              updateField('webhookUrl', val);
              setErrors((prev) => {
                const next = { ...prev };
                delete next.webhook;
                return next;
              });
            }}
            environment={app.environment}
            error={errors.webhook}
          />
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isSubmitting} className="focus-visible:ring-2">
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
        <Link
          href={`/developers/apps/${appId}`}
          className="text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring rounded px-4 py-2"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
