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
  createAccountsSidebarConfig,
  createAccountsSettingsSidebarConfig,
  isAccountSettingsPage,
} from '@/components/sidebar/configs/accounts';
import { AccountSettingsPanel } from '@/components/accounts/AccountSettingsPanel';
import { AccountSettingsSidebarNav } from '@/components/accounts/AccountSettingsSidebarNav';

export default function AccountsListLayout({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isAccountSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createAccountsSettingsSidebarConfig(({ isExpanded }: { isExpanded: boolean }) => (
        <AccountSettingsSidebarNav isExpanded={isExpanded} />
      ));
    }
    return createAccountsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={sidebarConfig} />

        {!onSettingsPage && (
          <AccountSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        )}

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Accounts</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
