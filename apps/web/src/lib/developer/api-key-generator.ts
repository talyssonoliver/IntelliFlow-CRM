export type ApiKeyScope = 'read' | 'write' | 'admin';

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  maskedKey: string;
  createdAt: string;
  lastUsed: string | null;
  scopes: ApiKeyScope[];
}

export interface GenerateApiKeyOptions {
  name: string;
  environment: 'production' | 'sandbox';
  scopes: ApiKeyScope[];
}

export function generateApiKey(options: GenerateApiKeyOptions): ApiKey {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const prefix = options.environment === 'production' ? 'live' : 'test';
  const key = `ifc_${prefix}_${hex}`;

  return {
    id: crypto.randomUUID(),
    name: options.name,
    key,
    maskedKey: maskApiKey(key),
    createdAt: new Date().toISOString(),
    lastUsed: null,
    scopes: options.scopes,
  };
}

export function maskApiKey(key: string): string {
  if (key.length <= 4) {
    return key;
  }
  const prefixMatch = key.match(/^(?:ifc_(?:live|test)|cs_(?:prod|test)|cli_(?:prod|test))_/);
  if (prefixMatch) {
    const prefix = prefixMatch[0];
    const rest = key.slice(prefix.length);
    if (rest.length <= 4) {
      return `${prefix}${rest}`;
    }
    const lastFour = rest.slice(-4);
    const maskedLength = rest.length - 4;
    return `${prefix}${'•'.repeat(maskedLength)}${lastFour}`;
  }
  const lastFour = key.slice(-4);
  const maskedLength = key.length - 4;
  return `${'•'.repeat(maskedLength)}${lastFour}`;
}
