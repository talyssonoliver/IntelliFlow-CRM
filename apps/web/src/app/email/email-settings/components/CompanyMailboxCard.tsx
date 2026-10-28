'use client';

/**
 * Company mailbox (PG-207, owner ruling Q7): one tenant mailbox that admins
 * connect, and the switch that lets members without their own mailbox send
 * from it. The switch is part of the settings save; the connection actions
 * are immediate and shown to admins only.
 */
import { Card, Label, Switch } from '@intelliflow/ui';
import type { MailboxDto, OAuthProvidersAvailableDto } from '@intelliflow/validators';
import { SectionHeader } from '@/components/shared/section-header';
import { MailboxConnection } from './MyMailboxCard';

const TITLE_ID = 'email-settings-company-mailbox-title';
const SWITCH_ID = 'email-settings-allow-fallback';

export interface CompanyMailboxCardProps {
  canEdit: boolean;
  /** The company mailbox (admins only; null for members or when none). */
  mailbox: MailboxDto | null;
  providersAvailable: OAuthProvidersAvailableDto;
  allowFallback: boolean;
  onAllowFallbackChange: (value: boolean) => void;
  /** Shown to members when the fallback is on. */
  companyMailboxAddress: string | null;
  onChanged: () => void;
  announce: (message: string) => void;
  /** Id of the page's "Managed by your admin" note, for disabled controls. */
  readOnlyNoteId: string;
}

export function CompanyMailboxCard({
  canEdit,
  mailbox,
  providersAvailable,
  allowFallback,
  onAllowFallbackChange,
  companyMailboxAddress,
  onChanged,
  announce,
  readOnlyNoteId,
}: Readonly<CompanyMailboxCardProps>) {
  const memberLine =
    allowFallback && companyMailboxAddress
      ? `If you have no mailbox of your own, your email is sent from ${companyMailboxAddress}.`
      : 'Members need to connect their own mailbox to send email.';

  return (
    <section aria-labelledby={TITLE_ID} className="lg:col-span-6">
      <Card className="h-full p-4 sm:p-5 space-y-4">
        <SectionHeader
          icon="domain"
          iconBg="bg-indigo-100 dark:bg-indigo-900/30"
          iconFg="text-indigo-700 dark:text-indigo-300"
          title="Company mailbox"
          titleId={TITLE_ID}
          headingLevel={2}
          focusableTitle
          description="A shared mailbox for members who have not connected their own."
        />

        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor={SWITCH_ID}>Members without their own mailbox can send from it</Label>
            <p id={`${SWITCH_ID}-help`} className="text-xs text-muted-foreground">
              Admins without their own mailbox can always send from it.
            </p>
          </div>
          <Switch
            id={SWITCH_ID}
            checked={allowFallback}
            disabled={!canEdit}
            aria-describedby={canEdit ? `${SWITCH_ID}-help` : `${SWITCH_ID}-help ${readOnlyNoteId}`}
            onCheckedChange={onAllowFallbackChange}
          />
        </div>

        {canEdit ? (
          <MailboxConnection
            scope="TENANT"
            headingId={TITLE_ID}
            mailbox={mailbox}
            providersAvailable={providersAvailable}
            disconnectConsequence={
              allowFallback
                ? 'Members without their own mailbox will not be able to send until it is connected again.'
                : 'Only admins send from it, so nobody else is affected.'
            }
            onChanged={onChanged}
            announce={announce}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{memberLine}</p>
        )}
      </Card>
    </section>
  );
}
