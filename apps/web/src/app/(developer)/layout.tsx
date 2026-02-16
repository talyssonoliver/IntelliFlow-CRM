import { DeveloperSidebar } from '@/components/navigation/developer-sidebar';

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto flex gap-8 px-4 py-8">
        <DeveloperSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
