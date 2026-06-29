/**
 * TermsAcceptance — Domain value class (IFC-309)
 *
 * ZERO infrastructure imports: no @intelliflow/db, no @prisma/client, no pg.
 * This is a pure domain object representing a server-side terms acceptance record.
 *
 * Invariants:
 * - termsVersion: 1-32 chars (enforced in static create())
 * - acceptedAt: always server-set (never accepted from client input)
 * - Records are IMMUTABLE — no mutation methods exposed
 */

export interface TermsAcceptanceProps {
  id: string;
  tenantId: string;
  userId: string;
  termsVersion: string;
  acceptedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  route: string;
}

export class TermsAcceptance {
  private constructor(private readonly props: TermsAcceptanceProps) {}

  /**
   * Create a new TermsAcceptance record.
   * acceptedAt is set to now() by the domain — DB @default(now()) mirrors this.
   *
   * @throws Error if termsVersion is empty or exceeds 32 chars
   */
  static create(props: Omit<TermsAcceptanceProps, 'acceptedAt'>): TermsAcceptance {
    if (!props.termsVersion || props.termsVersion.length > 32) {
      throw new Error('termsVersion must be 1-32 chars');
    }
    return new TermsAcceptance({ ...props, acceptedAt: new Date() });
  }

  /**
   * Rehydrate from a persisted DB record (all fields including acceptedAt supplied).
   * Defensive clone: ensures we own the Date instance, not the caller.
   */
  static fromRecord(props: TermsAcceptanceProps): TermsAcceptance {
    return new TermsAcceptance({
      ...props,
      acceptedAt: new Date(props.acceptedAt.getTime()),
    });
  }

  /**
   * Returns a plain copy of the internal props for persistence or serialisation.
   * Returns a cloned Date so callers cannot mutate the internal audit timestamp.
   */
  toRecord(): TermsAcceptanceProps {
    return {
      ...this.props,
      acceptedAt: new Date(this.props.acceptedAt.getTime()),
    };
  }

  get id(): string {
    return this.props.id;
  }

  get termsVersion(): string {
    return this.props.termsVersion;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get acceptedAt(): Date {
    return new Date(this.props.acceptedAt.getTime());
  }

  get ipAddress(): string | null {
    return this.props.ipAddress;
  }

  get userAgent(): string | null {
    return this.props.userAgent;
  }

  get route(): string {
    return this.props.route;
  }
}
