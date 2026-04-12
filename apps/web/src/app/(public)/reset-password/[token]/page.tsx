import { redirect } from 'next/navigation';

/**
 * Legacy Reset Password Route — Backward Compatibility (NF-005)
 *
 * Old-style /reset-password/[token] URLs are no longer valid.
 * Supabase redirects to /reset-password/callback?access_token=...
 * Redirect users to /forgot-password to request a new link.
 */
export default async function ResetPasswordPage() {
  redirect('/forgot-password');
}
