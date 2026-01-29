import type { AuditLogInput, SecurityEventInput } from '../types';

export interface AuthLogOptions {
  userId?: string;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  mfaUsed?: boolean;
  failureReason?: string;
}

/**
 * Create audit log input for successful login
 */
export function createLoginSuccessEntry(
  tenantId: string,
  options: AuthLogOptions
): AuditLogInput {
  return {
    tenantId,
    eventType: 'UserLogin',
    action: 'LOGIN',
    actionResult: 'SUCCESS',
    resourceType: 'user',
    resourceId: options.userId || 'unknown',
    actorId: options.userId,
    actorEmail: options.email,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    metadata: { mfaUsed: options.mfaUsed },
  };
}

/**
 * Create security event input for successful login
 */
export function createLoginSuccessSecurityEvent(
  options: AuthLogOptions
): SecurityEventInput {
  return {
    eventType: 'LOGIN_SUCCESS',
    severity: 'INFO',
    actorId: options.userId,
    actorEmail: options.email,
    actorIp: options.ipAddress,
    description: `Successful login for ${options.email}`,
    details: { mfaUsed: options.mfaUsed },
  };
}

/**
 * Create audit log input for failed login
 */
export function createLoginFailureEntry(
  tenantId: string,
  options: AuthLogOptions
): AuditLogInput {
  return {
    tenantId,
    eventType: 'UserLoginFailed',
    action: 'LOGIN_FAILED',
    actionResult: 'FAILURE',
    resourceType: 'user',
    resourceId: 'unknown',
    actorEmail: options.email,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    actionReason: options.failureReason,
  };
}

/**
 * Create security event input for failed login
 */
export function createLoginFailureSecurityEvent(
  options: AuthLogOptions
): SecurityEventInput {
  return {
    eventType: 'LOGIN_FAILURE',
    severity: 'MEDIUM',
    actorEmail: options.email,
    actorIp: options.ipAddress,
    description: `Failed login attempt for ${options.email}`,
    details: { reason: options.failureReason },
  };
}
