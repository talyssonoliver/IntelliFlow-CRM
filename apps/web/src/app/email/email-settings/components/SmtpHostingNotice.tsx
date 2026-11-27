/**
 * MVP-001: says plainly, above the password form, that sending with a password does not work
 * on our hosting yet (outbound mail ports are closed there), and points to the one-click
 * sign-ins, which send over the provider's web API instead.
 */
export function SmtpHostingNotice() {
  return (
    <p
      role="note"
      data-testid="smtp-hosting-notice"
      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      Sending with a password does not work on our servers yet, so a mailbox set up here will show
      as needing attention. Use Connect Google, Microsoft or Zoho Mail above instead: they send
      through your provider directly.
    </p>
  );
}
