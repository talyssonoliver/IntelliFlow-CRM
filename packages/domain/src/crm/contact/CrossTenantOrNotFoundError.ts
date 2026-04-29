import { DomainError } from '../../shared/Result';

export class CrossTenantOrNotFoundError extends DomainError {
  readonly code = 'CROSS_TENANT_OR_NOT_FOUND';

  constructor(message: string) {
    super(message);
  }

  static forContact(contactId: string, tenantId: string): CrossTenantOrNotFoundError {
    return new CrossTenantOrNotFoundError(
      `Contact ${contactId} not found in tenant ${tenantId} (either deleted or belongs to another tenant).`
    );
  }

  static forMerge(
    primaryId: string,
    secondaryId: string,
    tenantId: string
  ): CrossTenantOrNotFoundError {
    return new CrossTenantOrNotFoundError(
      `Cannot merge contacts ${primaryId} and ${secondaryId} in tenant ${tenantId}: one or both are missing or belong to another tenant.`
    );
  }
}
