'use client';

import { Suspense } from 'react';
import { AppSidebar, MobileSidebar } from './AppSidebar';
import type { SidebarConfig } from './sidebar-types';

function SidebarFallback() {
  return <div className="w-[var(--sidebar-width)] shrink-0" />;
}

export function SidebarWithSuspense({ config }: Readonly<{ config: SidebarConfig }>) {
  return (
    <>
      <Suspense fallback={<SidebarFallback />}>
        <AppSidebar config={config} />
      </Suspense>
      <Suspense fallback={null}>
        <MobileSidebar config={config} />
      </Suspense>
    </>
  );
}
