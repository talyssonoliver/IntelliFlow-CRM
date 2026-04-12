/**
 * Signature Provider Port
 *
 * Interface for e-signature hash computation services.
 * Implementations can use internal SHA-256, DocuSign, Adobe Sign, etc.
 */
export interface SignatureProviderPort {
  /**
   * Compute a cryptographic signature hash for document signing
   * @param contentHash - SHA-256 hash of the document content
   * @param signerId - UUID of the signer
   * @param timestamp - Signing timestamp
   * @returns 64-character lowercase hex SHA-256 hash
   */
  computeSignatureHash(contentHash: string, signerId: string, timestamp: Date): Promise<string>;
}
