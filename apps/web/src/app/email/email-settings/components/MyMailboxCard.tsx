'use client';

/**
 * "My mailbox" (PG-207, owner rulings Q6/Q7): the user's own Google,
 * Microsoft or SMTP mailbox that their email leaves from. Its actions are
 * immediate (connect, test, disconnect), so the page renders it outside the
 * settings form. `MailboxConnection` is shared with the company mailbox card.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge, Button, Card, ConfirmationDialog } from '@intelliflow/ui';
import type { MailboxDto, OAuthProvidersAvailableDto } from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { SectionHeader } from '@/components/shared/section-header';
import { mailboxErrorMessage } from '@/components/email/send-errors';
import { oauthProviderKey } from '../../oauth/oauth-session';

// Loaded on demand: most users connect with Google or Microsoft (C-FE5).
const SmtpMailboxForm = dynamic(() => import('./SmtpMailboxForm').then((m) => m.SmtpMailboxForm), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading SMTP settings…</p>,
});

type Scope = 'USER' | 'TENANT';
type Provider = 'GMAIL' | 'MICROSOFT';

const PROVIDER_LABEL: Record<Provider, string> = { GMAIL: 'Google', MICROSOFT: 'Microsoft' };

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function methodLabel(mailbox: MailboxDto): string {
  if (mailbox.kind === 'SMTP') return `SMTP · ${mailbox.smtpHost ?? ''}`;
  return PROVIDER_LABEL[mailbox.kind as Provider];
}

export interface MailboxConnectionProps {
  scope: Scope;
  mailbox: MailboxDto | null;
  providersAvailable: OAuthProvidersAvailableDto;
  /** Disconnect dialog copy: what sending falls back to afterwards. */
  disconnectConsequence: string;
  onChanged: () => void;
  announce: (message: string) => void;
}

