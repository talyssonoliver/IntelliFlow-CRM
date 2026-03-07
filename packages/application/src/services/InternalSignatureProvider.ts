import { createHash } from 'node:crypto';
import type { SignatureProviderPort } from '../ports/external/SignatureProviderPort';

/**
 * Internal Signature Provider
 *
 * Computes SHA-256 signature hashes using Node.js crypto.
 * Used for internal e-signature workflows. For external providers
 * (DocuSign, Adobe Sign), implement SignatureProviderPort with their SDK.
 */
export class InternalSignatureProvider implements SignatureProviderPort {
  async computeSignatureHash(
    contentHash: string,
    signerId: string,
    timestamp: Date
  ): Promise<string> {
    const data = `${contentHash}:${timestamp.toISOString()}:${signerId}`;
    return createHash('sha256').update(data).digest('hex');
  }
}
