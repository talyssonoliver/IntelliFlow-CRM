'use client';

/**
 * The tenant-wide cards of Email Settings that the page's Save stores
 * (PG-207): reply-to, tracking, bounce handling, plus the link to signatures.
 * Members see them read-only; every disabled control points at the page's
 * "Managed by your admin" note.
 */
import Link from 'next/link';
import { Card, Input, Label, RadioGroup, RadioGroupItem, Switch } from '@intelliflow/ui';
import { SectionHeader } from '@/components/shared/section-header';

export const REPLY_TO_ID = 'email-settings-reply-to';
export const SOFT_THRESHOLD_ID = 'email-settings-soft-threshold';

interface ReadOnlyProps {
  readOnly: boolean;
  readOnlyNoteId: string;
}

/** aria-describedby: the given ids, plus the read-only note when the control is locked. */
function describedBy(ids: Array<string | null | undefined>, ro: ReadOnlyProps): string {
  return [...ids, ro.readOnly ? ro.readOnlyNoteId : null].filter(Boolean).join(' ');
}

function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}

export function ReplyToCard({
  value,
  onChange,
  error,
  ...ro
}: Readonly<{ value: string; onChange: (value: string) => void; error?: string } & ReadOnlyProps>) {
  const titleId = 'email-settings-reply-to-title';
  return (
    <section aria-labelledby={titleId} className="lg:col-span-6">
      <Card className="h-full p-4 sm:p-5">
        <SectionHeader
          icon="reply"
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconFg="text-emerald-700 dark:text-emerald-300"
          title="Reply-to"
          titleId={titleId}
          headingLevel={2}
          description="Where replies to anyone's email go."
        />
        <div className="space-y-1.5">
          <Label htmlFor={REPLY_TO_ID}>Reply-to address</Label>
          <Input
            id={REPLY_TO_ID}
            type="email"
            value={value}
            disabled={ro.readOnly}
            placeholder="Add a shared reply address"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(
              [error ? `${REPLY_TO_ID}-error` : null, `${REPLY_TO_ID}-help`],
              ro
            )}
            onChange={(e) => onChange(e.currentTarget.value)}
          />
          <FieldError id={`${REPLY_TO_ID}-error`} message={error} />
          <p id={`${REPLY_TO_ID}-help`} className="text-xs text-muted-foreground">
            Leave empty to send replies to whoever sent the email.
          </p>
        </div>
      </Card>
    </section>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  onChange,
  help,
  ...ro
}: Readonly<
  {
    id: string;
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
    help?: string;
  } & ReadOnlyProps
>) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {help && (
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            {help}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={ro.readOnly}
        aria-describedby={describedBy([help ? `${id}-help` : null], ro) || undefined}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function TrackingCard({
  trackOpens,
  trackClicks,
  onChange,
  ...ro
}: Readonly<
  {
    trackOpens: boolean;
    trackClicks: boolean;
    onChange: (patch: { trackOpens?: boolean; trackClicks?: boolean }) => void;
  } & ReadOnlyProps
>) {
  const titleId = 'email-settings-tracking-title';
  return (
    <section aria-labelledby={titleId} className="lg:col-span-6">
      <Card className="h-full p-4 sm:p-5 space-y-4">
        <SectionHeader
          icon="monitoring"
          iconBg="bg-amber-100 dark:bg-amber-900/30"
          iconFg="text-amber-700 dark:text-amber-300"
          title="Tracking"
          titleId={titleId}
          headingLevel={2}
          description="Saved now. Opens and clicks are recorded once tracking is released."
        />
        <SwitchRow
          id="email-settings-track-opens"
          label="Track opens"
          checked={trackOpens}
          onChange={(v) => onChange({ trackOpens: v })}
          {...ro}
        />
        <SwitchRow
          id="email-settings-track-clicks"
          label="Track clicks"
          checked={trackClicks}
          onChange={(v) => onChange({ trackClicks: v })}
          {...ro}
        />
      </Card>
    </section>
  );
}

export interface BounceRulesValue {
  hardBounceAction: 'SUPPRESS' | 'NONE';
  softBounceThreshold: string;
  notifySenderOnBounce: boolean;
}

export function BounceRulesCard({
  value,
  onChange,
  thresholdError,
  min,
  max,
  ...ro
}: Readonly<
  {
    value: BounceRulesValue;
    onChange: (patch: Partial<BounceRulesValue>) => void;
    thresholdError?: string;
    min: number;
    max: number;
  } & ReadOnlyProps
>) {
  const titleId = 'email-settings-bounce-title';
  const groupLabelId = 'email-settings-hard-bounce-label';
  return (
    <section aria-labelledby={titleId} className="lg:col-span-6">
      <Card className="h-full p-4 sm:p-5 space-y-4">
        <SectionHeader
          icon="mark_email_unread"
          iconBg="bg-rose-100 dark:bg-rose-900/30"
          iconFg="text-rose-700 dark:text-rose-300"
          title="Bounce handling"
          titleId={titleId}
          headingLevel={2}
          description="What happens when email cannot be delivered."
        />
        <div className="space-y-2">
          <p id={groupLabelId} className="text-sm font-medium text-foreground">
            When an address hard-bounces
          </p>
          <RadioGroup
            aria-labelledby={groupLabelId}
            value={value.hardBounceAction}
            disabled={ro.readOnly}
            onValueChange={(v) =>
              onChange({ hardBounceAction: v as BounceRulesValue['hardBounceAction'] })
            }
          >
            {(
              [
                ['SUPPRESS', 'Add it to the suppression list'],
                ['NONE', 'Only record the bounce'],
              ] as const
            ).map(([option, label]) => (
              <div key={option} className="flex items-center gap-2">
                <RadioGroupItem
                  id={`email-settings-hard-bounce-${option.toLowerCase()}`}
                  value={option}
                  aria-describedby={ro.readOnly ? ro.readOnlyNoteId : undefined}
                />
                <Label htmlFor={`email-settings-hard-bounce-${option.toLowerCase()}`}>
                  {label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor={SOFT_THRESHOLD_ID}>Soft bounces before suppressing</Label>
          <Input
            id={SOFT_THRESHOLD_ID}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={value.softBounceThreshold}
            disabled={ro.readOnly}
            aria-invalid={thresholdError ? true : undefined}
            aria-describedby={describedBy(
              [thresholdError ? `${SOFT_THRESHOLD_ID}-error` : null, `${SOFT_THRESHOLD_ID}-help`],
              ro
            )}
            onChange={(e) => onChange({ softBounceThreshold: e.currentTarget.value })}
          />
          <FieldError id={`${SOFT_THRESHOLD_ID}-error`} message={thresholdError} />
          <p id={`${SOFT_THRESHOLD_ID}-help`} className="text-xs text-muted-foreground">
            Soft bounces for one address within 30 days before it is suppressed.
          </p>
        </div>
        <SwitchRow
          id="email-settings-notify-sender"
          label="Notify the sender when their email bounces"
          checked={value.notifySenderOnBounce}
          onChange={(v) => onChange({ notifySenderOnBounce: v })}
          {...ro}
        />
      </Card>
    </section>
  );
}

export function SignaturesLinkCard() {
  const titleId = 'email-settings-signatures-title';
  return (
    <section aria-labelledby={titleId} className="lg:col-span-6">
      <Card className="h-full p-4 sm:p-5">
        <SectionHeader
          icon="draw"
          iconBg="bg-violet-100 dark:bg-violet-900/30"
          iconFg="text-violet-700 dark:text-violet-300"
          title="Signatures"
          titleId={titleId}
          headingLevel={2}
          description="Personal and organisation signatures, added when you write a new email."
        />
        <Link
          href="/email/signatures"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          <span className="underline-offset-4 hover:underline">Manage Signatures</span>
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            arrow_forward
          </span>
        </Link>
      </Card>
    </section>
  );
}
