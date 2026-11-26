'use client';

/**
 * "My mailbox" (PG-207, owner rulings Q6/Q7): the user's own Google,
 * Microsoft or SMTP mailbox that their email leaves from. Its actions are
 * immediate (connect, test, disconnect), so the page renders it outside the
 * settings form. `MailboxConnection` is shared with the company mailbox card.
 */
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge, Button, Card, ConfirmationDialog } from '@intelliflow/ui';
import type { MailboxDto, OAuthProvidersAvailableDto } from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { SectionHeader } from '@/components/shared/section-header';
import { mailboxErrorMessage } from '@/components/email/send-errors';
import { oauthProviderKey } from '../../oauth/oauth-session';
import { connectionFailureHelp } from './connection-help';
import { oneClickNotYet, providerByServer } from './mailbox-providers';
import { SmtpHostingNotice } from './SmtpHostingNotice';
import { SendFromHint, type HintProvider } from './SendFromHint';
import { calendarSyncLine } from './calendar-sync-status';
import { historyImportLine, inboxSyncLine } from './inbox-sync-status';
import { GoogleAdminTrust } from './GoogleAdminTrust';
import { GoogleCalendarAccess } from './GoogleCalendarAccess';

// Loaded on demand: most users connect with Google or Microsoft (C-FE5).
const SmtpMailboxForm = dynamic(() => import('./SmtpMailboxForm').then((m) => m.SmtpMailboxForm), {
  ssr: false,
  loading: () => <p className="text-sm text-muted-foreground">Loading SMTP settings…</p>,
});

type Scope = 'USER' | 'TENANT';
type Provider = 'GMAIL' | 'MICROSOFT' | 'ZOHO';

const ORDER: readonly Provider[] = ['GMAIL', 'MICROSOFT', 'ZOHO'];

const PROVIDER_LABEL: Record<Provider, string> = {
  GMAIL: 'Google',
  MICROSOFT: 'Microsoft',
  ZOHO: 'Zoho Mail',
};

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
  /** The card heading's id: focus goes there when the control that had it disappears. */
  headingId: string;
  onChanged: () => void;
  announce: (message: string) => void;
  /** MVP-011: the Google client id a Workspace admin trusts (shown on the admin-trust card). */
  googleClientId?: string | null;
}

