import Link from 'next/link';

export default function MfaVerifyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Two-factor authentication</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>

      <form className="space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium mb-1.5">
            Verification code
          </label>
          <input
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm text-center tracking-[0.5em] font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Verify
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Lost access to your authenticator?{' '}
        <Link href="/support/help-center" className="font-medium text-primary hover:underline">
          Get help
        </Link>
      </p>
    </div>
  );
}
