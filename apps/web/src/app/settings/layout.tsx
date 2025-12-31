import type { Metadata } from 'next';
import { SettingsSidebar } from '@/components/settings';

export const metadata: Metadata = {
  title: 'Settings | IntelliFlow CRM',
  description: 'Manage your account settings and preferences',
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <SettingsSidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
