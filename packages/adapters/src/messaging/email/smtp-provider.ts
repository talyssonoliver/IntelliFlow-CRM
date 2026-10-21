/**
 * SMTP transport for a user's own mailbox (PG-207, ADR-085).
 *
 * Connects only to the DNS-pinned public address of the configured host
 * (`resolvePublicHost`), on 465 (implicit TLS) or 587/2525 (STARTTLS required),
 * verifying the certificate against the original hostname. nodemailer's file
 * and URL access is disabled. Any failure is reduced to a MailboxTransportError
 * code; server responses, usernames and passwords are never propagated.
 */
import nodemailer from 'nodemailer';
import { SMTP_PORTS, type SmtpSecurityMode } from '@intelliflow/domain';
import { MailboxTransportError } from './mailbox-errors';
import { resolvePublicHost, type LookupFn } from './public-host';

export interface SmtpConnectionConfig {
  host: string;
  port: number;
  security: SmtpSecurityMode;
  username: string;
  password: string;
}

export interface SmtpEnvelope {
  from: string;
  to: string[];
}

interface SmtpTransporter {
  sendMail(message: { envelope: SmtpEnvelope; raw: Buffer }): Promise<{
    messageId?: string;
    /** Recipients the server refused at RCPT TO (nodemailer: string or { address }). */
    rejected?: Array<string | { address: string }>;
    /** One error per refused recipient, with the SMTP response code. */
    rejectedErrors?: Array<{ recipient?: string; responseCode?: number }>;
  }>;
  verify(): Promise<unknown>;
  close(): void;
}

type CreateTransport = (options: Record<string, unknown>) => SmtpTransporter;

export interface SmtpMailboxTransportDeps {
  createTransport?: CreateTransport;
  lookup?: LookupFn;
}

const RATE_LIMIT_CODES = new Set([421, 450, 451, 452]);

/** Reduces a nodemailer error to a code. The error's text is only inspected, never kept. */
export function mapSmtpError(error: unknown): MailboxTransportError {
  if (error instanceof MailboxTransportError) return error;
  const e = (error ?? {}) as { code?: string; responseCode?: number; message?: string };
  const message = String(e.message ?? '');
  if (e.code === 'EAUTH') return new MailboxTransportError('AUTH_FAILED');
  if (e.code === 'ETLS' || /certificate|self.signed|TLS/i.test(message)) {
    return new MailboxTransportError('TLS_FAILED');
  }
  if (e.code === 'ETIMEDOUT' || /timeout/i.test(message))
    return new MailboxTransportError('TIMEOUT');
  if (typeof e.responseCode === 'number' && RATE_LIMIT_CODES.has(e.responseCode)) {
    return new MailboxTransportError('RATE_LIMITED');
  }
  if (e.code === 'ECONNECTION' || e.code === 'ESOCKET' || e.code === 'EDNS') {
    return new MailboxTransportError('CONNECT_FAILED');
  }
  return new MailboxTransportError('REJECTED');
}

export class SmtpMailboxTransport {
  private readonly createTransport: CreateTransport;
  private readonly lookup: LookupFn | undefined;

  constructor(deps: SmtpMailboxTransportDeps = {}) {
    this.createTransport =
      deps.createTransport ??
      ((options) => nodemailer.createTransport(options) as unknown as SmtpTransporter);
    this.lookup = deps.lookup;
  }

  private async open(config: SmtpConnectionConfig): Promise<SmtpTransporter> {
    const pinned = await resolvePublicHost(config.host, config.port, {
      allowedPorts: SMTP_PORTS,
      lookup: this.lookup,
    });
    return this.createTransport({
      host: pinned.address,
      port: pinned.port,
      secure: config.security === 'SSL',
      requireTLS: config.security === 'STARTTLS',
      auth: { user: config.username, pass: config.password },
      tls: { servername: pinned.servername, minVersion: 'TLSv1.2' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  /** Authenticates without sending (Email Settings "Test connection"). */
  async verify(config: SmtpConnectionConfig): Promise<void> {
    const transporter = await this.open(config);
    try {
      await transporter.verify();
    } catch (error) {
      throw mapSmtpError(error);
    } finally {
      transporter.close();
    }
  }

  async send(
    config: SmtpConnectionConfig,
    envelope: SmtpEnvelope,
    raw: Buffer
  ): Promise<{
    providerMessageId: string | null;
    rejected: string[];
    /** The refused recipients whose refusal was temporary (4xx): not hard bounces. */
    rejectedTemporarily?: string[];
  }> {
    const transporter = await this.open(config);
    try {
      const info = await transporter.sendMail({ envelope, raw });
      // A server may accept some recipients and refuse others at RCPT TO; the
      // send then resolves, so the refused ones must be reported, not assumed sent.
      const rejected = (info.rejected ?? []).map((r) =>
        (typeof r === 'string' ? r : r.address).toLowerCase()
      );
      const temporary = (info.rejectedErrors ?? [])
        .filter((e) => typeof e.responseCode === 'number' && e.responseCode < 500)
        .map((e) => String(e.recipient ?? '').toLowerCase())
        .filter(Boolean);
      return {
        providerMessageId: info.messageId ?? null,
        rejected,
        ...(temporary.length > 0 ? { rejectedTemporarily: temporary } : {}),
      };
    } catch (error) {
      throw mapSmtpError(error);
    } finally {
      transporter.close();
    }
  }
}
