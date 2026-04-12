/**
 * Audit Handler Modules
 * Factory functions for creating audit log entries
 */

export {
  createLoginSuccessEntry,
  createLoginSuccessSecurityEvent,
  createLoginFailureEntry,
  createLoginFailureSecurityEvent,
} from './auth-handler';

export { createCrudEntry } from './crud-handler';

export { createPermissionDeniedEntry } from './permission-handler';

export { logSecurityEventToDb } from './security-handler';

export { createBulkOperationEntry } from './bulk-handler';

// Type exports
export type { AuthLogOptions } from './auth-handler';
export type { CrudLogOptions } from './crud-handler';
export type { PermissionDeniedOptions } from './permission-handler';
export type { BulkAction, BulkLogOptions } from './bulk-handler';
