import { DashboardSidebar } from '@/components/navigation/dashboard-sidebar';
import { DashboardHeader } from '@/components/navigation/dashboard-header';
import { SettingsSidebar } from '@/components/navigation/settings-sidebar';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar />
      <div className="pl-64">
        <DashboardHeader />
        <div className="flex gap-8 p-6">
          <SettingsSidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
