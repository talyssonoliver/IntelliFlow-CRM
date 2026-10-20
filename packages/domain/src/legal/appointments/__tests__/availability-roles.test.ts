import { describe, it, expect } from 'vitest';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '../../../crm/account/territory/territory-constants';
import { AVAILABILITY_ADMIN_ROLES, isAvailabilityAdminRole } from '../availability-roles';

describe('availability roles (PG-202, owner Q5)', () => {
  it('reuses the shared admin role list', () => {
    expect(AVAILABILITY_ADMIN_ROLES).toBe(ACCOUNT_OWNER_ADMIN_ROLES);
  });

  it('allows admins and managers', () => {
    expect(isAvailabilityAdminRole('ADMIN')).toBe(true);
    expect(isAvailabilityAdminRole('MANAGER')).toBe(true);
  });

  it('rejects other roles and a missing role', () => {
    expect(isAvailabilityAdminRole('USER')).toBe(false);
    expect(isAvailabilityAdminRole('VIEWER')).toBe(false);
    expect(isAvailabilityAdminRole(undefined)).toBe(false);
    expect(isAvailabilityAdminRole(null)).toBe(false);
  });
});
