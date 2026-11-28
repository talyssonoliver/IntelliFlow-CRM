'use client';

import {
  SidebarProvider,
  SidebarInset,
  SidebarWithSuspense,
  developerSidebarConfig,
  SectionMobileBar,
} from '@/components/sidebar';

export default function DeveloperLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <SidebarWithSuspense config={developerSidebarConfig} />
        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <SectionMobileBar title="Developer" />
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">{children}</div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
