'use client';

/**
 * "Your own AI key" on the Model Configuration page (PG-199 BYOK).
 *
 * A workspace admin picks a provider and pastes their own API key; the AI worker then runs the
 * workspace's chat calls on it instead of the platform's. The page never holds a stored key:
 * the server returns only provider, last 4 characters, status, dates and the fallback switch,
 * and the typed key is cleared from state as soon as it is saved.
 */
import { useState } from 'react';
import {
  Button,
  Card,
  ConfirmationDialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@intelliflow/ui';
import {
  AI_KEY_PROVIDERS,
  AI_KEY_PROVIDER_LABELS,
  type AIKeyProvider,
  type AIKeyStatus,
  type AIProviderKeyDto,
} from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { errorCode } from '@/lib/trpc-errors';
import { SectionHeader } from '@/components/shared/section-header';

const STATUS_LABEL: Record<AIKeyStatus, string> = {
  ACTIVE: 'Active',
  INVALID: 'Rejected by provider',
  RATE_LIMITED: 'Rate limited',
  QUOTA_EXCEEDED: 'No quota left',
};

const STATUS_CLASS: Record<AIKeyStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  INVALID: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
  RATE_LIMITED: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  QUOTA_EXCEEDED: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
};

const STATUS_ICON: Record<AIKeyStatus, string> = {
  ACTIVE: 'check_circle',
  INVALID: 'error',
  RATE_LIMITED: 'schedule',
  QUOTA_EXCEEDED: 'warning',
};

/** Same one-line button style from 320px up: short labels, never wrapped. */
const BUTTON_CLASS = 'h-11 whitespace-nowrap';

interface Feedback {
  kind: 'success' | 'error';
  text: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

function loadErrorText(error: { message: string } | null): string {
  return error
    ? 'Could not load your key settings: ' + error.message
    : 'Could not load your key settings.';
}

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'unknown'
    : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: Readonly<{ status: AIKeyStatus }>) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
        {STATUS_ICON[status]}
      </span>
      <span>{STATUS_LABEL[status]}</span>
    </span>
  );
}

function Header() {
  return (
    <SectionHeader
      icon="key"
      iconBg="bg-violet-100 dark:bg-violet-900/30"
      iconFg="text-violet-700 dark:text-violet-300"
      title="Your own AI key"
      titleId="own-key-title"
      headingLevel={2}
      description="Use your own AI provider account. Your workspace's AI calls then run on your key and bill to you."
    />
  );
}

