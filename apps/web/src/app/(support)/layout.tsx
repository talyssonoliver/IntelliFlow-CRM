import Link from 'next/link';

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">IF</span>
            </div>
            <span className="text-lg font-bold">IntelliFlow</span>
          </Link>
          <nav className="flex items-center space-x-1">
            <Link href="/support/help-center" className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors">
              Help Center
            </Link>
            <Link href="/support/tickets" className="px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              My Tickets
            </Link>
            <Link href="/support/chat" className="px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              Live Chat
            </Link>
          </nav>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Back to CRM
          </Link>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
