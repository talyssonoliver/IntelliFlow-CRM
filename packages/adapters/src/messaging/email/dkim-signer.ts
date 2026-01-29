/**
 * DKIM (DomainKeys Identified Mail) Signer
 *
 * Handles cryptographic signing of outbound emails for authentication:
 * - RSA-SHA256 signature generation
 * - Canonicalization (relaxed/relaxed)
 * - Header and body hashing
 * - Key rotation support
 *
 * RFC 6376 compliant implementation
 */

import { createSign, createHash, createPrivateKey, KeyObject } from 'crypto';
import { z } from 'zod';

// DKIM configuration schema
export const DkimConfigSchema = z.object({
  domain: z.string().min(1),
  selector: z.string().min(1),
  privateKey: z.string().min(1),
  keyId: z.string().optional(),
  algorithm: z.enum(['rsa-sha256', 'rsa-sha1', 'ed25519-sha256']).default('rsa-sha256'),
  canonicalization: z.object({
    header: z.enum(['relaxed', 'simple']).default('relaxed'),
    body: z.enum(['relaxed', 'simple']).default('relaxed'),
  }).default({ header: 'relaxed', body: 'relaxed' }),
  headersToSign: z.array(z.string()).optional(),
  bodyLengthLimit: z.number().optional(),
  expirationSeconds: z.number().optional(),
});

export type DkimConfig = z.infer<typeof DkimConfigSchema>;

// Default headers to sign (in order of priority)
const DEFAULT_HEADERS_TO_SIGN = [
  'from',
  'to',
  'cc',
  'subject',
  'date',
  'message-id',
  'reply-to',
  'mime-version',
  'content-type',
  'content-transfer-encoding',
  'in-reply-to',
  'references',
  'list-unsubscribe',
];

// DKIM signature result
export interface DkimSignatureResult {
  header: string;
  domain: string;
  selector: string;
  bodyHash: string;
  signature: string;
  timestamp: number;
  expiration?: number;
}

// Verification result
export interface DkimVerificationResult {
  valid: boolean;
  domain?: string;
  selector?: string;
  error?: string;
  details?: {
    bodyHashMatch: boolean;
    signatureValid: boolean;
    headerCanonicalized: string;
  };
}

/**
 * Relaxed canonicalization for headers (RFC 6376 Section 3.4.2)
 */
export function canonicalizeHeaderRelaxed(header: string): string {
  // Unfold header (remove CRLF followed by whitespace)
  let result = header.replace(/\r?\n[\t ]+/g, ' ');

  // Convert header name to lowercase
  const colonIndex = result.indexOf(':');
  if (colonIndex > 0) {
    const name = result.slice(0, colonIndex).toLowerCase().trim();
    let value = result.slice(colonIndex + 1);

    // Reduce whitespace to single space
    value = value.replace(/[\t ]+/g, ' ').trim();

    result = `${name}:${value}`;
  }

  return result;
}

/**
 * Simple canonicalization for headers (RFC 6376 Section 3.4.1)
 */
export function canonicalizeHeaderSimple(header: string): string {
  // No changes required for simple canonicalization
  return header;
}

/**
 * Relaxed canonicalization for body (RFC 6376 Section 3.4.4)
 */
export function canonicalizeBodyRelaxed(body: string): string {
  // Split into lines
  const lines = body.split(/\r?\n/);

  // Process each line
  const processedLines = lines.map(line => {
    // Reduce whitespace to single space
    let processed = line.replace(/[\t ]+/g, ' ');
    // Remove trailing whitespace
    processed = processed.trimEnd();
    return processed;
  });

  // Join with CRLF
  let result = processedLines.join('\r\n');

  // Remove trailing empty lines
  result = result.replace(/(\r\n)+$/, '');

  // Ensure single trailing CRLF
  result = result + '\r\n';

  return result;
}

/**
 * Simple canonicalization for body (RFC 6376 Section 3.4.3)
 */
