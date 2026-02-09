'use client';

import {
  SidebarProvider,
  AppSidebar,
  SidebarInset,
  SidebarTrigger,
  MobileSidebar,
  governanceSidebarConfig,
} from '@/components/sidebar';

export default function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar config={governanceSidebarConfig} />
        <MobileSidebar config={governanceSidebarConfig} />
        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Governance</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="mx-auto flex flex-col gap-6">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
