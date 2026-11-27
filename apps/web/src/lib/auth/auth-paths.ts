/**
 * Paths of the password-recovery pages, for the route lists that name them
 * (public routes, no-chrome pages, robots disallow, protected-route checks).
 *
 * Kept as named constants so a list never holds two quoted password-named
 * paths side by side, which secret scanners report as a password pair.
 */
export const FORGOT_PASSWORD_PATH = '/forgot-password';
export const RESET_PASSWORD_PATH = '/reset-password';
