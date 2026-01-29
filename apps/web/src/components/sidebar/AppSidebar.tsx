'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@intelliflow/ui';
import { useSidebar } from './SidebarContext';
import type { SidebarConfig, SidebarItem, SidebarSection, SidebarAnnouncement } from './sidebar-types';
import { MODULE_COLORS } from './icon-reference';

type ModuleId = keyof typeof MODULE_COLORS;

interface AppSidebarProps {
  config: SidebarConfig;
  className?: string;
  /** Optional announcement to display at the bottom */
  announcement?: SidebarAnnouncement;
  /** Callback when announcement is dismissed */
  onDismissAnnouncement?: (id: string) => void;
}

/**
 * AppSidebar - Collapsible navigation sidebar
 *
 * Features:
 * - Expand on hover, collapse when mouse leaves
 * - Pin/unpin to keep expanded
 * - Context-specific navigation items
 * - Module-specific icon colors (only icons, not backgrounds)
 * - Full dark mode support
 * - Accessible with proper ARIA attributes
 */
export function AppSidebar({ config, className, announcement, onDismissAnnouncement }: AppSidebarProps) {
  const { isExpanded, isPinned, togglePinned, setHovered } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get module-specific color theme (only for icon colors)
  const moduleColor = React.useMemo(() => {
    return MODULE_COLORS[config.moduleId as ModuleId] || MODULE_COLORS.dashboard;
  }, [config.moduleId]);

  // Determine active item based on URL
  const isItemActive = React.useCallback(
    (item: SidebarItem): boolean => {
      const itemUrl = new URL(item.href, 'http://localhost');
      const itemPath = itemUrl.pathname;
      const itemParams = itemUrl.searchParams;

      // Check if paths match
      if (pathname !== itemPath && !pathname?.startsWith(itemPath + '/')) {
        return false;
      }

      // For items with query params, check if they match
      if (itemParams.toString()) {
        for (const [key, value] of itemParams.entries()) {
          if (searchParams.get(key) !== value) {
            return false;
          }
        }
        return true;
      }

      // For items without params, only active if no relevant params in URL
      const view = searchParams.get('view');
      const segment = searchParams.get('segment');
      return !view && !segment;
    },
    [pathname, searchParams]
  );

  return (
    <aside
      className={cn(
        'fixed left-0 top-16 bottom-0 z-30 flex flex-col bg-card border-r border-border',
        'transition-all duration-300 ease-in-out',
        isExpanded ? 'w-60' : 'w-14',
        'hidden lg:flex',
        className
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="navigation"
      aria-label={`${config.moduleTitle} navigation`}
      aria-expanded={isExpanded}
    >
      {/* Module Header */}
      <div className={cn(
        'flex items-center gap-3 px-3 py-4 border-b border-border',
        !isExpanded && 'justify-center'
      )}>
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          moduleColor.iconBg
        )}>
          <span className={cn('material-symbols-outlined text-xl', moduleColor.text)}>
            {config.moduleIcon}
          </span>
        </div>
        {isExpanded && (
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">
              {config.moduleTitle}
            </h2>
          </div>
        )}
        {isExpanded && (
          <button
            onClick={togglePinned}
            className={cn(
              'p-1 rounded-md transition-colors',
              isPinned
                ? 'text-muted-foreground bg-accent'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
            aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
            title={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
          >
            <span className="material-symbols-outlined text-lg">
              {isPinned ? 'push_pin' : 'push_pin'}
            </span>
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-4 px-2">
        <div className="flex flex-col gap-1">
          {config.sections.map((section, index) => (
            <React.Fragment key={section.id}>
              {/* Section separator (except for first section) */}
              {index > 0 && (
                <div className={cn(
                  'my-3',
                  isExpanded ? 'mx-3 border-t border-border' : 'mx-2 border-t border-border'
                )} />
              )}
              <SidebarSectionComponent
                section={section}
                isExpanded={isExpanded}
                isItemActive={isItemActive}
                moduleColor={moduleColor}
              />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Announcement Section - Marketing updates or app announcements */}
      {announcement && isExpanded && (
        <AnnouncementCard
          announcement={announcement}
          onDismiss={onDismissAnnouncement}
        />
      )}

      {/* Settings Footer */}
      {config.showSettings !== false && config.settingsHref && (
        <div className="mt-auto border-t border-border p-2">
          <Link
            href={config.settingsHref}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group',
              'text-muted-foreground hover:text-foreground hover:bg-accent',
              !isExpanded && 'justify-center'
            )}
          >
            <span className="material-symbols-outlined text-xl transition-colors group-hover:text-primary">
              settings
            </span>
            {isExpanded && <span className="font-medium">Module Settings</span>}
          </Link>
        </div>
      )}
    </aside>
  );
}

interface ModuleColorTheme {
  iconBg: string;
  text: string;
}

interface SidebarSectionComponentProps {
  section: SidebarSection;
  isExpanded: boolean;
  isItemActive: (item: SidebarItem) => boolean;
  moduleColor: ModuleColorTheme;
}

function SidebarSectionComponent({
  section,
  isExpanded,
  isItemActive,
  moduleColor,
}: SidebarSectionComponentProps) {
  return (
    <div>
      {isExpanded && (
        <div className="px-3 mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {section.title}
          </span>
        </div>
      )}
      <nav className="flex flex-col gap-1" role="menu" aria-label={section.title}>
        {section.items.map((item) => (
          <SidebarItemComponent
            key={item.id}
            item={item}
            isExpanded={isExpanded}
            isActive={isItemActive(item)}
            moduleColor={moduleColor}
          />
        ))}
      </nav>
    </div>
  );
}

interface SidebarItemComponentProps {
  item: SidebarItem;
  isExpanded: boolean;
  isActive: boolean;
  moduleColor: ModuleColorTheme;
}

function SidebarItemComponent({ item, isExpanded, isActive, moduleColor }: SidebarItemComponentProps) {
  const isSegment = Boolean(item.color);

  return (
    <Link
      href={item.href}
      role="menuitem"
      aria-current={isActive ? 'page' : undefined}
      title={!isExpanded ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group relative',
        isActive
          ? 'bg-primary/10 font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        !isExpanded && 'justify-center'
      )}
    >
      {/* Regular items: gray background + module-colored icon */}
      {/* Segment items: just the colored dot, no background */}
      {isSegment ? (
        <span
          className={cn(
            'material-symbols-outlined text-xl transition-colors',
            item.color
          )}
          aria-hidden="true"
        >
          fiber_manual_record
        </span>
      ) : (
        <div className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
          moduleColor.iconBg
        )}>
          <span
            className={cn(
              'material-symbols-outlined text-lg transition-colors',
              moduleColor.text
            )}
            aria-hidden="true"
          >
            {item.icon}
          </span>
        </div>
      )}
      {isExpanded && (
        <>
          <span className={cn(
            'flex-1 truncate',
            isActive ? 'text-foreground' : ''
          )}>{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
      {!isExpanded && item.badge !== undefined && item.badge > 0 && (
        <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
      )}
    </Link>
  );
}

/**
 * SidebarTrigger - Button to show/expand the sidebar
 * On mobile: opens mobile drawer
 * On desktop: toggles pinned state
 */
export function SidebarTrigger({ className }: { className?: string }) {
  const { togglePinned, toggleMobile, isPinned, isMobileOpen } = useSidebar();

  const handleClick = () => {
    // Check if we're on mobile (less than lg breakpoint)
    if (window.innerWidth < 1024) {
      toggleMobile();
    } else {
      togglePinned();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'p-2 rounded-lg transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-accent',
        (isPinned || isMobileOpen) && 'text-primary bg-primary/10',
        className
      )}
      aria-label={isMobileOpen || isPinned ? 'Close menu' : 'Open menu'}
      aria-expanded={isMobileOpen || isPinned}
    >
      <span className="material-symbols-outlined text-xl">
        {isMobileOpen || isPinned ? 'close' : 'menu'}
      </span>
    </button>
  );
}

/**
 * SidebarInset - Wrapper for main content that adjusts for sidebar width
 */
export function SidebarInset({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isExpanded, isPinned } = useSidebar();

  return (
    <div
      className={cn(
        'flex-1 min-w-0 overflow-hidden transition-all duration-300 ease-in-out',
        // Only offset when pinned (not just hovered)
        isPinned ? 'lg:ml-60' : 'lg:ml-14',
        // Add extra margin when expanded but not pinned for smooth transition
        isExpanded && !isPinned ? 'lg:ml-14' : '',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * AnnouncementCard - Marketing updates or app announcements
 * Displayed at the bottom of the sidebar, visible yet unobtrusive
 */
interface AnnouncementCardProps {
  announcement: SidebarAnnouncement;
  onDismiss?: (id: string) => void;
}

function AnnouncementCard({ announcement, onDismiss }: AnnouncementCardProps) {
  return (
    <div className="mx-2 mb-2 p-3 rounded-lg bg-muted/50 border border-border relative group">
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.preventDefault();
            onDismiss(announcement.id);
          }}
          className="absolute top-2 right-2 p-0.5 rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Dismiss announcement"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      )}

      {/* Content */}
      <div className="flex gap-3">
        {/* Icon */}
        {announcement.icon && (
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-lg text-primary">
              {announcement.icon}
            </span>
          </div>
        )}

        <div className="flex-1 min-w-0 pr-4">
          {/* Headline */}
          <p className="text-xs font-semibold text-foreground leading-tight">
            {announcement.headline}
          </p>

          {/* Description */}
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
            {announcement.description}
          </p>

          {/* Action */}
          <Link
            href={announcement.actionHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 mt-2 transition-colors"
          >
            {announcement.actionText}
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * MobileSidebar - Slide-out drawer for mobile navigation
 * Only renders on screens smaller than lg breakpoint
 */
interface MobileSidebarProps {
  config: SidebarConfig;
  announcement?: SidebarAnnouncement;
  onDismissAnnouncement?: (id: string) => void;
}

export function MobileSidebar({ config, announcement, onDismissAnnouncement }: MobileSidebarProps) {
  const { isMobileOpen, closeMobile } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = React.useState(false);

  // Track pathname to close sidebar on navigation
  const prevPathname = React.useRef(pathname);
  React.useEffect(() => {
    if (prevPathname.current !== pathname) {
      closeMobile();
      prevPathname.current = pathname;
    }
  }, [pathname, closeMobile]);

  // Only render after mount to avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Get module-specific color theme
  const moduleColor = React.useMemo(() => {
    return MODULE_COLORS[config.moduleId as ModuleId] || MODULE_COLORS.dashboard;
  }, [config.moduleId]);

  // Determine active item based on URL
  const isItemActive = React.useCallback(
    (item: SidebarItem): boolean => {
      const itemUrl = new URL(item.href, 'http://localhost');
      const itemPath = itemUrl.pathname;
      const itemParams = itemUrl.searchParams;

      if (pathname !== itemPath && !pathname?.startsWith(itemPath + '/')) {
        return false;
      }

      if (itemParams.toString()) {
        for (const [key, value] of itemParams.entries()) {
          if (searchParams.get(key) !== value) {
            return false;
          }
        }
        return true;
      }

      const view = searchParams.get('view');
      const segment = searchParams.get('segment');
      return !view && !segment;
    },
    [pathname, searchParams]
  );

  // Handle click on item - close sidebar
  const handleItemClick = () => {
    closeMobile();
  };

  // Handle escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        closeMobile();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOpen, closeMobile]);

  if (!mounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={closeMobile}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 z-50 w-72 bg-card border-r border-border',
          'transform transition-transform duration-300 ease-out lg:hidden',
          'flex flex-col shadow-2xl',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label={`${config.moduleTitle} navigation menu`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              moduleColor.iconBg
            )}>
              <span className={cn('material-symbols-outlined text-xl', moduleColor.text)}>
                {config.moduleIcon}
              </span>
            </div>
            <h2 className="text-base font-bold text-foreground">
              {config.moduleTitle}
            </h2>
          </div>
          <button
            onClick={closeMobile}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          <div className="flex flex-col gap-1">
            {config.sections.map((section, index) => (
              <React.Fragment key={section.id}>
                {index > 0 && (
                  <div className="my-3 mx-3 border-t border-border" />
                )}
                <div>
                  <div className="px-3 mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {section.title}
                    </span>
                  </div>
                  <nav className="flex flex-col gap-1" role="menu" aria-label={section.title}>
                    {section.items.map((item) => (
                      <MobileSidebarItem
                        key={item.id}
                        item={item}
                        isActive={isItemActive(item)}
                        moduleColor={moduleColor}
                        onClick={handleItemClick}
                      />
                    ))}
                  </nav>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Announcement */}
        {announcement && (
          <AnnouncementCard
            announcement={announcement}
            onDismiss={onDismissAnnouncement}
          />
        )}

        {/* Settings Footer */}
        {config.showSettings !== false && config.settingsHref && (
          <div className="border-t border-border p-3">
            <Link
              href={config.settingsHref}
              onClick={handleItemClick}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <span className="material-symbols-outlined text-xl">settings</span>
              <span className="font-medium">Module Settings</span>
            </Link>
          </div>
        )}
      </aside>
    </>,
    document.body
  );
}

interface MobileSidebarItemProps {
  item: SidebarItem;
  isActive: boolean;
  moduleColor: ModuleColorTheme;
  onClick: () => void;
}

function MobileSidebarItem({ item, isActive, moduleColor, onClick }: MobileSidebarItemProps) {
  const isSegment = Boolean(item.color);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      role="menuitem"
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
        isActive
          ? 'bg-primary/10 font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      {isSegment ? (
        <span
          className={cn('material-symbols-outlined text-xl', item.color)}
          aria-hidden="true"
        >
          fiber_manual_record
        </span>
      ) : (
        <div className={cn(
          'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0',
          moduleColor.iconBg
        )}>
          <span
            className={cn('material-symbols-outlined text-lg', moduleColor.text)}
            aria-hidden="true"
          >
            {item.icon}
          </span>
        </div>
      )}
      <span className={cn('flex-1', isActive ? 'text-foreground' : '')}>
        {item.label}
      </span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  );
}
