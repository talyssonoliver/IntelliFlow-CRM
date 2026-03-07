'use client';

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarWithSuspense,
  dealsSidebarConfig,
} from '@/components/sidebar';

export default function DealDetailLayout({ children }: Readonly<{ readonly children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)] w-full overflow-hidden">
        <SidebarWithSuspense config={dealsSidebarConfig} />

        {/* Main Content */}
        <SidebarInset>
          <main
            className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background relative"
            id="main-content"
          >
            {/* Mobile header with sidebar trigger */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm font-medium text-foreground">Deal Details</span>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
