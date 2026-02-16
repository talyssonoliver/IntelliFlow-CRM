import Link from 'next/link';

export default function MaintenancePage() {
  return (
    <div className="text-center space-y-6 max-w-md">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <svg className="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scheduled Maintenance</h1>
        <p className="mt-2 text-muted-foreground">
          We&apos;re performing scheduled maintenance to improve your experience.
          We&apos;ll be back shortly.
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Estimated downtime</p>
        <p className="text-lg font-semibold">2 hours</p>
      </div>
      <Link href="/status" className="inline-flex text-sm text-primary hover:underline">
        Check system status
      </Link>
    </div>
  );
}
