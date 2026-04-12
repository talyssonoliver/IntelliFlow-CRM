'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
} from '@/components/sidebar';
import {
  createNotificationsSidebarConfig,
  createNotificationsSettingsSidebarConfig,
  isNotificationSettingsPage,
} from '@/components/sidebar/configs/notifications';
import { NotificationSettingsPanel } from '@/components/notifications/NotificationSettingsPanel';
import { NotificationSettingsSidebarNav } from '@/components/notifications/NotificationSettingsSidebarNav';

export default function NotificationsLayoutShell({
  children,
}: Readonly<{
  readonly children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const onSettingsPage = isNotificationSettingsPage(pathname);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const handleSettingsClick = useCallback(() => setSettingsOpen(true), []);
  const handleSettingsClose = useCallback(() => setSettingsOpen(false), []);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createNotificationsSettingsSidebarConfig(({ isExpanded }) => (
        <NotificationSettingsSidebarNav isExpanded={isExpanded} />
      ));
    }
    return createNotificationsSidebarConfig(handleSettingsClick);
  }, [onSettingsPage, handleSettingsClick]);

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={sidebarConfig} />

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            {/* Mobile header with sidebar trigger */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Notifications</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>

      {/* Module Settings slide-out panel */}
      {!onSettingsPage && (
        <NotificationSettingsPanel isOpen={settingsOpen} onClose={handleSettingsClose} />
      )}
    </SidebarProvider>
  );
}
