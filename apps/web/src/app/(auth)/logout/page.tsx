import Link from 'next/link';

export default function LogoutPage() {
  return (
    <div className="text-center space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Signed out</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You have been successfully signed out of IntelliFlow.
        </p>
      </div>
      <Link
        href="/login"
        className="inline-flex rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Sign In Again
      </Link>
    </div>
  );
}
