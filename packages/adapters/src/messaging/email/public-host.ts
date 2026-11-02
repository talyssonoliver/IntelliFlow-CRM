import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPublicIpAddress } from '@intelliflow/domain';
import { MailboxTransportError } from './mailbox-errors';

export type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

export interface PinnedHost {
  /** The resolved, checked address to connect to (no second lookup). */
  address: string;
  family: number;
  /** The original hostname, for TLS SNI and certificate verification. */
  servername: string;
  port: number;
}

/**
 * Resolves a tenant-supplied mail-server host once and pins it (PG-207 CA-4).
 *
 * Every resolved address must be public: one private answer refuses the whole
 * host (no partial pinning), which defeats DNS rebinding and mixed answers.
 * The caller connects to `address` with `servername` set, so the certificate
 * is still verified against the hostname. IP-literal hosts are refused here
 * too (validators already refuse them at save time). Failures carry only a
 * code — the DNS error text is not propagated.
 */
export async function resolvePublicHost(
  host: string,
  port: number,
  options: { allowedPorts: readonly number[]; lookup?: LookupFn }
): Promise<PinnedHost> {
  if (!options.allowedPorts.includes(port) || isIP(host) !== 0) {
    throw new MailboxTransportError('CONNECT_FAILED');
  }

  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await (options.lookup ?? defaultLookup)(host);
  } catch {
    throw new MailboxTransportError('CONNECT_FAILED');
  }

  const first = answers[0];
  if (!first || answers.some((a) => !isPublicIpAddress(a.address))) {
    throw new MailboxTransportError('CONNECT_FAILED');
  }
  return { address: first.address, family: first.family, servername: host, port };
}
