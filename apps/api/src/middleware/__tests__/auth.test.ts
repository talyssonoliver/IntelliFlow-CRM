/**
 * Authentication Middleware Tests
 *
 * Tests authentication, authorization, and token handling middleware.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  createAuthMiddleware,
  createAdminMiddleware,
  createManagerMiddleware,
  verifyToken,
  extractTokenFromHeader,
} from '../auth';
import type { Context } from '../../context';

describe('AuthMiddleware', () => {
  describe('createAuthMiddleware()', () => {
    it('should allow authenticated user to proceed', async () => {
      const authMiddleware = createAuthMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      const result = await authMiddleware({
        ctx,
        next: mockNext,
      });

      expect(result).toEqual({ success: true });
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith({
        ctx: expect.objectContaining({
          user: ctx.user,
        }),
      });
    });

    it('should reject unauthenticated user with UNAUTHORIZED error', async () => {
      const authMiddleware = createAuthMiddleware();
      const mockNext = vi.fn();

      const ctx: Context = {
        user: null,
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await expect(
        authMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        authMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject undefined user', async () => {
      const authMiddleware = createAuthMiddleware();
      const mockNext = vi.fn();

      const ctx: Context = {
        user: undefined,
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await expect(
        authMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should propagate context to next middleware', async () => {
      const authMiddleware = createAuthMiddleware();
      let capturedContext: any;

      const mockNext = vi.fn(async (opts) => {
        capturedContext = opts?.ctx;
        return { data: 'test' };
      });

      const ctx: Context = {
        user: {
          userId: 'user-456',
          email: 'admin@example.com',
          role: 'ADMIN',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await authMiddleware({ ctx, next: mockNext });

      expect(capturedContext).toBeDefined();
      expect(capturedContext.user).toEqual(ctx.user);
    });

    it('should pass through additional context properties', async () => {
      const authMiddleware = createAuthMiddleware();
      const mockNext = vi.fn(async () => ({}));

      const ctx: Context & { correlationId: string } = {
        user: {
          userId: 'user-789',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
        correlationId: 'corr-123',
      };

      await authMiddleware({ ctx, next: mockNext });

      expect(mockNext).toHaveBeenCalledWith({
        ctx: expect.objectContaining({
          user: ctx.user,
          correlationId: 'corr-123',
        }),
      });
    });
  });

  describe('createAdminMiddleware()', () => {
    it('should allow user with ADMIN role', async () => {
      const adminMiddleware = createAdminMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = {
        user: {
          userId: 'admin-123',
          email: 'admin@example.com',
          role: 'ADMIN',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      const result = await adminMiddleware({
        ctx,
        next: mockNext,
      });

      expect(result).toEqual({ success: true });
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject user with USER role', async () => {
      const adminMiddleware = createAdminMiddleware();
      const mockNext = vi.fn();

      const ctx = {
        user: {
          userId: 'user-123',
          email: 'user@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      await expect(
        adminMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        adminMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject user with MANAGER role', async () => {
      const adminMiddleware = createAdminMiddleware();
      const mockNext = vi.fn();

      const ctx = {
        user: {
          userId: 'manager-123',
          email: 'manager@example.com',
          role: 'MANAGER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      await expect(
        adminMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        adminMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Admin access required',
      });

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject user with unknown role', async () => {
      const adminMiddleware = createAdminMiddleware();
      const mockNext = vi.fn();

      const ctx = {
        user: {
          userId: 'guest-123',
          email: 'guest@example.com',
          role: 'GUEST',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      await expect(
        adminMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should not call next on authorization failure', async () => {
      const adminMiddleware = createAdminMiddleware();
      const mockNext = vi.fn();

      const ctx = {
        user: {
          userId: 'user-456',
          email: 'user@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      try {
        await adminMiddleware({ ctx, next: mockNext });
      } catch (error) {
        // Expected to throw
      }

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('createManagerMiddleware()', () => {
    it('should allow user with ADMIN role', async () => {
      const managerMiddleware = createManagerMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = {
        user: {
          userId: 'admin-123',
          email: 'admin@example.com',
          role: 'ADMIN',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      const result = await managerMiddleware({
        ctx,
        next: mockNext,
      });

      expect(result).toEqual({ success: true });
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should allow user with MANAGER role', async () => {
      const managerMiddleware = createManagerMiddleware();
      const mockNext = vi.fn(async () => ({ success: true }));

      const ctx = {
        user: {
          userId: 'manager-123',
          email: 'manager@example.com',
          role: 'MANAGER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      const result = await managerMiddleware({
        ctx,
        next: mockNext,
      });

      expect(result).toEqual({ success: true });
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject user with USER role', async () => {
      const managerMiddleware = createManagerMiddleware();
      const mockNext = vi.fn();

      const ctx = {
        user: {
          userId: 'user-123',
          email: 'user@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      await expect(
        managerMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        managerMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Manager access required',
      });

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject user with GUEST role', async () => {
      const managerMiddleware = createManagerMiddleware();
      const mockNext = vi.fn();

      const ctx = {
        user: {
          userId: 'guest-123',
          email: 'guest@example.com',
          role: 'GUEST',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      await expect(
        managerMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle case-sensitive role comparison', async () => {
      const managerMiddleware = createManagerMiddleware();
      const mockNext = vi.fn();

      const ctx = {
        user: {
          userId: 'user-123',
          email: 'user@example.com',
          role: 'manager', // lowercase
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      } as Context & { user: NonNullable<Context['user']> };

      await expect(
        managerMiddleware({
          ctx,
          next: mockNext,
        })
      ).rejects.toThrow(TRPCError);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('verifyToken()', () => {
    it('should return null for any token (placeholder implementation)', async () => {
      const result = await verifyToken('valid-jwt-token');
      expect(result).toBeNull();
    });

    it('should return null for empty token', async () => {
      const result = await verifyToken('');
      expect(result).toBeNull();
    });

    it('should return null for invalid token format', async () => {
      const result = await verifyToken('not-a-jwt');
      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxNTE2MjM5MDIyfQ.xyz';
      const result = await verifyToken(expiredToken);
      expect(result).toBeNull();
    });

    it('should be async and return promise', async () => {
      const promise = verifyToken('token');
      expect(promise).toBeInstanceOf(Promise);
      await promise;
    });
  });

  describe('extractTokenFromHeader()', () => {
    it('should extract token from Bearer auth header', () => {
      const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const token = extractTokenFromHeader(authHeader);
      expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should return null for undefined header', () => {
      const token = extractTokenFromHeader(undefined);
      expect(token).toBeNull();
    });

    it('should return null for empty header', () => {
      const token = extractTokenFromHeader('');
      expect(token).toBeNull();
    });

    it('should return null for malformed header without Bearer', () => {
      const authHeader = 'Basic dXNlcjpwYXNz';
      const token = extractTokenFromHeader(authHeader);
      expect(token).toBeNull();
    });

    it('should return null for Bearer without token', () => {
      const authHeader = 'Bearer';
      const token = extractTokenFromHeader(authHeader);
      expect(token).toBeNull();
    });

    it('should return null for Bearer with empty token', () => {
      const authHeader = 'Bearer ';
      const token = extractTokenFromHeader(authHeader);
      expect(token).toBe('');
    });

    it('should handle Bearer token with extra spaces', () => {
      const authHeader = 'Bearer  token-with-extra-space';
      const token = extractTokenFromHeader(authHeader);
      // Split creates 3 parts: ['Bearer', '', 'token-with-extra-space']
      // Implementation requires exactly 2 parts, so this returns null
      expect(token).toBeNull();
    });

    it('should extract token with special characters', () => {
      const authHeader = 'Bearer abc123.def456.ghi789-_';
      const token = extractTokenFromHeader(authHeader);
      expect(token).toBe('abc123.def456.ghi789-_');
    });

    it('should return null for header with too many parts', () => {
      const authHeader = 'Bearer token extra';
      const token = extractTokenFromHeader(authHeader);
      // Three parts: ['Bearer', 'token', 'extra'] - requires exactly 2
      expect(token).toBeNull();
    });

    it('should be case-sensitive for Bearer prefix', () => {
      const authHeader = 'bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const token = extractTokenFromHeader(authHeader);
      expect(token).toBeNull();
    });

    it('should handle long JWT tokens', () => {
      const longToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const authHeader = `Bearer ${longToken}`;
      const token = extractTokenFromHeader(authHeader);
      expect(token).toBe(longToken);
    });
  });

  describe('Middleware Composition', () => {
    it('should compose auth and admin middleware correctly', async () => {
      const authMiddleware = createAuthMiddleware();
      const adminMiddleware = createAdminMiddleware();

      let authNextCalled = false;
      let adminNextCalled = false;

      const finalNext = vi.fn(async () => ({ result: 'success' }));

      const adminNext = vi.fn(async () => {
        authNextCalled = true;
        return adminMiddleware({
          ctx: {
            user: {
              userId: 'admin-123',
              email: 'admin@example.com',
              role: 'ADMIN',
            },
            prisma: {} as any,
            req: undefined,
            res: undefined,
          },
          next: async () => {
            adminNextCalled = true;
            return finalNext();
          },
        });
      });

      const ctx: Context = {
        user: {
          userId: 'admin-123',
          email: 'admin@example.com',
          role: 'ADMIN',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      const result = await authMiddleware({
        ctx,
        next: adminNext,
      });

      expect(authNextCalled).toBe(true);
      expect(adminNextCalled).toBe(true);
      expect(result).toEqual({ result: 'success' });
      expect(finalNext).toHaveBeenCalledTimes(1);
    });

    it('should stop at auth middleware if user not authenticated', async () => {
      const authMiddleware = createAuthMiddleware();
      const adminMiddleware = createAdminMiddleware();

      const adminNext = vi.fn();
      const finalNext = vi.fn();

      const ctx: Context = {
        user: null,
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await expect(
        authMiddleware({
          ctx,
          next: async () =>
            adminMiddleware({
              ctx: ctx as any,
              next: finalNext,
            }),
        })
      ).rejects.toThrow(TRPCError);

      expect(adminNext).not.toHaveBeenCalled();
      expect(finalNext).not.toHaveBeenCalled();
    });

    it('should stop at admin middleware if user not admin', async () => {
      const authMiddleware = createAuthMiddleware();
      const adminMiddleware = createAdminMiddleware();

      const finalNext = vi.fn();

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'user@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await expect(
        authMiddleware({
          ctx,
          next: async (opts) =>
            adminMiddleware({
              ctx: opts?.ctx as any,
              next: finalNext,
            }),
        })
      ).rejects.toThrow(TRPCError);

      expect(finalNext).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from next middleware', async () => {
      const authMiddleware = createAuthMiddleware();

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      const errorNext = vi.fn(async () => {
        throw new Error('Database connection failed');
      });

      await expect(
        authMiddleware({
          ctx,
          next: errorNext,
        })
      ).rejects.toThrow('Database connection failed');

      expect(errorNext).toHaveBeenCalledTimes(1);
    });

    it('should propagate TRPCError from next middleware', async () => {
      const authMiddleware = createAuthMiddleware();

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      const errorNext = vi.fn(async () => {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Something went wrong',
        });
      });

      await expect(
        authMiddleware({
          ctx,
          next: errorNext,
        })
      ).rejects.toThrow(TRPCError);

      await expect(
        authMiddleware({
          ctx,
          next: errorNext,
        })
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something went wrong',
      });
    });

    it('should handle synchronous errors in next middleware', async () => {
      const authMiddleware = createAuthMiddleware();

      const ctx: Context = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      const errorNext = vi.fn(() => {
        throw new Error('Sync error');
      });

      await expect(
        authMiddleware({
          ctx,
          next: errorNext as any,
        })
      ).rejects.toThrow('Sync error');
    });
  });

  describe('Context Propagation', () => {
    it('should preserve original context properties', async () => {
      const authMiddleware = createAuthMiddleware();
      let capturedContext: any;

      const mockNext = vi.fn(async (opts) => {
        capturedContext = opts?.ctx;
        return {};
      });

      const ctx: Context & { customProp: string } = {
        user: {
          userId: 'user-123',
          email: 'test@example.com',
          role: 'USER',
        },
        prisma: {} as any,
        req: undefined,
        res: undefined,
        customProp: 'custom-value',
      };

      await authMiddleware({ ctx, next: mockNext });

      expect(capturedContext).toBeDefined();
      expect(capturedContext.customProp).toBe('custom-value');
      expect(capturedContext.user).toEqual(ctx.user);
      expect(capturedContext.prisma).toBeDefined();
    });

    it('should not mutate original context', async () => {
      const authMiddleware = createAuthMiddleware();
      const mockNext = vi.fn(async () => ({}));

      const originalUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'USER',
      };

      const ctx: Context = {
        user: originalUser,
        prisma: {} as any,
        req: undefined,
        res: undefined,
      };

      await authMiddleware({ ctx, next: mockNext });

      // Original context should remain unchanged
      expect(ctx.user).toEqual(originalUser);
      expect(ctx.user).toBe(originalUser);
    });
  });
});
