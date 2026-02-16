import Link from 'next/link';

export default function VerifyEmailPage({ params }: { params: { token: string } }) {
  return (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Verifying your email...</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please wait while we verify your email address.
        </p>
      </div>
      <Link
        href="/login"
        className="inline-flex rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-accent transition-colors"
      >
        Continue to Sign In
      </Link>
    </div>
  );
}
