// SECURITY NOTE (SR-02): Client-side credential generation is for Sprint 15
// static demo only. Production MUST move generation to server-side with
// hash-only storage. See docs/planning/prd-developer-portal.md

import { maskApiKey } from './api-key-generator';

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  maskedSecret: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateOAuthCredentials(
  environment: 'production' | 'sandbox'
): OAuthCredentials {
  const prefix = environment === 'production' ? 'prod' : 'test';

  const idBytes = new Uint8Array(16);
  crypto.getRandomValues(idBytes);
  const clientId = `cli_${prefix}_${bytesToHex(idBytes)}`;

  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const clientSecret = `cs_${prefix}_${bytesToHex(secretBytes)}`;

  const maskedSecret = maskApiKey(clientSecret);

  return { clientId, clientSecret, maskedSecret };
}

export function isValidWebhookUrl(
  url: string,
  environment: 'production' | 'sandbox'
): string | null {
  if (url.trim() === '') {
    return null;
  }

  const lower = url.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('file:')) {
    return 'Invalid URL protocol';
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }

  if (environment === 'production') {
    if (parsed.protocol !== 'https:') {
      return 'Production webhooks require HTTPS';
    }
  } else {
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return 'Webhook URL must use HTTP or HTTPS';
    }
  }

  return null;
}
