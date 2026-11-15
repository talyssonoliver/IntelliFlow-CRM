/**
 * What differs per OAuth provider when a mailbox is connected, checked or disconnected
 * (PG-207; Zoho added for MVP-001). The router keeps the flow (state, PKCE, writes, audit);
 * this file knows each provider: Google and Microsoft through OAuthMailboxClient, Zoho through
 * ZohoMailboxClient, which also needs the account's data centre and Mail account id.
 */
import { MailboxTransportError } from '@intelliflow/adapters';
import type { OAuthMailboxProvider } from '@intelliflow/domain';
import { getOAuthAccess, type MailboxTransports, type TransportMailbox } from './mailbox-transport';

/** Scopes without which a connected mailbox could not do its job (send; Microsoft: bounces). */
const REQUIRED_SCOPES: Record<OAuthMailboxProvider, readonly string[]> = {
  GMAIL: ['gmail.send'],
  MICROSOFT: ['Mail.Send', 'Mail.Read'],
  ZOHO: ['ZohoMail.messages.CREATE', 'ZohoMail.accounts.READ'],
};

/**
 * Whether the user granted what the mailbox needs (Google lets users untick scopes).
 * Providers report scopes as bare names or full URIs, so a granted scope matches on its last
 * path segment. An empty list (scope not reported) cannot be checked and is accepted; a
 * missing scope then surfaces as a coded send or scan failure.
 */
export function hasRequiredScopes(provider: OAuthMailboxProvider, granted: string[]): boolean {
  if (granted.length === 0) return true;
  const names = new Set(granted.map((scope) => scope.split('/').pop()?.toLowerCase()));
  return REQUIRED_SCOPES[provider].every((scope) => names.has(scope.toLowerCase()));
}

/** The provider's consent URL, or null when it is not configured on this server. */
export function connectStartUrl(
  transports: MailboxTransports,
  provider: OAuthMailboxProvider,
  args: { state: string; codeChallenge: string }
): string | null {
  if (provider === 'ZOHO') return transports.zoho?.authorizationUrl(args) ?? null;
  return transports.oauth(provider)?.authorizationUrl(args) ?? null;
}

export interface ConnectedAccount {
  refreshToken: string;
  scopes: string[];
  /** The provider-verified address: the only From this mailbox may use. */
  address: string;
  /** Zoho only: where the account lives; null columns for the others. */
  oauthAccountId: string | null;
  oauthApiDomain: string | null;
  /** Gives the grant back (best effort), when it is not stored after all. */
  giveBack: () => Promise<void>;
}

/** Exchanges the code and proves the account. Throws MailboxTransportError codes. */
export async function connectAccount(
  transports: MailboxTransports,
  provider: OAuthMailboxProvider,
  input: { code: string; verifier: string; accountsServer: string | null },
  now: Date
): Promise<ConnectedAccount> {
  if (provider === 'ZOHO') {
    const zoho = transports.zoho;
    if (!zoho) throw new MailboxTransportError('CONNECT_FAILED');
    const tokens = await zoho.exchangeCode(input.code, input.verifier, now, input.accountsServer);
    const giveBack = () => zoho.revoke(tokens.refreshToken, tokens.mailHost);
    const identity = await zoho.identity(tokens.accessToken, tokens.mailHost).catch(async (e) => {
      await giveBack().catch(() => undefined);
      throw e;
    });
    return {
      refreshToken: tokens.refreshToken,
      scopes: tokens.scopes,
      address: identity.address,
      oauthAccountId: identity.accountId,
      oauthApiDomain: tokens.mailHost,
      giveBack,
    };
  }
  const client = transports.oauth(provider);
  if (!client) throw new MailboxTransportError('CONNECT_FAILED');
  const tokens = await client.exchangeCode(input.code, input.verifier, now);
  const address = await client.accountAddress(tokens.accessToken);
  return {
    refreshToken: tokens.refreshToken,
    scopes: tokens.scopes,
    address,
    oauthAccountId: null,
    oauthApiDomain: null,
    giveBack: () => client.revoke(tokens.refreshToken),
  };
}

/**
 * Proves a connected OAuth mailbox still works: a fresh access token, then the account read.
 * Returns the credential version tested (a refresh may rotate it on).
 */
export async function checkOAuthMailbox(
  prisma: Parameters<typeof getOAuthAccess>[0],
  row: TransportMailbox,
  transports: MailboxTransports,
  now: Date
): Promise<number> {
  if (row.kind === 'ZOHO') {
    if (!transports.zoho) throw new MailboxTransportError('CONNECT_FAILED');
    const access = await getOAuthAccess(prisma, row, transports, now);
    await transports.zoho.identity(access.accessToken, row.oauthApiDomain ?? '');
    return access.tokenVersion;
  }
  const client = transports.oauth(row.kind as OAuthMailboxProvider);
  if (!client) throw new MailboxTransportError('CONNECT_FAILED');
  const access = await getOAuthAccess(prisma, row, transports, now);
  await client.accountAddress(access.accessToken);
  return access.tokenVersion;
}

/** Best effort: revokes a disconnected mailbox's grant at its provider. */
export async function revokeGrant(
  transports: MailboxTransports,
  row: Pick<TransportMailbox, 'kind' | 'refreshToken' | 'oauthApiDomain'>
): Promise<void> {
  if (row.kind === 'SMTP' || !row.refreshToken) return;
  const revoking =
    row.kind === 'ZOHO'
      ? transports.zoho?.revoke(row.refreshToken, row.oauthApiDomain ?? '')
      : transports.oauth(row.kind as OAuthMailboxProvider)?.revoke(row.refreshToken);
  await revoking?.catch(() => undefined);
}
