/**
 * The SMTP endpoint half of a mailbox: host, port and security mode (#1103).
 *
 * GitGuardian reports an SMTP host name, an SMTP user name and a password named
 * near each other as "SMTP credentials", even when no value is present, and our
 * secret scan mirrors it (.gitleaks/shared.toml, smtp-credential-fields). The
 * owner's rule: if GitGuardian would flag it, an adversary would too, and it gets
 * no allowlist. So the endpoint fields live here and the account fields (user
 * name, password) in smtp-account.ts. Code that needs both composes the two
 * helpers instead of naming all the fields in one place. The field names
 * themselves (API, database, form ids) do not change.
 */
import { z } from 'zod';
import { SMTP_PORTS, type SmtpSecurityMode } from '@intelliflow/domain';
import { mailboxHostSchema, smtpSecuritySchema } from './mailbox-fields';

/** The endpoint field names, in form order. */
export const SMTP_ENDPOINT_FIELDS = ['smtpHost', 'smtpPort', 'smtpSecurity'] as const;
export type SmtpEndpointField = (typeof SMTP_ENDPOINT_FIELDS)[number];

/** Zod shape of the endpoint fields in the SMTP mailbox save input. */
export const smtpEndpointInputShape = {
  smtpHost: mailboxHostSchema,
  smtpPort: z
    .number()
    .int()
    .refine((p) => (SMTP_PORTS as readonly number[]).includes(p), {
      message: `SMTP port must be one of ${SMTP_PORTS.join(', ')}`,
    }),
  smtpSecurity: smtpSecuritySchema,
};

/** The endpoint columns as stored (null for OAuth mailboxes). */
export interface SmtpEndpointRow {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: string | null;
}

/** What the API returns about the endpoint. Hidden from non-admins for the company mailbox. */
export interface SmtpEndpointDto {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecurity: SmtpSecurityMode | null;
}

/** An OAuth mailbox, or a hidden endpoint, has none. */
export const NO_SMTP_ENDPOINT: SmtpEndpointDto = Object.freeze({
  smtpHost: null,
  smtpPort: null,
  smtpSecurity: null,
});

/** The endpoint fields from their values. */
export function smtpEndpointFields(
  host: string,
  port: number,
  security: SmtpSecurityMode
): { smtpHost: string; smtpPort: number; smtpSecurity: SmtpSecurityMode } {
  return { smtpHost: host, smtpPort: port, smtpSecurity: security };
}

/** Just the endpoint fields of a row or input that carries more. */
export function pickSmtpEndpoint(source: SmtpEndpointRow): SmtpEndpointRow {
  return {
    smtpHost: source.smtpHost,
    smtpPort: source.smtpPort,
    smtpSecurity: source.smtpSecurity,
  };
}

/** The endpoint as the API shows it; `show: false` hides it. */
export function smtpEndpointDto(row: SmtpEndpointRow, show: boolean): SmtpEndpointDto {
  if (!show) return { ...NO_SMTP_ENDPOINT };
  return {
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecurity: row.smtpSecurity as SmtpSecurityMode | null,
  };
}

/** Whether a stored credential would go to a different server than it was entered for. */
export function smtpEndpointDiffers(
  stored: Pick<SmtpEndpointRow, 'smtpHost'>,
  next: Pick<SmtpEndpointRow, 'smtpHost'>
): boolean {
  return stored.smtpHost !== next.smtpHost;
}

/** Whether every endpoint field is set. */
export function hasSmtpEndpoint(row: SmtpEndpointRow): boolean {
  return Boolean(row.smtpHost && row.smtpPort && row.smtpSecurity);
}

/** The endpoint part of a transport connection config; unset fields become empty values. */
export function smtpEndpointConfig(row: SmtpEndpointRow): {
  host: string;
  port: number;
  security: SmtpSecurityMode;
} {
  return {
    host: row.smtpHost ?? '',
    port: row.smtpPort ?? 0,
    security: (row.smtpSecurity ?? 'STARTTLS') as SmtpSecurityMode,
  };
}
