'use client';

import { useState, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset, SidebarWithSuspense } from '@/components/sidebar';
import {
  createContactsSidebarConfig,
  createContactsSettingsSidebarConfig,
  isContactSettingsPage,
} from '@/components/sidebar/configs/contacts';
import { ContactSettingsPanel } from '@/components/contacts/ContactSettingsPanel';
import { ContactSettingsSidebarNav } from '@/components/contacts/ContactSettingsSidebarNav';

export default function ContactsListLayout({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const onSettingsPage = isContactSettingsPage(pathname);

  const sidebarConfig = useMemo(() => {
    if (onSettingsPage) {
      return createContactsSettingsSidebarConfig(({ isExpanded }: { isExpanded: boolean }) => (
        <ContactSettingsSidebarNav isExpanded={isExpanded} />
      ));
    }
    return createContactsSidebarConfig(() => setSettingsOpen((prev) => !prev));
  }, [onSettingsPage]);

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={sidebarConfig} />

        {!onSettingsPage && (
          <ContactSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        )}

        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
