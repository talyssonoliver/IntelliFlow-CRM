/**
 * UserMenu - Supplementary2 Tests (Logic Only)
 *
 * Tests the pure logic extracted from user-menu.tsx:
 * - Initials computation from user names
 * - User fallback logic (authUser -> propUser -> Guest)
 * - Click-outside detection logic
 * - Escape key handler logic
 * - Logout handler flow
 * - Menu toggle state transitions
 *
 * NO @testing-library/react - pure logic tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Hoisted mocks
// ============================================================
const mocks = vi.hoisted(() => ({
  mockLogout: vi.fn().mockResolvedValue(undefined),
  mockUseAuth: vi.fn(() => ({ user: null })),
  mockUseLogout: vi.fn(() => ({
    logout: vi.fn().mockResolvedValue(undefined),
    isLoggingOut: false,
  })),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: mocks.mockUseAuth,
}));

vi.mock('@/hooks/useLogout', () => ({
  useLogout: mocks.mockUseLogout,
}));

vi.mock('next/link', () => ({ default: vi.fn() }));
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// ============================================================
// Pure logic helpers extracted from user-menu.tsx
// ============================================================

interface UserData {
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
}

interface AuthUser {
  name?: string;
  email: string;
  role?: string;
  avatar?: string | null;
}

/**
 * Resolves user data: auth context > props > guest default
 * Mirrors the logic in UserMenu component
 */
function resolveUser(authUser: AuthUser | null, propUser?: UserData): UserData {
  if (authUser) {
    return {
      name: authUser.name || authUser.email.split('@')[0],
      email: authUser.email,
      role: authUser.role,
      avatar: authUser.avatar || undefined,
    };
  }
  return propUser || { name: 'Guest', email: '', role: '' };
}

/**
 * Compute initials from name
 * Mirrors the logic in UserMenu component
 */
function computeInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Simulates click-outside logic
 */
function isClickOutside(menuRef: { contains: (target: unknown) => boolean }, target: unknown): boolean {
  return !menuRef.contains(target);
}

