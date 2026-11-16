'use client';

import { Suspense, useEffect } from 'react';
import { AppSidebar, MobileSidebar } from './AppSidebar';
import { publishModuleNav } from './module-nav-store';
import type { SidebarConfig } from './sidebar-types';

function SidebarFallback() {
  return <div className="w-[var(--sidebar-width)] shrink-0" />;
}

export function SidebarWithSuspense({ config }: Readonly<{ config: SidebarConfig }>) {
  // On a phone the app's ≡ menu lists this module's sections, so the page needs no second menu.
  useEffect(() => publishModuleNav(config), [config]);

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
