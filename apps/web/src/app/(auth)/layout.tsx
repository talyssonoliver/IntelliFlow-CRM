import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="flex flex-col justify-between p-12 text-primary-foreground relative z-10">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/20">
              <span className="text-sm font-bold">IF</span>
            </div>
            <span className="text-lg font-bold">IntelliFlow</span>
          </Link>
          <div>
            <blockquote className="text-lg font-medium leading-relaxed">
              &ldquo;IntelliFlow transformed our sales process. AI scoring helped us
              focus on the right leads and close 40% more deals.&rdquo;
            </blockquote>
            <p className="mt-4 text-sm opacity-80">Sarah Johnson, VP Sales at TechCorp</p>
          </div>
          <p className="text-sm opacity-60">AI-powered CRM for intelligent sales automation</p>
        </div>
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary-foreground/5" />
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary-foreground/5" />
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-20">
        <div className="lg:hidden mb-8">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">IF</span>
            </div>
            <span className="text-lg font-bold">IntelliFlow</span>
          </Link>
        </div>
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
