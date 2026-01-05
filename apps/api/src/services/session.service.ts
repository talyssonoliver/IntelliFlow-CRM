/**
 * Session Service
 *
 * Manages user sessions including:
 * - Session creation with device tracking
 * - Concurrent session enforcement (max 3 per user)
 * - Session validation and refresh
 * - Session revocation
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Note: This works alongside Supabase Auth sessions. Supabase handles
 * JWT tokens, while this service provides additional session management
 * features like concurrent session limits and device tracking.
 */

import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// ============================================
// Types
// ============================================

/**
 * Device information extracted from user agent and request
 */
export interface DeviceInfo {
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  device?: string;
  isMobile?: boolean;
}

/**
 * Session data stored in database
 */
export interface SessionData {
  id: string;
  userId: string;
  tenantId: string;
  deviceInfo: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
  /** Supabase refresh token (encrypted) */
  refreshToken?: string;
  /** Session creation time */
  createdAt: Date;
  /** Last activity time */
  lastActiveAt: Date;
  /** Session expiration time */
  expiresAt: Date;
  /** Whether this is a "remember me" session */
  rememberMe: boolean;
}

/**
 * Session creation input
 */
export interface CreateSessionInput {
  userId: string;
  tenantId: string;
  deviceInfo?: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
  refreshToken?: string;
  rememberMe?: boolean;
}

/**
 * Session info for API responses (excludes sensitive data)
 */
export interface SessionInfo {
  id: string;
  deviceInfo: DeviceInfo;
  ipAddress?: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: SessionData;
  error?: string;
}

// ============================================
// Configuration
// ============================================

export interface SessionServiceConfig {
  /** Maximum concurrent sessions per user */
  maxConcurrentSessions: number;
  /** Default session duration in milliseconds */
  defaultSessionDurationMs: number;
  /** Extended session duration for "remember me" in milliseconds */
  rememberMeDurationMs: number;
  /** Inactivity timeout in milliseconds */
  inactivityTimeoutMs: number;
}

export const DEFAULT_SESSION_CONFIG: SessionServiceConfig = {
  maxConcurrentSessions: 3,
  defaultSessionDurationMs: 24 * 60 * 60 * 1000, // 24 hours
  rememberMeDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  inactivityTimeoutMs: 4 * 60 * 60 * 1000, // 4 hours
};

// ============================================
// In-memory store (use Redis in production)
// ============================================

/** Active sessions by user ID */
const sessionsByUser = new Map<string, Set<string>>();

/** Session data by session ID */
const sessionStore = new Map<string, SessionData>();

// ============================================
// Session Service Class
// ============================================

/**
 * Session Service
 *
 * Manages application-level sessions that work alongside
 * Supabase Auth for additional features like concurrent
 * session limits and device tracking.
 */
export class SessionService {
  private readonly config: SessionServiceConfig;
  private readonly prisma: PrismaClient | null;

