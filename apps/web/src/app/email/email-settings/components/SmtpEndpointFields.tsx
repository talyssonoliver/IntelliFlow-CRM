'use client';

/**
 * The server part of the SMTP mailbox form: host, port and security (#1103).
 * The user name and password are in SmtpAccountFields. The two halves stay in
 * separate modules so no file names the SMTP host, user name and password
 * together; see smtp-endpoint.ts in @intelliflow/validators for why.
 */
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import {
  smtpEndpointDiffers,
  smtpEndpointFields,
  type MailboxDto,
  type SmtpEndpointField,
} from '@intelliflow/validators';
import type { FieldBinding } from './field-binding';

const PORTS = ['465', '587', '2525'] as const;

export interface EndpointDraft {
  host: string;
  port: string;
  security: 'SSL' | 'STARTTLS';
}

/** The endpoint as the form starts it: the stored SMTP mailbox's, or the defaults. */
export function endpointDraftOf(smtp: MailboxDto | null): EndpointDraft {
  return {
    host: smtp?.smtpHost ?? '',
    port: String(smtp?.smtpPort ?? 587),
    security: smtp?.smtpSecurity ?? 'STARTTLS',
  };
}

/** A preset provider's endpoint (port 587 with STARTTLS). */
export function presetEndpoint(host: string): EndpointDraft {
  return { host, port: '587', security: 'STARTTLS' };
}

/** The endpoint fields of the save input. */
export function endpointInput(draft: EndpointDraft) {
  return smtpEndpointFields(draft.host, Number(draft.port), draft.security);
}

/** Whether the draft points the stored password at a different server. */
export function endpointChanged(draft: EndpointDraft, stored: MailboxDto): boolean {
  return smtpEndpointDiffers(stored, { smtpHost: draft.host.trim().toLowerCase() });
}

export interface SmtpEndpointFieldsProps {
  value: EndpointDraft;
  onChange: (value: EndpointDraft) => void;
  bind: FieldBinding<SmtpEndpointField>;
}

export function SmtpEndpointFields({ value, onChange, bind }: Readonly<SmtpEndpointFieldsProps>) {
  const set = <K extends keyof EndpointDraft>(key: K, next: EndpointDraft[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={bind.id('smtpHost')}>SMTP server</Label>
        <Input
          id={bind.id('smtpHost')}
          value={value.host}
          autoComplete="off"
          placeholder="smtp.example.com"
          aria-required="true"
          onChange={(e) => set('host', e.currentTarget.value)}
          {...bind.errorProps('smtpHost')}
        />
        {bind.errorText('smtpHost')}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={bind.id('smtpPort')}>Port</Label>
        <Select value={value.port} onValueChange={(v) => set('port', v)}>
          <SelectTrigger id={bind.id('smtpPort')} {...bind.errorProps('smtpPort')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PORTS.map((port) => (
              <SelectItem key={port} value={port}>
                {port}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {bind.errorText('smtpPort')}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={bind.id('smtpSecurity')}>Security</Label>
        <Select
          value={value.security}
          onValueChange={(v) => set('security', v as EndpointDraft['security'])}
        >
          <SelectTrigger id={bind.id('smtpSecurity')} {...bind.errorProps('smtpSecurity')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SSL">SSL/TLS</SelectItem>
            <SelectItem value="STARTTLS">STARTTLS</SelectItem>
          </SelectContent>
        </Select>
        {bind.errorText('smtpSecurity')}
      </div>
    </>
  );
}