/** Google Calendar line under a healthy mailbox: the reconnect card, or when it last synced. */
function CalendarSyncSection({
  mailbox,
  prefix,
  gmailAvailable,
  pending,
  onConnect,
}: Readonly<{
  mailbox: MailboxDto;
  prefix: string;
  gmailAvailable: boolean;
  pending: boolean;
  onConnect: () => void;
}>) {
  if (mailbox.calendarSync === 'NEEDS_RECONNECT' && mailbox.replySync !== 'NEEDS_ADMIN_TRUST') {
    return (
      <GoogleCalendarAccess
        reconnect
        idPrefix={prefix}
        onConnect={gmailAvailable ? onConnect : undefined}
        pending={pending}
      />
    );
  }
  if (mailbox.calendarSync !== 'ON') return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="calendar-sync-status">
      {calendarSyncLine(mailbox.calendarSyncedAt)}
    </p>
  );
}
/** Connection status and actions for one mailbox scope. */
export function MailboxConnection({
  scope,
  mailbox,
  providersAvailable,
  disconnectConsequence,
  headingId,
  onChanged,
  announce,
  googleClientId = null,
}: Readonly<MailboxConnectionProps>) {
  const prefix = scope === 'USER' ? 'my' : 'company';
  const oauthStart = trpc.emailMailbox.oauthStart.useMutation();
  const testConnection = trpc.emailMailbox.testConnection.useMutation();
  const disconnect = trpc.emailMailbox.disconnect.useMutation();
  const [editing, setEditing] = useState(false);
  // MVP-001: the provider the send-from address's mail runs on, offered first.
  const [preferred, setPreferred] = useState<HintProvider | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Where focus goes after the SMTP form closes or the mailbox is disconnected
  // (the control that had focus is gone by then).
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const disconnectedRef = useRef(false);

  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  const setupId = `${prefix}-setup-smtp`;
  const editId = `${prefix}-edit-smtp`;

  const connected = mailbox !== null && mailbox.status !== 'DISCONNECTED';
  const broken = mailbox?.status === 'ERROR';

  /** `sendOnly` (Google): sign in for sending only, when the domain blocks reading (MVP-011). */
  const startOAuth = async (provider: Provider, sendOnly = false) => {
    setError(null);
    try {
      const { url } = await oauthStart.mutateAsync({
        provider,
        scope,
        ...(sendOnly ? { sendOnly: true } : {}),
      });
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
        : connectionFailureHelp(
            outcome.code ?? 'CONNECT_FAILED',
            providerByServer(mailbox?.smtpHost ?? '')
          );
      setResult({ ok: outcome.ok, message });
      announce(message);
      // Either way the server may have changed the status (ERROR <-> ACTIVE).
      onChanged();
    } catch (e) {
      setError(errorText(e, 'The connection could not be tested.'));
    }
  };

  const confirmDisconnect = async () => {
    setError(null);
    try {
      await disconnect.mutateAsync({ scope });
      disconnectedRef.current = true;
      setResult(null);
      announce('Mailbox disconnected.');
      onChanged();
    } catch (e) {
      setError(errorText(e, 'The mailbox could not be disconnected.'));
    }
  };

  // A one-click button appears once it works; until then one line says so.
  const providerButton = (provider: Provider) =>
    providersAvailable[provider] ? (
      <Button
        key={provider}
        type="button"
        size="sm"
        variant="outline"
        disabled={oauthStart.isPending}
        onClick={() => void startOAuth(provider)}
      >
        Connect {PROVIDER_LABEL[provider]}
      </Button>
    ) : null;
  const notYet = (['GMAIL', 'MICROSOFT', 'ZOHO'] as const)
    .filter((provider) => !providersAvailable[provider])
    .map((provider) => PROVIDER_LABEL[provider]);

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
        <p className="text-sm text-muted-foreground">
          {scope === 'USER'
            ? 'Connect your mailbox to send email.'
            : 'Connect a shared address your team can send from.'}
        </p>
      )}
      {broken && mailbox?.lastErrorCode && (
        <p className="text-sm text-red-700 dark:text-red-300">
          {mailboxErrorMessage(mailbox.lastErrorCode)}
        </p>
      )}
      {connected && !broken && mailbox?.replySync === 'ON' && (
        <p className="text-xs text-muted-foreground" data-testid="inbox-sync-status">
          {inboxSyncLine(mailbox.inboxSyncedAt)}
        </p>
      )}
      {connected && !broken && historyImportLine(mailbox?.historyImport, mailbox?.kind) && (
        <p className="text-xs text-muted-foreground" data-testid="history-import-status">
          {historyImportLine(mailbox?.historyImport, mailbox?.kind)}
        </p>
      )}
      {connected && !broken && mailbox?.replySync === 'NEEDS_RECONNECT' && (
        <div className="flex flex-wrap items-center gap-2" data-testid="reply-sync-reconnect">
          <p className="text-xs text-muted-foreground">
            Replies from leads and contacts are not logged yet: this mailbox was connected before
            Aurora could read it.
          </p>
          {providersAvailable[mailbox.kind as Provider] && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={oauthStart.isPending}
              onClick={() => void startOAuth(mailbox.kind as Provider)}
            >
              Reconnect to log replies
            </Button>
          )}
        </div>
      )}
      {connected && !broken && mailbox?.replySync === 'NEEDS_ADMIN_TRUST' && (
        <GoogleAdminTrust
          idPrefix={prefix}
          clientId={googleClientId}
          lead="This Google mailbox is connected for sending only."
          onRetry={providersAvailable.GMAIL ? () => void startOAuth('GMAIL') : undefined}
          pending={oauthStart.isPending}
        />
      )}{' '}
      {/* The admin-trust card above already covers a domain that blocks reading: it blocks the calendar too. */}
      {connected &&
        !broken &&
        mailbox?.calendarAccess === 'NOT_GRANTED' &&
        mailbox.replySync !== 'NEEDS_ADMIN_TRUST' && (
          <GoogleCalendarAccess
            idPrefix={prefix}
            onConnect={providersAvailable.GMAIL ? () => void startOAuth('GMAIL') : undefined}
            pending={oauthStart.isPending}
          />
        )}
      {connected && !broken && mailbox && (
        <CalendarSyncSection
          mailbox={mailbox}
          prefix={prefix}
          gmailAvailable={providersAvailable.GMAIL}
          pending={oauthStart.isPending}
          onConnect={() => void startOAuth('GMAIL')}
        />
      )}
      {!connected && !editing && <SendFromHint scope={scope} onProvider={setPreferred} />}
      {(!connected || broken) && (
        <div className="flex flex-wrap items-start gap-2">
          {/* While setting up, the form's own first step is the only choice on screen. */}
          {!editing &&
            ORDER.filter((p) => p === preferred)
              .concat(ORDER.filter((p) => p !== preferred))
              .map((p) => providerButton(p))}
          {/* A broken SMTP mailbox is edited below; a disconnected one is set up again here. */}
          {!editing && (!connected || mailbox?.kind !== 'SMTP') && (
            <Button
              id={setupId}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              Set Up Mailbox
            </Button>
          )}
          {!editing && notYet.length > 0 && (
            <p className="w-full text-xs text-muted-foreground">
              {oneClickNotYet(notYet.join(' and '))}
            </p>
          )}
          {/* Google asks for reading too; a domain that does not trust Aurora blocks that sign-in. */}
          {!editing && providersAvailable.GMAIL && (
            <details className="w-full text-sm" data-testid="google-blocked-help">
              <summary className="cursor-pointer text-muted-foreground">
                Google blocked the sign-in?
              </summary>
              <div className="mt-2">
                <GoogleAdminTrust
                  idPrefix={`${prefix}-blocked`}
                  clientId={googleClientId}
                  lead="Google blocks reading mail and using the calendar for a Workspace account whose admin has not trusted Aurora yet."
                  onSendOnly={() => void startOAuth('GMAIL', true)}
                  pending={oauthStart.isPending}
                />
              </div>
            </details>
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
            <Button
              id={editId}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
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
      {editing && <SmtpHostingNotice />}
      {editing && (
        <SmtpMailboxForm
          scope={scope}
          mailbox={mailbox}
          onSaved={() => {
            setEditing(false);
            setResult(null);
            announce('Mailbox saved.');
            setFocusTarget(headingId);
            onChanged();
          }}
          onCancel={() => {
            setEditing(false);
            setFocusTarget(mailbox?.kind === 'SMTP' ? editId : setupId);
          }}
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
        onCloseAutoFocus={(event) => {
          if (!disconnectedRef.current) return;
          // The Disconnect button is gone: land on the card heading instead.
          disconnectedRef.current = false;
          event.preventDefault();
          setFocusTarget(headingId);
        }}
      />
    </div>
  );
}

/** Exported so the OAuth return notice can hand focus to this card. */
export const MY_MAILBOX_TITLE_ID = 'email-settings-my-mailbox-title';
const TITLE_ID = MY_MAILBOX_TITLE_ID;

export interface MyMailboxCardProps {
  mailbox: MailboxDto | null;
  providersAvailable: OAuthProvidersAvailableDto;
  /** The company mailbox a member falls back to, when the admin allows it. */
  companyFallbackAddress: string | null;
  onChanged: () => void;
  announce: (message: string) => void;
  googleClientId?: string | null;
}

export function MyMailboxCard({
  mailbox,
  providersAvailable,
  companyFallbackAddress,
  onChanged,
  announce,
  googleClientId = null,
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
          focusableTitle
          description="Email you send leaves from this mailbox, as you."
        />
        <MailboxConnection
          scope="USER"
          headingId={TITLE_ID}
          mailbox={mailbox}
          providersAvailable={providersAvailable}
          disconnectConsequence={consequence}
          onChanged={onChanged}
          announce={announce}
          googleClientId={googleClientId}
        />
      </Card>
    </section>
  );
}