  constructor(prisma?: PrismaClient, config: Partial<SessionServiceConfig> = {}) {
    this.prisma = prisma ?? null;
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };
  }

  // ==========================================
  // Session Creation
  // ==========================================

  /**
   * Create a new session for a user
   *
   * If the user already has the maximum number of sessions,
   * the oldest session will be revoked.
   */
  async createSession(input: CreateSessionInput): Promise<SessionData> {
    const sessionId = this.generateSessionId();
    const now = new Date();

    // Calculate expiration based on rememberMe
    const durationMs = input.rememberMe
      ? this.config.rememberMeDurationMs
      : this.config.defaultSessionDurationMs;
    const expiresAt = new Date(now.getTime() + durationMs);

    // Create session data
    const session: SessionData = {
      id: sessionId,
      userId: input.userId,
      tenantId: input.tenantId,
      deviceInfo: input.deviceInfo || {},
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      refreshToken: input.refreshToken,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
      rememberMe: input.rememberMe ?? false,
    };

    // Enforce concurrent session limit
    await this.enforceSessionLimit(input.userId);

    // Store session
    sessionStore.set(sessionId, session);

    // Track by user ID
    let userSessions = sessionsByUser.get(input.userId);
    if (!userSessions) {
      userSessions = new Set();
      sessionsByUser.set(input.userId, userSessions);
    }
    userSessions.add(sessionId);

    // Persist to database if available
    if (this.prisma) {
      await this.persistSession(session);
    }

    return session;
  }

  /**
   * Enforce concurrent session limit by revoking oldest sessions
   */
  private async enforceSessionLimit(userId: string): Promise<void> {
    const userSessions = sessionsByUser.get(userId);
    if (!userSessions) return;

    // Get all active sessions for user
    const activeSessions: SessionData[] = [];
    for (const sessionId of userSessions) {
      const session = sessionStore.get(sessionId);
      if (session && this.isSessionValid(session)) {
        activeSessions.push(session);
      }
    }

    // Check if we need to revoke sessions
    const sessionsToRevoke = activeSessions.length - this.config.maxConcurrentSessions + 1;
    if (sessionsToRevoke <= 0) return;

    // Sort by creation time (oldest first)
    activeSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Revoke oldest sessions
    for (let i = 0; i < sessionsToRevoke; i++) {
      await this.revokeSession(activeSessions[i].id);
    }
  }

  // ==========================================
  // Session Validation
  // ==========================================

  /**
   * Validate a session and update last active time
   */
  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    const session = sessionStore.get(sessionId);

    if (!session) {
      // Try loading from database
      if (this.prisma) {
        const dbSession = await this.loadSessionFromDb(sessionId);
        if (dbSession) {
          sessionStore.set(sessionId, dbSession);
          return this.validateSession(sessionId);
        }
      }
      return { valid: false, error: 'Session not found' };
    }

    // Check expiration
    if (new Date() > session.expiresAt) {
      await this.revokeSession(sessionId);
      return { valid: false, error: 'Session expired' };
    }

    // Check inactivity timeout
    const inactiveMs = Date.now() - session.lastActiveAt.getTime();
    if (inactiveMs > this.config.inactivityTimeoutMs) {
      await this.revokeSession(sessionId);
      return { valid: false, error: 'Session timed out due to inactivity' };
    }

    // Update last active time
    session.lastActiveAt = new Date();
    if (this.prisma) {
      await this.updateSessionActivity(sessionId);
    }

    return { valid: true, session };
  }

  /**
   * Check if a session is valid without updating activity
   */
  isSessionValid(session: SessionData): boolean {
    const now = new Date();

    // Check expiration
    if (now > session.expiresAt) {
      return false;
    }

    // Check inactivity
    const inactiveMs = now.getTime() - session.lastActiveAt.getTime();
    if (inactiveMs > this.config.inactivityTimeoutMs) {
      return false;
    }

    return true;
  }

  // ==========================================
  // Session Retrieval
  // ==========================================

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    let session = sessionStore.get(sessionId);

    if (!session && this.prisma) {
      session = await this.loadSessionFromDb(sessionId) ?? undefined;
      if (session) {
        sessionStore.set(sessionId, session);
      }
    }

    return session ?? null;
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string, currentSessionId?: string): Promise<SessionInfo[]> {
    const userSessions = sessionsByUser.get(userId);
    const sessions: SessionInfo[] = [];

    if (!userSessions) {
      // Try loading from database
      if (this.prisma) {
        const dbSessions = await this.loadUserSessionsFromDb(userId);
        for (const session of dbSessions) {
          sessionStore.set(session.id, session);
          let userSessionSet = sessionsByUser.get(userId);
          if (!userSessionSet) {
            userSessionSet = new Set();
            sessionsByUser.set(userId, userSessionSet);
          }
          userSessionSet.add(session.id);
        }
        return this.getUserSessions(userId, currentSessionId);
      }
      return [];
    }

    for (const sessionId of userSessions) {
      const session = sessionStore.get(sessionId);
      if (session && this.isSessionValid(session)) {
        sessions.push({
          id: session.id,
          deviceInfo: session.deviceInfo,
          ipAddress: session.ipAddress,
          createdAt: session.createdAt,
          lastActiveAt: session.lastActiveAt,
          expiresAt: session.expiresAt,
          isCurrent: sessionId === currentSessionId,
        });
      }
    }

    // Sort by last active (most recent first)
    sessions.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());

    return sessions;
  }

  /**
   * Get active session count for a user
   */
  getActiveSessionCount(userId: string): number {
    const userSessions = sessionsByUser.get(userId);
    if (!userSessions) return 0;

    let count = 0;
    for (const sessionId of userSessions) {
      const session = sessionStore.get(sessionId);
      if (session && this.isSessionValid(session)) {
        count++;
      }
    }

    return count;
  }

  // ==========================================
  // Session Revocation
  // ==========================================

  /**
   * Revoke a specific session
   */
  async revokeSession(sessionId: string): Promise<boolean> {
    const session = sessionStore.get(sessionId);
    if (!session) return false;

    // Remove from stores
    sessionStore.delete(sessionId);
    const userSessions = sessionsByUser.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        sessionsByUser.delete(session.userId);
      }
    }

    // Remove from database
    if (this.prisma) {
      await this.deleteSessionFromDb(sessionId);
    }

    return true;
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    const userSessions = sessionsByUser.get(userId);
    if (!userSessions) return 0;

    const sessionIds = [...userSessions];
    let revokedCount = 0;

    for (const sessionId of sessionIds) {
      const revoked = await this.revokeSession(sessionId);
      if (revoked) revokedCount++;
    }

    return revokedCount;
  }

  /**
   * Revoke all sessions except the current one
   */
  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const userSessions = sessionsByUser.get(userId);
    if (!userSessions) return 0;

    const sessionIds = [...userSessions].filter(id => id !== currentSessionId);
    let revokedCount = 0;

    for (const sessionId of sessionIds) {
      const revoked = await this.revokeSession(sessionId);
      if (revoked) revokedCount++;
    }

    return revokedCount;
  }

  // ==========================================
  // Session Refresh
  // ==========================================

  /**
   * Extend session expiration
   */
  async extendSession(sessionId: string, rememberMe?: boolean): Promise<SessionData | null> {
    const session = sessionStore.get(sessionId);
    if (!session || !this.isSessionValid(session)) {
      return null;
    }

    // Calculate new expiration
    const durationMs = rememberMe ?? session.rememberMe
      ? this.config.rememberMeDurationMs
      : this.config.defaultSessionDurationMs;

    session.expiresAt = new Date(Date.now() + durationMs);
    session.lastActiveAt = new Date();
    session.rememberMe = rememberMe ?? session.rememberMe;

    if (this.prisma) {
      await this.persistSession(session);
    }

    return session;
  }

  // ==========================================
  // Device Info Parsing
  // ==========================================

  /**
   * Parse device info from user agent string
   */
  parseDeviceInfo(userAgent?: string): DeviceInfo {
    if (!userAgent) {
      return {};
    }

    const info: DeviceInfo = {};

    // Simple browser detection
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      info.browser = 'Chrome';
      const match = userAgent.match(/Chrome\/([\d.]+)/);
      if (match) info.browserVersion = match[1];
    } else if (userAgent.includes('Firefox')) {
      info.browser = 'Firefox';
      const match = userAgent.match(/Firefox\/([\d.]+)/);
      if (match) info.browserVersion = match[1];
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      info.browser = 'Safari';
      const match = userAgent.match(/Version\/([\d.]+)/);
      if (match) info.browserVersion = match[1];
    } else if (userAgent.includes('Edg')) {
      info.browser = 'Edge';
      const match = userAgent.match(/Edg\/([\d.]+)/);
      if (match) info.browserVersion = match[1];
    }

    // Simple OS detection
    if (userAgent.includes('Windows')) {
      info.os = 'Windows';
      if (userAgent.includes('Windows NT 10.0')) info.osVersion = '10';
      else if (userAgent.includes('Windows NT 11.0')) info.osVersion = '11';
    } else if (userAgent.includes('Mac OS X')) {
      info.os = 'macOS';
      const match = userAgent.match(/Mac OS X ([\d_]+)/);
      if (match) info.osVersion = match[1].replace(/_/g, '.');
    } else if (userAgent.includes('Linux')) {
      info.os = 'Linux';
    } else if (userAgent.includes('Android')) {
      info.os = 'Android';
      const match = userAgent.match(/Android ([\d.]+)/);
      if (match) info.osVersion = match[1];
    } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      info.os = 'iOS';
      const match = userAgent.match(/OS ([\d_]+)/);
      if (match) info.osVersion = match[1].replace(/_/g, '.');
    }

    // Mobile detection
    info.isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
    info.device = info.isMobile ? 'Mobile' : 'Desktop';

    return info;
  }

  // ==========================================
  // Database Operations (Placeholders)
  // ==========================================

  /**
   * Persist session to database
   */
  private async persistSession(session: SessionData): Promise<void> {
    // In production: upsert to sessions table
    // await this.prisma.session.upsert({
    //   where: { id: session.id },
    //   create: { ...session },
    //   update: { ...session }
    // });
  }

  /**
   * Load session from database
   */
  private async loadSessionFromDb(sessionId: string): Promise<SessionData | null> {
    // In production: query from sessions table
    // return await this.prisma.session.findUnique({ where: { id: sessionId } });
    return null;
  }

  /**
   * Load all sessions for a user from database
   */
  private async loadUserSessionsFromDb(userId: string): Promise<SessionData[]> {
    // In production: query from sessions table
    // return await this.prisma.session.findMany({ where: { userId, expiresAt: { gt: new Date() } } });
    return [];
  }

  /**
   * Update session activity in database
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    // In production: update lastActiveAt in sessions table
    // await this.prisma.session.update({
    //   where: { id: sessionId },
    //   data: { lastActiveAt: new Date() }
    // });
  }

  /**
   * Delete session from database
   */
  private async deleteSessionFromDb(sessionId: string): Promise<void> {
    // In production: delete from sessions table
    // await this.prisma.session.delete({ where: { id: sessionId } });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  /**
   * Generate a secure session ID
   */
  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  // ==========================================
  // Cleanup
  // ==========================================

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    let cleaned = 0;

    for (const [sessionId, session] of sessionStore.entries()) {
      if (!this.isSessionValid(session)) {
        sessionStore.delete(sessionId);
        const userSessions = sessionsByUser.get(session.userId);
        if (userSessions) {
          userSessions.delete(sessionId);
          if (userSessions.size === 0) {
            sessionsByUser.delete(session.userId);
          }
        }
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all session data (for testing)
   */
  clearAll(): void {
    sessionStore.clear();
    sessionsByUser.clear();
  }

  /**
   * Get statistics
   */
  getStats(): { totalSessions: number; totalUsers: number } {
    return {
      totalSessions: sessionStore.size,
      totalUsers: sessionsByUser.size,
    };
  }
}

// ============================================
// Singleton and Exports
// ============================================

let sessionServiceInstance: SessionService | null = null;

/**
 * Get session service instance
 */
export function getSessionService(
  prisma?: PrismaClient,
  config?: Partial<SessionServiceConfig>
): SessionService {
  if (!sessionServiceInstance || prisma || config) {
    sessionServiceInstance = new SessionService(prisma, config);
  }
  return sessionServiceInstance;
}

/**
 * Reset session service (for testing)
 */
export function resetSessionService(): void {
  if (sessionServiceInstance) {
    sessionServiceInstance.clearAll();
  }
  sessionServiceInstance = null;
}