export function canonicalizeBodySimple(body: string): string {
  // Ensure CRLF line endings
  let result = body.replace(/\r?\n/g, '\r\n');

  // Remove trailing empty lines (keep one CRLF)
  result = result.replace(/(\r\n)+$/, '\r\n');

  // If body is empty, return CRLF
  if (!result || result === '\r\n') {
    return '\r\n';
  }

  return result;
}

/**
 * Parse email into headers and body
 */
export function parseEmailParts(rawEmail: string): { headers: string; body: string } {
  // Normalize line endings
  const normalized = rawEmail.replace(/\r?\n/g, '\r\n');

  // Find header/body separator
  const separator = normalized.indexOf('\r\n\r\n');
  if (separator === -1) {
    return { headers: normalized, body: '' };
  }

  return {
    headers: normalized.slice(0, separator),
    body: normalized.slice(separator + 4),
  };
}

/**
 * Parse headers into array of { name, value } objects
 */
export function parseHeaderLines(headers: string): Array<{ name: string; value: string; raw: string }> {
  const result: Array<{ name: string; value: string; raw: string }> = [];
  const lines = headers.split(/\r?\n/);

  let currentHeader: { name: string; value: string; raw: string } | null = null;

  for (const line of lines) {
    if (line.match(/^[\t ]/)) {
      // Continuation of previous header
      if (currentHeader) {
        currentHeader.value += ' ' + line.trim();
        currentHeader.raw += '\r\n' + line;
      }
    } else {
      // New header
      if (currentHeader) {
        result.push(currentHeader);
      }

      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        currentHeader = {
          name: line.slice(0, colonIndex).trim(),
          value: line.slice(colonIndex + 1).trim(),
          raw: line,
        };
      } else {
        currentHeader = null;
      }
    }
  }

  if (currentHeader) {
    result.push(currentHeader);
  }

  return result;
}

/**
 * Wrap base64 signature at 76 characters for DKIM header
 */
function wrapSignature(sig: string, lineLength = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < sig.length; i += lineLength) {
    lines.push(sig.slice(i, i + lineLength));
  }
  return lines.join('\r\n        ');
}

/**
 * DKIM Signer class
 */
export class DkimSigner {
  private config: DkimConfig;
  private privateKey: KeyObject;

