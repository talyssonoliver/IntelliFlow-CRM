/**
 * DSAR notification port (PG-203, spec Addendum A).
 *
 * Fixed-template emails. The adapter renders them; no visitor-typed text (details, names)
 * ever goes into a template, and tokens appear only inside the URL fragment of a link.
 */
import type { DsarRequestType, DsarWithheldCategory } from '@intelliflow/domain';

export type DsarNotice =
  | {
      kind: 'VERIFY_LINK';
      to: string;
      firmName: string;
      type: DsarRequestType;
      link: string;
      expiresAt: Date;
    }
  | { kind: 'VERIFIED'; to: string; firmName: string; type: DsarRequestType; dueDate: Date }
  | {
      kind: 'EXPORT_LINK';
      to: string;
      firmName: string;
      link: string;
      expiresAt: Date;
      withheld: boolean;
    }
  | {
      kind: 'EXTENDED';
      to: string;
      firmName: string;
      type: DsarRequestType;
      newDueDate: Date;
      reason: string;
    }
  | {
      kind: 'COMPLETED';
      to: string;
      firmName: string;
      type: DsarRequestType;
      /** MARKETING objections only: the firm confirmed marketing has stopped. */
      marketingStopped: boolean;
      /**
       * Access and portability: what the firm withheld from the copy, and why (Art 12(4),
       * 15(4)). The person is told in this notice; empty when nothing was withheld.
       */
      withheld: ReadonlyArray<{ category: DsarWithheldCategory; count: number; reason: string }>;
    }
  | {
      kind: 'REJECTED';
      to: string;
      firmName: string;
      type: DsarRequestType;
      reason: string;
      late: boolean;
    }
  | { kind: 'RESTRICTION_LIFTING'; to: string; firmName: string }
  | { kind: 'ERASURE_LOGGED'; to: string; firmName: string }
  | { kind: 'ERASURE_CANCELLED'; to: string; firmName: string; reason: string }
  | {
      kind: 'ADMIN_NEW_REQUEST';
      tenantId: string;
      requestId: string;
      type: DsarRequestType;
      dueDate: Date;
    };

export interface DsarNotificationPort {
  /**
   * Never throws: failures are logged by the adapter with the notice kind and error class only.
   * Resolves true when the email provider accepted the message. Callers that must inform the
   * person before acting (Art 18(3) restriction lifting) act only on true.
   */
  send(notice: DsarNotice): Promise<boolean>;
}

/** Single-use tokens and keyed hashes (adapter: HMAC under a key derived from the booking salt). */
export interface DsarTokenPort {
  /** 32 random bytes as base64url (43 characters) and its HMAC. */
  issue(): { token: string; hash: string };
  /** Constant-time comparison; a null stored hash compares against a dummy. */
  matches(token: string, storedHash: string | null): boolean;
  /** HMAC of the +tag-folded email, for the cross-tenant cap. */
  capEmailHash(email: string): string;
}
