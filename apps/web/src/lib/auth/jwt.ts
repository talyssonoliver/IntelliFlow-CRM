export interface JwtPayload {
  exp?: number;
  sub?: string;
  [key: string]: unknown;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }

  return Buffer.from(padded, 'base64').toString('utf-8');
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

export function getTokenExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (typeof payload?.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return null;
  }

  return payload.exp * 1000;
}

export function isTokenUsable(token: string | null, bufferMs: number = 30_000): token is string {
  if (!token) return false;

  const expiryMs = getTokenExpiryMs(token);
  if (expiryMs === null) return false;

  return Date.now() < expiryMs - bufferMs;
}

export function getTokenMaxAgeSeconds(
  token: string,
  expiryBufferMs: number = 30_000
): number | null {
  const expiryMs = getTokenExpiryMs(token);
  if (expiryMs === null) return null;

  return Math.max(0, Math.floor((expiryMs - Date.now() - expiryBufferMs) / 1000));
}