  constructor(config: DkimConfig) {
    this.config = DkimConfigSchema.parse(config);

    // Parse private key
    try {
      this.privateKey = createPrivateKey({
        key: this.config.privateKey,
        format: 'pem',
      });
    } catch (error) {
      throw new Error(`Invalid DKIM private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sign an email message
   */
  sign(rawEmail: string): DkimSignatureResult {
    const { headers, body } = parseEmailParts(rawEmail);
    const headerList = parseHeaderLines(headers);
    const canonicalization = this.config.canonicalization;

    // Canonicalize body
    const canonicalizedBody = canonicalization.body === 'relaxed'
      ? canonicalizeBodyRelaxed(body)
      : canonicalizeBodySimple(body);

    // Apply body length limit if specified
    const bodyToHash = this.config.bodyLengthLimit
      ? canonicalizedBody.slice(0, this.config.bodyLengthLimit)
      : canonicalizedBody;

    // Compute body hash
    const bodyHash = createHash('sha256')
      .update(bodyToHash)
      .digest('base64');

    // Determine which headers to sign
    const headersToSign = this.config.headersToSign || DEFAULT_HEADERS_TO_SIGN;
    const signedHeaderNames: string[] = [];
    const canonicalizedHeaders: string[] = [];

    // Find and canonicalize headers to sign
    for (const headerName of headersToSign) {
      const headerLower = headerName.toLowerCase();
      const found = headerList.find(h => h.name.toLowerCase() === headerLower);

      if (found) {
        signedHeaderNames.push(found.name.toLowerCase());
        const canonicalized = canonicalization.header === 'relaxed'
          ? canonicalizeHeaderRelaxed(`${found.name}:${found.value}`)
          : canonicalizeHeaderSimple(`${found.name}:${found.value}`);
        canonicalizedHeaders.push(canonicalized);
      }
    }

    // Generate timestamp and expiration
    const timestamp = Math.floor(Date.now() / 1000);
    const expiration = this.config.expirationSeconds
      ? timestamp + this.config.expirationSeconds
      : undefined;

    // Build DKIM-Signature header value (without signature)
    const dkimParts = [
      `v=1`,
      `a=${this.config.algorithm}`,
      `c=${canonicalization.header}/${canonicalization.body}`,
      `d=${this.config.domain}`,
      `s=${this.config.selector}`,
      `t=${timestamp}`,
    ];

    if (expiration) {
      dkimParts.push(`x=${expiration}`);
    }

    if (this.config.bodyLengthLimit) {
      dkimParts.push(`l=${this.config.bodyLengthLimit}`);
    }

    dkimParts.push(`h=${signedHeaderNames.join(':')}`);
    dkimParts.push(`bh=${bodyHash}`);
    dkimParts.push(`b=`); // Placeholder for signature

    const dkimHeaderValue = dkimParts.join('; ');
    const dkimHeaderForSigning = `dkim-signature:${dkimHeaderValue}`;

    // Canonicalize DKIM-Signature header
    const canonicalizedDkimHeader = canonicalization.header === 'relaxed'
      ? canonicalizeHeaderRelaxed(dkimHeaderForSigning)
      : canonicalizeHeaderSimple(dkimHeaderForSigning);

    // Build signing input
    const signingInput = [...canonicalizedHeaders, canonicalizedDkimHeader].join('\r\n');

    // Sign
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = signer.sign(this.privateKey, 'base64');

    // Build final DKIM-Signature header
    const wrappedSignature = wrapSignature(signature);
    const finalDkimParts = [...dkimParts.slice(0, -1), `b=${wrappedSignature}`];
    const finalDkimHeader = `DKIM-Signature: ${finalDkimParts.join(';\r\n        ')}`;

    return {
      header: finalDkimHeader,
      domain: this.config.domain,
      selector: this.config.selector,
      bodyHash,
      signature,
      timestamp,
      expiration,
    };
  }

  /**
   * Sign and return the email with DKIM-Signature header prepended
   */
  signEmail(rawEmail: string): string {
    const result = this.sign(rawEmail);
    return `${result.header}\r\n${rawEmail}`;
  }
}

/**
 * DKIM Key manager for key rotation
 */
export class DkimKeyManager {
  private signers: Map<string, DkimSigner> = new Map();
  private activeKeyId: string | null = null;

  /**
   * Add a signing key
   */
  addKey(config: DkimConfig): string {
    const keyId = config.keyId || `${config.domain}:${config.selector}`;
    const signer = new DkimSigner(config);
    this.signers.set(keyId, signer);

    // Set as active if first key
    if (!this.activeKeyId) {
      this.activeKeyId = keyId;
    }

    return keyId;
  }

  /**
   * Remove a signing key
   */
  removeKey(keyId: string): boolean {
    if (this.activeKeyId === keyId) {
      // Don't allow removing active key if it's the only one
      if (this.signers.size <= 1) {
        throw new Error('Cannot remove the only signing key');
      }

      // Switch to another key
      for (const [id] of this.signers) {
        if (id !== keyId) {
          this.activeKeyId = id;
          break;
        }
      }
    }

    return this.signers.delete(keyId);
  }

  /**
   * Set the active signing key
   */
  setActiveKey(keyId: string): void {
    if (!this.signers.has(keyId)) {
      throw new Error(`Key not found: ${keyId}`);
    }
    this.activeKeyId = keyId;
  }

  /**
   * Get active signer
   */
  getActiveSigner(): DkimSigner {
    if (!this.activeKeyId) {
      throw new Error('No active signing key');
    }
    const signer = this.signers.get(this.activeKeyId);
    if (!signer) {
      throw new Error('Active signer not found');
    }
    return signer;
  }

  /**
   * Sign email with active key
   */
  sign(rawEmail: string): DkimSignatureResult {
    return this.getActiveSigner().sign(rawEmail);
  }

  /**
   * Sign email and return with DKIM header
   */
  signEmail(rawEmail: string): string {
    return this.getActiveSigner().signEmail(rawEmail);
  }

  /**
   * List all key IDs
   */
  listKeys(): string[] {
    return Array.from(this.signers.keys());
  }

  /**
   * Get active key ID
   */
  getActiveKeyId(): string | null {
    return this.activeKeyId;
  }
}

/**
 * Generate DKIM DNS record value
 */
export function generateDkimDnsRecord(publicKey: string, options?: {
  version?: string;
  keyType?: string;
  hashAlgorithms?: string[];
  serviceType?: string;
  flags?: string[];
}): string {
  const parts: string[] = [];

  // Version (optional, defaults to DKIM1)
  if (options?.version) {
    parts.push(`v=${options.version}`);
  }

  // Key type (optional, defaults to rsa)
  if (options?.keyType) {
    parts.push(`k=${options.keyType}`);
  }

  // Hash algorithms (optional)
  if (options?.hashAlgorithms) {
    parts.push(`h=${options.hashAlgorithms.join(':')}`);
  }

  // Service type (optional, defaults to *)
  if (options?.serviceType) {
    parts.push(`s=${options.serviceType}`);
  }

  // Flags (optional)
  if (options?.flags) {
    parts.push(`t=${options.flags.join(':')}`);
  }

  // Public key (required)
  // Remove PEM headers and newlines
  const cleanKey = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/-----BEGIN RSA PUBLIC KEY-----/g, '')
    .replace(/-----END RSA PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');

  parts.push(`p=${cleanKey}`);

  return parts.join('; ');
}

/**
 * Parse DKIM-Signature header
 */
export function parseDkimSignature(header: string): {
  version?: string;
  algorithm?: string;
  domain?: string;
  selector?: string;
  canonicalization?: string;
  headers?: string[];
  bodyHash?: string;
  signature?: string;
  timestamp?: number;
  expiration?: number;
  bodyLength?: number;
} {
  const result: Record<string, string | number | string[]> = {};

  // Remove header name and unfold
  const value = header
    .replace(/^DKIM-Signature:\s*/i, '')
    .replace(/\r?\n[\t ]+/g, ' ');

  // Parse tag=value pairs
  const pairs = value.split(/\s*;\s*/);
  for (const pair of pairs) {
    const [tag, ...valueParts] = pair.split('=');
    const tagValue = valueParts.join('=').trim();

    switch (tag.trim()) {
      case 'v':
        result.version = tagValue;
        break;
      case 'a':
        result.algorithm = tagValue;
        break;
      case 'd':
        result.domain = tagValue;
        break;
      case 's':
        result.selector = tagValue;
        break;
      case 'c':
        result.canonicalization = tagValue;
        break;
      case 'h':
        result.headers = tagValue.split(':');
        break;
      case 'bh':
        result.bodyHash = tagValue;
        break;
      case 'b':
        result.signature = tagValue.replace(/\s+/g, '');
        break;
      case 't':
        result.timestamp = parseInt(tagValue, 10);
        break;
      case 'x':
        result.expiration = parseInt(tagValue, 10);
        break;
      case 'l':
        result.bodyLength = parseInt(tagValue, 10);
        break;
    }
  }

  return result as ReturnType<typeof parseDkimSignature>;
}

// Export factory function
export function createDkimSigner(config: DkimConfig): DkimSigner {
  return new DkimSigner(config);
}

// Export key manager factory
export function createDkimKeyManager(): DkimKeyManager {
  return new DkimKeyManager();
}
