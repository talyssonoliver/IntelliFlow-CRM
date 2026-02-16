import Link from 'next/link';
import { PublicHeader } from '@/components/navigation/public-header';
import { PublicFooter } from '@/components/navigation/public-footer';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="mx-auto max-w-3xl prose prose-gray dark:prose-invert">
          {children}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
