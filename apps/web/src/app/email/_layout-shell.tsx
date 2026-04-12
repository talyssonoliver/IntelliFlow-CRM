'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
} from '@/components/sidebar';
import {
  createEmailSidebarConfig,
  createEmailSettingsSidebarConfig,
  isEmailSettingsPage,
} from '@/components/sidebar/configs/email';
import { trpc } from '@/lib/trpc';
import { EmailSettingsPanel } from '@/components/email/EmailSettingsPanel';
import { EmailSettingsSidebarNav } from '@/components/email/EmailSettingsSidebarNav';

export default function EmailLayoutShell({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const unreadQuery = trpc.email.getUnreadCounts.useQuery({}, { refetchInterval: 30_000 });

  const onSettingsPage = isEmailSettingsPage(pathname);

  const config = useMemo(() => {
    if (onSettingsPage) {
      return createEmailSettingsSidebarConfig(
        ({ isExpanded }: { isExpanded: boolean }) => (
          <EmailSettingsSidebarNav isExpanded={isExpanded} />
        ),
        unreadQuery.data ?? undefined
      );
    }
    return createEmailSidebarConfig(unreadQuery.data ?? undefined, () =>
      setSettingsOpen((prev) => !prev)
    );
  }, [onSettingsPage, unreadQuery.data]);

  return (
    <SidebarProvider>
      <div className="flex h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={config} />

        {!onSettingsPage && (
          <EmailSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        )}

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Email</span>
            </div>
            <div className="flex-1 min-h-0">{children}</div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
