import { ACCOUNT_OWNER_ADMIN_ROLES } from '../../crm/account/territory/territory-constants';

/**
 * Roles allowed to change firm availability (PG-202, owner Q5: admins and
 * managers). Same set as account owner admins, so there is one role list; OWNER
 * and SUPER_ADMIN are forward-compatible strings (as CASE_TYPE_ADMIN_ROLES).
 */
export const AVAILABILITY_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES;

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(AVAILABILITY_ADMIN_ROLES);

export function isAvailabilityAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLE_SET.has(role);
}
