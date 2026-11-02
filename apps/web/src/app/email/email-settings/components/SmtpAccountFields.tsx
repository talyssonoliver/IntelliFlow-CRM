'use client';

/**
 * The account part of the SMTP mailbox form: user name and password (#1103).
 * The server fields are in SmtpEndpointFields; see that module for why the two
 * are kept apart. Stored passwords are never loaded (see SecretField).
 */
import { Input, Label } from '@intelliflow/ui';
import {
  smtpAccountDiffers,
  smtpAccountFields,
  type MailboxDto,
  type SmtpAccountField,
} from '@intelliflow/validators';
import { SecretField, secretInput, type SecretChange } from './SecretField';
import type { FieldBinding } from './field-binding';

export interface AccountDraft {
  username: string;
  password: SecretChange;
}

/** Used when the schema's own message is a generic "too small" / "required". */
export const ACCOUNT_REQUIRED_MESSAGE: Partial<Record<SmtpAccountField, string>> = {
  smtpUsername: 'Enter the username.',
};

/** The account as the form starts it: a stored password is kept, never shown. */
export function accountDraftOf(smtp: MailboxDto | null): AccountDraft {
  return {
    username: smtp?.smtpUsername ?? '',
    password: smtp?.hasSmtpPassword ? { mode: 'keep' } : { mode: 'replace', value: '' },
  };
}

/** The account fields of the save input. */
export function accountInput(draft: AccountDraft) {
  return smtpAccountFields(draft.username, secretInput(draft.password));
}

/** Whether the draft would reuse the stored password for a different user name. */
export function accountChanged(draft: AccountDraft, stored: MailboxDto): boolean {
  return smtpAccountDiffers(stored, { smtpUsername: draft.username.trim() });
}

export interface SmtpAccountFieldsProps {
  value: AccountDraft;
  onChange: (value: AccountDraft) => void;
  bind: FieldBinding<SmtpAccountField>;
  /** A password is stored for this mailbox. */
  hasStored: boolean;
}

export function SmtpAccountFields({
  value,
  onChange,
  bind,
  hasStored,
}: Readonly<SmtpAccountFieldsProps>) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={bind.id('smtpUsername')}>Username</Label>
        <Input
          id={bind.id('smtpUsername')}
          value={value.username}
          autoComplete="off"
          aria-required="true"
          onChange={(e) => onChange({ ...value, username: e.currentTarget.value })}
          {...bind.errorProps('smtpUsername')}
        />
        {bind.errorText('smtpUsername')}
      </div>

      <SecretField
        id={bind.id('smtpPassword')}
        label="Password"
        hasStored={hasStored}
        value={value.password}
        onChange={(v) => onChange({ ...value, password: v })}
        error={bind.errorMessage('smtpPassword')}
        required
      />
    </>
  );
}
