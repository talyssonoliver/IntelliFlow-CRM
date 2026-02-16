import { PublicHeader } from '@/components/navigation/public-header';
import { PublicFooter } from '@/components/navigation/public-footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
