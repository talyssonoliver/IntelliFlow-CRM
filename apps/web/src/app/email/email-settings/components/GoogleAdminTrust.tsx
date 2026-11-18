'use client';

/**
 * MVP-011: reading a Google mailbox needs gmail.readonly, which Google grants a Google Workspace
 * account once the domain's admin trusts Aurora's OAuth client (admin-trusted apps need no paid
 * assessment). Until then the mailbox sends only. This card says so plainly, with the client ID
 * and the four Admin console steps, and offers the next sign-in: again with reading (after the
 * admin trusted Aurora) or for sending only.
 */
import { Button } from '@intelliflow/ui';
import { CopyField } from '@/components/shared/copy-field';

export const ADMIN_TRUST_STEPS = [
  'Sign in to admin.google.com as a super admin.',
  'Open Security, then Access and data control, then API controls, and choose Manage Third-Party App Access.',
  'Choose Configure new app, search for the client ID below and select Aurora.',
  'Choose who it applies to, set its access to Trusted, and confirm.',
] as const;

export interface GoogleAdminTrustProps {
  /** The Google OAuth client id the admin trusts; null when Google is not set up here. */
  clientId: string | null;
  /** What happened, in one sentence (connected for sending only, or Google blocked the sign-in). */
  lead: string;
  /** Connect again with reading, once the admin trusted Aurora. */
  onRetry?: () => void;
  /** Connect for sending only, when Google blocks the sign-in with reading. */
  onSendOnly?: () => void;
  pending: boolean;
  idPrefix: string;
}

export function GoogleAdminTrust({
  clientId,
  lead,
  onRetry,
  onSendOnly,
  pending,
  idPrefix,
}: Readonly<GoogleAdminTrustProps>) {
  const titleId = `${idPrefix}-admin-trust-title`;
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-lg border border-border bg-muted/40 p-3 text-sm"
      data-testid="google-admin-trust"
    >
      <h3 id={titleId} className="font-medium text-foreground">
        Ask your Google Workspace admin to trust Aurora
      </h3>
      <p className="text-muted-foreground">
        {lead} Aurora logs the email leads and contacts send you once your Google Workspace admin
        trusts it. Until then, email you send still leaves from this mailbox.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-foreground">
        {ADMIN_TRUST_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {clientId && (
        <CopyField id={`${idPrefix}-google-client-id`} label="Aurora client ID" value={clientId} />
      )}
      {(onRetry || onSendOnly) && (
        <div className="flex flex-wrap gap-2">
          {onRetry && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onRetry}>
              Connect again
            </Button>
          )}
          {onSendOnly && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onSendOnly}
            >
              Connect for sending only
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
