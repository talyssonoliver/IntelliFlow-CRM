'use client';

/**
 * ModuleSettingsNav
 *
 * Shared complementary navigation panel that overlays next to the main sidebar
 * when "Module Settings" is clicked. Renders a vertical list of navigation items.
 * The main content area blurs behind it (sidebar stays clear).
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   const config = useMemo(() => createModuleSidebarConfig(() => setOpen(p => !p)), []);
 *
 *   <SidebarWithSuspense config={config} />
 *   <ModuleSettingsNav
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     title="Ticket Settings"
 *     items={[{ id: 'sla', label: 'SLA', icon: 'tune', href: '/tickets/sla' }]}
 *   />
 *   <SidebarInset>
 *     <main id="main-content" className="relative">
 *       ...
 *     </main>
 *   </SidebarInset>
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { useSidebarOptional } from '@/components/sidebar';

export interface ModuleSettingsNavItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
  href: string;
}

export interface ModuleSettingsNavProps {
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Called when the user dismisses the panel */
  onClose: () => void;
  /** Header title */
  title: string;
  /** Navigation items */
  items: readonly ModuleSettingsNavItem[];
  /**
   * Selector for the main content element that receives the blur backdrop.
   * Defaults to '#main-content'.
   */
  backdropTarget?: string;
}

export function ModuleSettingsNav({
  isOpen,
  onClose,
  title,
  items,
  backdropTarget = 'main#main-content',
}: Readonly<ModuleSettingsNavProps>) {
  const pathname = usePathname();
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const prevPathRef = useRef(pathname);
  const sidebarCtx = useSidebarOptional();
  const sidebarPinned = sidebarCtx?.isPinned ?? false;

  // When panel opens, collapse the sidebar hover so it snaps to icon-only mode
  useEffect(() => {
    if (isOpen && sidebarCtx) {
      sidebarCtx.setHovered(false);
    }
  }, [isOpen, sidebarCtx]);

  // Resolve backdrop target element
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(backdropTarget);
    setTargetEl(el);
  }, [backdropTarget]);

  // Dismiss on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Track path changes for active state (optimistic)
  useEffect(() => {
    prevPathRef.current = pathname;
  }, [pathname]);

  return (
    <>
      {/* Backdrop layer 1 — sidebar area: 40% dim */}
      {isOpen && createPortal(
        <div
          className={cn(
            'fixed top-16 bottom-0 left-0 z-[31] backdrop-blur-[2px] transition-opacity duration-150 ease-out',
            sidebarPinned ? 'w-60' : 'w-14',
          )}
          onClick={onClose}
          onMouseEnter={() => sidebarCtx?.setHovered(false)}
          aria-hidden="true"
        />,
        document.body,
      )}

      {/* Backdrop layer 2 — page content: 80% dim + blur */}
      {isOpen && targetEl && createPortal(
        <div
          className="absolute inset-0 z-20 backdrop-blur-lg transition-opacity duration-150 ease-out"
          onClick={onClose}
          aria-hidden="true"
        />,
        targetEl,
      )}

      {/* Navigation panel — slides in next to sidebar */}
      <aside
        aria-label={title}
        aria-hidden={!isOpen}
        className={cn(
          'fixed top-16 bottom-0 z-[28]',
          'w-56',
          'border-r border-border bg-card shadow-lg',
          'flex flex-col',
          'transition-[left,opacity] duration-200 ease-out',
          isOpen
            ? `${sidebarPinned ? 'left-60' : 'left-14'} opacity-100`
            : 'left-0 opacity-0 pointer-events-none',
        )}
      >
        {/* Spacer pushes items to bottom */}
        <div className="flex-1" />

        {/* Navigation items — stacked above the footer */}
        <div className="mx-3 border-t border-border" />
        <nav className="p-2 space-y-0.5" aria-label={`${title} navigation`}>
          {items.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm group',
                  'transition-colors duration-100 ease-out',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
                style={{
                  animationDelay: isOpen ? `${index * 30}ms` : undefined,
                }}
              >
                <span
                  className={cn(
                    'material-symbols-outlined text-lg mt-0.5 transition-colors duration-100',
                    isActive ? 'text-primary' : 'group-hover:text-primary',
                  )}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.label}</div>
                  {item.description && (
                    <div className="text-xs text-muted-foreground truncate">
                      {item.description}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer — aligned with "Module Settings" button in the main sidebar */}
        <div className="mt-auto border-t border-border p-2">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="material-symbols-outlined text-base text-muted-foreground"
                aria-hidden="true"
              >
                settings
              </span>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider truncate">
                {title}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Close settings panel"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                close
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
