/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

let pathname = '/logout';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: null }),
}));

vi.mock('@/hooks/useEnabledModules', () => ({
  useEnabledModules: () => ({ enabledRoutes: [], isLoading: false, isError: false }),
}));

import { Navigation } from '../navigation';

describe('Navigation on the sign-in screens', () => {
  it.each(['/logout', '/mfa/verify', '/sso', '/login', '/signup'])(
    'renders no app bar on %s, even for a signed-in user',
    (route) => {
      pathname = route;
      const { container } = render(<Navigation />);
      expect(container.querySelector('header')).toBeNull();
    }
  );
});