export function OwnKeySection() {
  const utils = trpc.useUtils();
  const query = trpc.aiProviderKey.get.useQuery(undefined, { refetchOnWindowFocus: true });
  const setKey = trpc.aiProviderKey.set.useMutation();
  const testKey = trpc.aiProviderKey.test.useMutation();
  const setOptions = trpc.aiProviderKey.setOptions.useMutation();
  const removeKey = trpc.aiProviderKey.remove.useMutation();

  const [provider, setProvider] = useState<AIKeyProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [allowFallback, setAllowFallback] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const data = query.data as { canManage: boolean; key: AIProviderKeyDto | null } | undefined;
  const busy = setKey.isPending || testKey.isPending || setOptions.isPending || removeKey.isPending;

  // An API older than this page has no aiProviderKey procedures: say nothing rather than fail.
  if (errorCode(query.error) === 'NOT_FOUND') return null;

  if (query.isLoading) {
    return (
      <section aria-labelledby="own-key-title" className="mb-4">
        <Card className="p-4 sm:p-5">
          <Header />
          <output className="block text-sm text-muted-foreground">
            Loading your key settings...
          </output>
        </Card>
      </section>
    );
  }

  if (!data) {
    return (
      <section aria-labelledby="own-key-title" className="mb-4">
        <Card className="space-y-3 p-4 sm:p-5">
          <Header />
          <p className="text-sm text-red-700 dark:text-red-400" role="alert">
            {loadErrorText(query.error)}
          </p>
          <Button
            type="button"
            variant="outline"
            className={BUTTON_CLASS}
            onClick={() => query.refetch()}
          >
            Retry
          </Button>
        </Card>
      </section>
    );
  }

  if (!data.canManage) {
    return (
      <section aria-labelledby="own-key-title" className="mb-4">
        <Card className="space-y-2 p-4 sm:p-5">
          <Header />
          <p className="text-sm text-muted-foreground" role="note" aria-label="View-only access">
            Only workspace admins can manage the workspace&apos;s own AI key.
          </p>
        </Card>
      </section>
    );
  }

  const stored = data.key;
  const showForm = !stored || replacing;
  const typedReady = apiKey.trim().length > 0;

  const refresh = async () => {
    await utils.aiProviderKey.get.invalidate();
  };

  const clearTyped = () => {
    setApiKey('');
    setReplacing(false);
  };

  const handleSave = async () => {
    setFeedback(null);
    try {
      // A replacement keeps the stored fallback choice; only a first key sends one.
      await setKey.mutateAsync({
        provider,
        apiKey: apiKey.trim(),
        ...(stored ? {} : { allowFallback }),
      });
      clearTyped();
      await refresh();
      setFeedback({ kind: 'success', text: 'Key saved. Your AI calls now use it.' });
      toast({ title: 'Your AI key was saved' });
    } catch (error) {
      setFeedback({ kind: 'error', text: messageOf(error) });
    } finally {
      // The mutation object would keep the typed key in memory as its `variables`.
      setKey.reset();
    }
  };

  const handleTest = async () => {
    setFeedback(null);
    try {
      const result = await testKey.mutateAsync(
        showForm && typedReady ? { provider, apiKey: apiKey.trim() } : null
      );
      if (result.key) await refresh();
      setFeedback({ kind: result.ok ? 'success' : 'error', text: result.message });
    } catch (error) {
      setFeedback({ kind: 'error', text: messageOf(error) });
    } finally {
      testKey.reset();
    }
  };

  const handleRemove = async () => {
    setFeedback(null);
    try {
      await removeKey.mutateAsync();
      clearTyped();
      await refresh();
      setFeedback({ kind: 'success', text: 'Key removed. Your AI calls use the platform again.' });
      toast({ title: 'Your AI key was removed' });
    } catch (error) {
      setFeedback({ kind: 'error', text: messageOf(error) });
    }
  };

  const handleFallbackToggle = async (next: boolean) => {
    setFeedback(null);
    try {
      await setOptions.mutateAsync({ allowFallback: next });
      await refresh();
    } catch (error) {
      setFeedback({ kind: 'error', text: messageOf(error) });
    }
  };

  const canTest = showForm ? typedReady || stored !== null : true;

  return (
    <section aria-labelledby="own-key-title" className="mb-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <Header />

        {query.error && (
          <p className="text-sm text-amber-800 dark:text-amber-200" role="alert">
            Could not refresh your key settings. Showing the last values loaded.
          </p>
        )}

        {stored && (
          <div
            className="space-y-2 rounded-md border border-border px-3 py-3"
            data-testid="own-key-stored"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {AI_KEY_PROVIDER_LABELS[stored.provider]}
              </span>
              <span
                className="font-mono text-sm text-muted-foreground"
                aria-label={`Key ending in ${stored.last4}`}
              >
                {`•••• ${stored.last4}`}
              </span>
              <StatusBadge status={stored.status} />
            </div>
            {stored.statusDetail && stored.status !== 'ACTIVE' && (
              <p className="text-xs text-muted-foreground">{stored.statusDetail}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {`Saved ${formatDate(stored.createdAt)}. Last used ${formatDate(stored.lastUsedAt)}.`}
            </p>
            <div className="flex items-start gap-2">
              <input
                id="own-key-fallback"
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={stored.allowFallback}
                disabled={busy}
                aria-describedby="own-key-fallback-help"
                onChange={(e) => {
                  handleFallbackToggle(e.target.checked).catch(() => undefined);
                }}
              />
              <div>
                <label htmlFor="own-key-fallback" className="block text-sm text-foreground">
                  If my key stops working, use the platform&apos;s AI instead
                </label>
                <p id="own-key-fallback-help" className="text-xs text-muted-foreground">
                  Off by default: AI jobs fail with a clear message rather than run on the platform.
                </p>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="own-key-provider">Provider</Label>
              <Select
                value={provider}
                onValueChange={(value) => {
                  // A key typed for one provider must never be sent to another.
                  setProvider(value as AIKeyProvider);
                  setApiKey('');
                }}
                disabled={busy}
              >
                <SelectTrigger id="own-key-provider" aria-label="Provider" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_KEY_PROVIDERS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {AI_KEY_PROVIDER_LABELS[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="own-key-input">API key</Label>
              <Input
                id="own-key-input"
                type="password"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Paste your key"
                value={apiKey}
                disabled={busy}
                onChange={(e) => setApiKey(e.target.value)}
                aria-describedby="own-key-help"
              />
              <p id="own-key-help" className="text-xs text-muted-foreground">
                Stored encrypted and never shown again. We check it with your provider before
                saving.
              </p>
            </div>
            {!stored && (
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={allowFallback}
                  disabled={busy}
                  onChange={(e) => setAllowFallback(e.target.checked)}
                />
                <span>If my key stops working, use the platform&apos;s AI instead</span>
              </label>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {showForm && (
            <Button
              type="button"
              className={BUTTON_CLASS}
              onClick={() => {
                handleSave().catch(() => undefined);
              }}
              disabled={!typedReady || busy}
            >
              {setKey.isPending ? 'Saving...' : 'Save key'}
            </Button>
          )}
          {stored && !replacing && (
            <Button
              type="button"
              variant="outline"
              className={BUTTON_CLASS}
              onClick={() => {
                setFeedback(null);
                // The replacement is for the provider the workspace already uses.
                setProvider(stored.provider);
                setApiKey('');
                setReplacing(true);
              }}
              disabled={busy}
            >
              Replace
            </Button>
          )}
          {replacing && (
            <Button
              type="button"
              variant="outline"
              className={BUTTON_CLASS}
              onClick={clearTyped}
              disabled={busy}
            >
              Cancel
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className={BUTTON_CLASS}
            onClick={() => {
              handleTest().catch(() => undefined);
            }}
            disabled={!canTest || busy}
          >
            {testKey.isPending ? 'Testing...' : 'Test'}
          </Button>
          {stored && (
            <Button
              type="button"
              variant="outline"
              className={`${BUTTON_CLASS} text-red-700 dark:text-red-300`}
              onClick={() => setConfirmRemove(true)}
              disabled={busy}
            >
              Remove
            </Button>
          )}
        </div>

        <output aria-live="polite" className="block">
          {feedback && (
            <p
              className={`text-sm ${
                feedback.kind === 'error'
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-green-700 dark:text-green-400'
              }`}
            >
              {feedback.text}
            </p>
          )}
        </output>

        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Only chat features use your key. Search embeddings stay on the platform.</li>
          <li>
            Your provider bills you for these calls. They do not use the platform&apos;s AI budget.
          </li>
          <li>
            With your key the model is each provider&apos;s standard one; the model pins and
            fallbacks below apply only to platform AI.
          </li>
        </ul>
      </Card>

      <ConfirmationDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove your AI key?"
        description="The key is deleted. Your workspace's AI calls go back to the platform's AI."
        confirmLabel="Remove key"
        variant="destructive"
        isLoading={removeKey.isPending}
        onConfirm={() => {
          setConfirmRemove(false);
          handleRemove().catch(() => undefined);
        }}
      />
    </section>
  );
}
