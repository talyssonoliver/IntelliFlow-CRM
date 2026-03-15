import { Result, DomainError } from '@intelliflow/domain';

/**
 * Auth Service Port
 * Defines the contract for authentication
 * Implementation lives in adapters layer (Supabase Auth, etc.)
 */

/**
 * @knipignore Intentional public auth contract shared across application boundaries.
 */
export interface User {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
}

/**
 * @knipignore Intentional public auth port for adapter implementations.
 */
export interface AuthServicePort {
  /**
   * Get current authenticated user
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Verify user has permission
   */
  hasPermission(userId: string, permission: string): Promise<boolean>;

  /**
   * Get user by ID
   */
  getUserById(userId: string): Promise<User | null>;
}