/** Connection status and actions for one mailbox scope. */
export function MailboxConnection({
  scope,
  mailbox,
  providersAvailable,
  disconnectConsequence,
  onChanged,
  announce,
}: Readonly<MailboxConnectionProps>) {
  const prefix = scope === 'USER' ? 'my' : 'company';
  const oauthStart = trpc.emailMailbox.oauthStart.useMutation();
  const testConnection = trpc.emailMailbox.testConnection.useMutation();
  const disconnect = trpc.emailMailbox.disconnect.useMutation();
  const [editing, setEditing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = mailbox !== null && mailbox.status !== 'DISCONNECTED';
  const broken = mailbox?.status === 'ERROR';

  const startOAuth = async (provider: Provider) => {
    setError(null);
    try {
      const { url } = await oauthStart.mutateAsync({ provider, scope });
      const state = new URL(url).searchParams.get('state');
      if (state) sessionStorage.setItem(oauthProviderKey(state), provider);
      window.location.assign(url);
    } catch (e) {
      setError(errorText(e, `${PROVIDER_LABEL[provider]} sign-in could not start.`));
    }
  };

  const runTest = async () => {
    setError(null);
    try {
      const outcome = await testConnection.mutateAsync({ scope });
      const message = outcome.ok
        ? 'Connection works.'
        : mailboxErrorMessage(outcome.code ?? 'CONNECT_FAILED');
      setResult({ ok: outcome.ok, message });
      announce(message);
      if (!outcome.ok) onChanged();
    } catch (e) {
      setError(errorText(e, 'The connection could not be tested.'));
    }
  };

  const confirmDisconnect = async () => {
    setError(null);
    try {
      await disconnect.mutateAsync({ scope });
      setResult(null);
      announce('Mailbox disconnected.');
      onChanged();
    } catch (e) {
      setError(errorText(e, 'The mailbox could not be disconnected.'));
    }
  };

  const providerButton = (provider: Provider) => {
    const available = providersAvailable[provider];
    const reasonId = `${prefix}-${provider.toLowerCase()}-unavailable`;
    return (
      <div key={provider} className="space-y-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!available || oauthStart.isPending}
          aria-describedby={available ? undefined : reasonId}
          onClick={() => void startOAuth(provider)}
        >
          Connect {PROVIDER_LABEL[provider]}
        </Button>
        {!available && (
          <p id={reasonId} className="text-xs text-muted-foreground">
            {PROVIDER_LABEL[provider]} sign-in is not set up on this server yet.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {connected && !broken && <Badge variant="secondary">Connected</Badge>}
        {broken && <Badge variant="destructive">Needs attention</Badge>}
        {!connected && <Badge variant="outline">Not connected</Badge>}
        {connected && mailbox && (
          <>
            <span className="text-sm font-medium text-foreground">{mailbox.fromAddress}</span>
            <span className="text-sm text-muted-foreground">{methodLabel(mailbox)}</span>
          </>
        )}
      </div>

      {!connected && (
        <p className="text-sm text-muted-foreground">Connect your mailbox to send email.</p>
      )}
      {broken && mailbox?.lastErrorCode && (
        <p className="text-sm text-red-700 dark:text-red-300">
          {mailboxErrorMessage(mailbox.lastErrorCode)}
        </p>
      )}

      {(!connected || broken) && (
        <div className="flex flex-wrap items-start gap-2">
          {providerButton('GMAIL')}
          {providerButton('MICROSOFT')}
          {!editing && mailbox?.kind !== 'SMTP' && (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Set Up SMTP
            </Button>
          )}
        </div>
      )}

      {connected && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={editing || testConnection.isPending}
            onClick={() => void runTest()}
          >
            {testConnection.isPending ? 'Testing…' : 'Test Connection'}
          </Button>
          {mailbox?.kind === 'SMTP' && !editing && (
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit SMTP Settings
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setDisconnectOpen(true)}>
            Disconnect
          </Button>
        </div>
      )}

      {result && (
        <p
          className={
            result.ok ? 'text-sm text-foreground' : 'text-sm text-red-700 dark:text-red-300'
          }
        >
          {result.message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {editing && (
        <SmtpMailboxForm
          scope={scope}
          mailbox={mailbox}
          onSaved={() => {
            setEditing(false);
            setResult(null);
            announce('Mailbox saved.');
            onChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      <ConfirmationDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title="Disconnect this mailbox?"
        description={`Its saved password or sign-in is deleted. ${disconnectConsequence}`}
        confirmLabel="Disconnect Mailbox"
        variant="destructive"
        onConfirm={confirmDisconnect}
        isLoading={disconnect.isPending}
      />
    </div>
  );
}

const TITLE_ID = 'email-settings-my-mailbox-title';

export interface MyMailboxCardProps {
  mailbox: MailboxDto | null;
  providersAvailable: OAuthProvidersAvailableDto;
  /** The company mailbox a member falls back to, when the admin allows it. */
  companyFallbackAddress: string | null;
  onChanged: () => void;
  announce: (message: string) => void;
}

export function MyMailboxCard({
  mailbox,
  providersAvailable,
  companyFallbackAddress,
  onChanged,
  announce,
}: Readonly<MyMailboxCardProps>) {
  const consequence = companyFallbackAddress
    ? `Your email will be sent from the company mailbox (${companyFallbackAddress}) instead.`
    : 'You will not be able to send email until you connect a mailbox again.';
  return (
    <section aria-labelledby={TITLE_ID}>
      <Card className="p-4 sm:p-5">
        <SectionHeader
          icon="forward_to_inbox"
          iconBg="bg-sky-100 dark:bg-sky-900/30"
          iconFg="text-sky-700 dark:text-sky-300"
          title="My mailbox"
          titleId={TITLE_ID}
          headingLevel={2}
          description="Email you send leaves from this mailbox, as you."
        />
        <MailboxConnection
          scope="USER"
          mailbox={mailbox}
          providersAvailable={providersAvailable}
          disconnectConsequence={consequence}
          onChanged={onChanged}
          announce={announce}
        />
      </Card>
    </section>
  );
}