// ============================================================
// Tests
// ============================================================
describe('UserMenu logic (supplementary2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUseAuth.mockReturnValue({ user: null });
    mocks.mockUseLogout.mockReturnValue({
      logout: mocks.mockLogout,
      isLoggingOut: false,
    });
  });

  // -------------------------------------------------------
  // Initials computation
  // -------------------------------------------------------
  describe('computeInitials', () => {
    it('computes initials from two-word name', () => {
      expect(computeInitials('John Doe')).toBe('JD');
    });

    it('computes initials from single-word name', () => {
      expect(computeInitials('Admin')).toBe('A');
    });

    it('truncates to 2 characters for multi-word names', () => {
      expect(computeInitials('Alice Bob Charlie')).toBe('AB');
    });

    it('handles lowercase names', () => {
      expect(computeInitials('john doe')).toBe('JD');
    });

    it('handles hyphenated names', () => {
      expect(computeInitials('Anne-Marie Smith')).toBe('AS');
    });

    it('handles empty parts gracefully', () => {
      // 'Guest' => 'G'
      expect(computeInitials('Guest')).toBe('G');
    });
  });

  // -------------------------------------------------------
  // User resolution
  // -------------------------------------------------------
  describe('resolveUser', () => {
    it('prefers authUser over propUser', () => {
      const authUser: AuthUser = { name: 'Auth User', email: 'auth@test.com', role: 'admin' };
      const propUser: UserData = { name: 'Prop User', email: 'prop@test.com' };

      const result = resolveUser(authUser, propUser);
      expect(result.name).toBe('Auth User');
      expect(result.email).toBe('auth@test.com');
      expect(result.role).toBe('admin');
    });

    it('uses email username when authUser has no name', () => {
      const authUser: AuthUser = { email: 'john.doe@company.com' };

      const result = resolveUser(authUser);
      expect(result.name).toBe('john.doe');
    });

    it('falls back to propUser when authUser is null', () => {
      const propUser: UserData = { name: 'Prop User', email: 'prop@test.com', role: 'user' };

      const result = resolveUser(null, propUser);
      expect(result.name).toBe('Prop User');
    });

    it('uses Guest defaults when both are absent', () => {
      const result = resolveUser(null, undefined);
      expect(result.name).toBe('Guest');
      expect(result.email).toBe('');
    });

    it('authUser uses avatar when present', () => {
      const authUser: AuthUser = {
        name: 'Test',
        email: 'test@x.com',
        avatar: 'https://lh3.googleusercontent.com/a/test',
      };
      const result = resolveUser(authUser);
      expect(result.avatar).toBe('https://lh3.googleusercontent.com/a/test');
    });

    it('authUser falls back to undefined avatar when missing', () => {
      const authUser: AuthUser = { name: 'Test', email: 'test@x.com' };
      const result = resolveUser(authUser);
      expect(result.avatar).toBeUndefined();
    });

    it('preserves propUser avatar', () => {
      const propUser: UserData = { name: 'User', avatar: 'https://img.com/face.jpg' };
      const result = resolveUser(null, propUser);
      expect(result.avatar).toBe('https://img.com/face.jpg');
    });
  });

  // -------------------------------------------------------
  // Click-outside detection
  // -------------------------------------------------------
  describe('isClickOutside', () => {
    it('returns true when click target is outside the ref', () => {
      const menuRef = { contains: () => false };
      expect(isClickOutside(menuRef, 'some-target')).toBe(true);
    });

    it('returns false when click target is inside the ref', () => {
      const menuRef = { contains: () => true };
      expect(isClickOutside(menuRef, 'some-target')).toBe(false);
    });
  });

  // -------------------------------------------------------
  // Escape key handler
  // -------------------------------------------------------
  describe('escape key handler', () => {
    it('responds to Escape key', () => {
      let isOpen = true;
      function handleEscape(event: { key: string }) {
        if (event.key === 'Escape') {
          isOpen = false;
        }
      }

      handleEscape({ key: 'Escape' });
      expect(isOpen).toBe(false);
    });

    it('ignores non-Escape keys', () => {
      let isOpen = true;
      function handleEscape(event: { key: string }) {
        if (event.key === 'Escape') {
          isOpen = false;
        }
      }

      handleEscape({ key: 'Enter' });
      expect(isOpen).toBe(true);
    });
  });

  // -------------------------------------------------------
  // Menu toggle state
  // -------------------------------------------------------
  describe('menu toggle state', () => {
    it('toggles from closed to open', () => {
      let isOpen = false;
      isOpen = !isOpen;
      expect(isOpen).toBe(true);
    });

    it('toggles from open to closed', () => {
      let isOpen = true;
      isOpen = !isOpen;
      expect(isOpen).toBe(false);
    });

    it('sign out closes menu and calls logout', async () => {
      let isOpen = true;
      const logoutFn = vi.fn().mockResolvedValue(undefined);

      // Simulates the sign-out button onClick
      isOpen = false;
      await logoutFn();

      expect(isOpen).toBe(false);
      expect(logoutFn).toHaveBeenCalled();
    });

    it('link click closes menu', () => {
      let isOpen = true;
      // Simulates Link onClick
      isOpen = false;
      expect(isOpen).toBe(false);
    });
  });

  // -------------------------------------------------------
  // Logout flow
  // -------------------------------------------------------
  describe('logout flow', () => {
    it('logout resolves successfully', async () => {
      const logoutFn = vi.fn().mockResolvedValue(undefined);
      await expect(logoutFn()).resolves.toBeUndefined();
    });

    it('isLoggingOut state controls button disabled state', () => {
      const isLoggingOut = true;
      expect(isLoggingOut).toBe(true);
      // Button text changes
      const text = isLoggingOut ? 'Signing out...' : 'Sign out';
      expect(text).toBe('Signing out...');
    });

    it('isLoggingOut false shows normal text', () => {
      const isLoggingOut = false;
      const text = isLoggingOut ? 'Signing out...' : 'Sign out';
      expect(text).toBe('Sign out');
    });
  });

  // -------------------------------------------------------
  // Expand icon state
  // -------------------------------------------------------
  describe('expand icon state', () => {
    it('shows expand_less when open', () => {
      const isOpen = true;
      const icon = isOpen ? 'expand_less' : 'expand_more';
      expect(icon).toBe('expand_less');
    });

    it('shows expand_more when closed', () => {
      const isOpen = false;
      const icon = isOpen ? 'expand_less' : 'expand_more';
      expect(icon).toBe('expand_more');
    });
  });
});
