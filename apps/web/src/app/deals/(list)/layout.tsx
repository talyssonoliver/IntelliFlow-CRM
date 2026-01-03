'use client';

import {
  SidebarProvider,
  AppSidebar,
  SidebarInset,
  SidebarTrigger,
  MobileSidebar,
  dealsSidebarConfig,
} from '@/components/sidebar';

export default function DealsListLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)] w-full overflow-hidden">
        {/* Left Sidebar - Deal Views & Segments (Desktop) */}
        <AppSidebar config={dealsSidebarConfig} />

        {/* Mobile Sidebar Drawer */}
        <MobileSidebar config={dealsSidebarConfig} />

        {/* Main Content */}
        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            {/* Mobile header with sidebar trigger */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Deals</span>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              <div className="w-full max-w-full overflow-hidden flex flex-col gap-4 sm:gap-6">
                {children}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
