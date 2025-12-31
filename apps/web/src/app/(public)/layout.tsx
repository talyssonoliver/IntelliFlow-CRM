import * as React from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PublicHeader />
      <main className="min-h-screen bg-[#f6f7f8] dark:bg-[#101922]">
        {children}
      </main>
      <PublicFooter />
    </>
  );
}
