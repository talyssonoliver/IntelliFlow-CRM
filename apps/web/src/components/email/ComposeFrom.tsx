'use client';

import Link from 'next/link';
import type { SendingIdentityDto } from '@intelliflow/validators';
import { BreakableAddress } from './BreakableAddress';
import { EMAIL_SETTINGS_HREF } from './send-errors';

/**
 * Who this message will be sent from, or what stops it being sent, before the user
 * has written it. Says nothing until the server has answered.
 */
export function ComposeFrom({
  identity,
  onLeave,
}: Readonly<{
  identity: SendingIdentityDto | undefined;
  /** Follows the link once the draft is saved. */
  onLeave: (href: string) => void;
}>) {
  if (!identity) return null;
  if (identity.refusal) {
    const broken = identity.refusal === 'MAILBOX_ERROR';
    return (
      <div className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className="w-8 text-muted-foreground">From</span>
        <span className="text-foreground">
          {broken ? 'Your mailbox needs attention.' : 'No mailbox connected yet.'}
        </span>
        <Link
          href={EMAIL_SETTINGS_HREF}
          className="font-medium text-primary underline underline-offset-4"
          onClick={(event) => {
            event.preventDefault();
            onLeave(EMAIL_SETTINGS_HREF);
          }}
        >
          {broken ? 'Open Email Settings' : 'Connect your mailbox'}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-8 shrink-0 text-muted-foreground">From</span>
      <span className="min-w-0 text-foreground [overflow-wrap:anywhere]">
        {identity.name ? `${identity.name} <` : null}
        <BreakableAddress address={identity.address ?? ''} />
        {identity.name ? '>' : null}
        {identity.scope === 'TENANT' ? (
          <span className="ml-2 text-muted-foreground">(company mailbox)</span>
        ) : null}
      </span>
    </div>
  );
}
