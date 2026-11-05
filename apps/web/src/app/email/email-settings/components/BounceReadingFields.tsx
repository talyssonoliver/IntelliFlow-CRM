'use client';

/**
 * The optional part of the mailbox form: signing in to read bounce reports. A
 * sending service has no mailbox to read, so the form leaves this out for one.
 */
import { Checkbox, Input, Label } from '@intelliflow/ui';
import { SecretField, type SecretChange } from './SecretField';
import type { FieldBinding } from './field-binding';

export type BounceReadingField = 'imapHost' | 'imapUsername' | 'imapPassword';

export interface BounceReadingFieldsProps {
  idPrefix: string;
  bind: FieldBinding<BounceReadingField>;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  host: string;
  onHostChange: (host: string) => void;
  username: string;
  onUsernameChange: (username: string) => void;
  secret: SecretChange;
  onSecretChange: (secret: SecretChange) => void;
  /** A password for reading is saved. */
  hasStored: boolean;
}

export function BounceReadingFields({
  idPrefix,
  bind,
  enabled,
  onEnabledChange,
  host,
  onHostChange,
  username,
  onUsernameChange,
  secret,
  onSecretChange,
  hasStored,
}: Readonly<BounceReadingFieldsProps>) {
  const toggleId = `${idPrefix}-read-bounces`;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-start gap-2">
        <Checkbox
          id={toggleId}
          checked={enabled}
          onCheckedChange={(v) => onEnabledChange(v === true)}
          aria-describedby={`${toggleId}-help`}
        />
        <div>
          <Label htmlFor={toggleId}>Read bounce reports (optional)</Label>
          <p id={`${toggleId}-help`} className="text-xs text-muted-foreground">
            Only bounce reports are read, to keep failed addresses off your lists. No other mail is
            stored. Without this your email still sends, but addresses that bounce are not taken off
            your lists automatically.
          </p>
        </div>
      </div>
      {enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={bind.id('imapHost')}>Server for reading mail (IMAP)</Label>
            <Input
              id={bind.id('imapHost')}
              value={host}
              autoComplete="off"
              aria-required="true"
              onChange={(e) => onHostChange(e.currentTarget.value)}
              {...bind.errorProps('imapHost')}
            />
            {bind.errorText('imapHost')}
            <p className="text-xs text-muted-foreground">Port 993 (SSL/TLS)</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={bind.id('imapUsername')}>Sign-in name for reading</Label>
            <Input
              id={bind.id('imapUsername')}
              value={username}
              autoComplete="off"
              aria-required="true"
              onChange={(e) => onUsernameChange(e.currentTarget.value)}
              {...bind.errorProps('imapUsername')}
            />
            {bind.errorText('imapUsername')}
          </div>
          <SecretField
            id={bind.id('imapPassword')}
            label="Password for reading (blank uses the one above)"
            hasStored={hasStored}
            value={secret}
            onChange={onSecretChange}
            error={bind.errorMessage('imapPassword')}
          />
        </div>
      )}
    </div>
  );
}
