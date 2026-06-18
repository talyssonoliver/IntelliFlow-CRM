import { describe, it, expect } from 'vitest';
import { isProtectedAppRoute, isPublicAuthRoute } from '../route-protection';

describe('isPublicAuthRoute (OnboardingWelcome gate)', () => {
  // The welcome modal must NOT interrupt the user mid auth-flow.
  it.each([
    '/login',
    '/signup',
    '/signup/success',
    '/logout',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/verify-email/callback',
    '/mfa',
    '/mfa/verify',
    '/auth/callback',
    '/sso',
  ])('treats %s as a public auth route (modal suppressed)', (path) => {
    expect(isPublicAuthRoute(path)).toBe(true);
  });

  // Regression for the OnboardingWelcome bug: OAuth users land on `/`, and the
  // prior `isProtectedAppRoute` gate excluded `/`, so the modal never fired.
  it.each(['/', '/dashboard', '/leads', '/profile', '/billing'])(
    'allows the welcome modal on app route %s (not a public auth route)',
    (path) => {
      expect(isPublicAuthRoute(path)).toBe(false);
    }
  );

  it('does not misclassify a route that merely starts with a similar string', () => {
    // `/loginnnn` is not the `/login` prefix boundary.
    expect(isPublicAuthRoute('/loginnnn')).toBe(false);
    // but `/login/whatever` is under the /login prefix
    expect(isPublicAuthRoute('/login/help')).toBe(true);
  });
});

describe('isProtectedAppRoute (unchanged behaviour)', () => {
  it('keeps `/` OUT of protected routes (it is public/mixed)', () => {
    expect(isProtectedAppRoute('/')).toBe(false);
  });
  it('still matches protected app sections', () => {
    expect(isProtectedAppRoute('/dashboard')).toBe(true);
    expect(isProtectedAppRoute('/leads/new')).toBe(true);
  });
});
