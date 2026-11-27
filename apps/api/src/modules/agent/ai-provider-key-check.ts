/**
 * PG-199 BYOK: one cheap, read-only call that tells whether a provider accepts an API key.
 *
 * Fixed provider hosts only (no caller-supplied URL), a short timeout, and no redirect
 * following, so the key can only ever be sent to the provider it was entered for. The key is
 * sent in a header, never in a URL, and no message returned from here contains it.
 */
import type { AIKeyProvider } from '@intelliflow/validators';

export type KeyCheckResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'unavailable'; message: string };

const CHECK_TIMEOUT_MS = 8_000;

interface CheckRequest {
  url: string;
  headers: Record<string, string>;
  /** HTTP statuses that mean "this key is not accepted". */
  invalidStatuses: readonly number[];
}

function requestFor(provider: AIKeyProvider, apiKey: string): CheckRequest {
  switch (provider) {
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/models?limit=1',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        invalidStatuses: [401, 403],
      };
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/models',
        headers: { Authorization: `Bearer ${apiKey}` },
        // 403 is a restricted key without the models permission, not a wrong key.
        invalidStatuses: [401],
      };
    case 'openrouter':
      // /models is public and accepts any key; /auth/key answers 401 to a key it does not know.
      return {
        url: 'https://openrouter.ai/api/v1/auth/key',
        headers: { Authorization: `Bearer ${apiKey}` },
        invalidStatuses: [401, 403],
      };
  }
}

export async function checkProviderKey(
  provider: AIKeyProvider,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<KeyCheckResult> {
  const request = requestFor(provider, apiKey);
  let status: number;
  try {
    const response = await fetchImpl(request.url, {
      method: 'GET',
      headers: request.headers,
      redirect: 'error',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    status = response.status;
    // The body is not needed and may echo request details: drop it unread.
    await response.body?.cancel().catch(() => undefined);
  } catch {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Could not reach the provider to check the key. Try again in a moment.',
    };
  }
  if (status >= 200 && status < 300) return { ok: true };
  if (request.invalidStatuses.includes(status)) {
    return { ok: false, reason: 'invalid', message: 'The provider did not accept this key.' };
  }
  if (provider === 'openai' && status === 403) {
    return {
      ok: false,
      reason: 'unavailable',
      message:
        'The key was recognised but is not allowed to list models. Give it the "Models: Read" permission, or use an unrestricted key.',
    };
  }
  return {
    ok: false,
    reason: 'unavailable',
    message: `The provider could not check the key right now (HTTP ${status}). Try again in a moment.`,
  };
}
