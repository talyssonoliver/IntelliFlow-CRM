'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { dashboardNav, type NavItem } from '@/config/navigation';

export function DashboardSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label]
    );
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside
      className={`fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Logo Section */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shrink-0">
              <span className="text-sm font-bold text-primary-foreground">IF</span>
            </div>
            <span className="text-lg font-bold">IntelliFlow</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">IF</span>
            </div>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${
            collapsed ? 'hidden' : ''
          }`}
          aria-label="Collapse sidebar"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        <ul className="space-y-1">
          {dashboardNav.map((item) => (
            <SidebarItem
              key={item.href}
              item={item}
              collapsed={collapsed}
              isActive={isActive(item.href)}
              isExpanded={expandedItems.includes(item.label)}
              onToggle={() => toggleExpanded(item.label)}
              pathname={pathname}
            />
          ))}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t p-2">
        <Link
          href="/settings"
          className={`flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${
            isActive('/settings') ? 'text-primary bg-primary/10' : ''
          }`}
        >
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {!collapsed && <span className="ml-3">Settings</span>}
        </Link>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="flex w-full items-center justify-center rounded-md px-3 py-2 mt-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Expand sidebar"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  collapsed,
  isActive,
  isExpanded,
  onToggle,
  pathname,
}: {
  item: NavItem;
  collapsed: boolean;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const hasChildren = item.children && item.children.length > 0;

  return (
    <li>
      <div className="flex items-center">
        <Link
          href={item.href}
          className={`flex flex-1 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          title={collapsed ? item.label : undefined}
        >
          <span className="h-5 w-5 shrink-0 flex items-center justify-center text-xs">
            {getIconForLabel(item.label)}
          </span>
          {!collapsed && <span className="ml-3 truncate">{item.label}</span>}
        </Link>
        {hasChildren && !collapsed && (
          <button
            onClick={onToggle}
            className="p-1 mr-1 rounded text-muted-foreground hover:text-foreground"
          >
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Sub-items */}
      {hasChildren && isExpanded && !collapsed && (
        <ul className="ml-6 mt-1 space-y-1 border-l pl-3">
          {item.children!.map((child) => (
            <li key={child.href}>
              <Link
                href={child.href}
                className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                  pathname === child.href
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {child.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function getIconForLabel(label: string): string {
  const iconMap: Record<string, string> = {
    Dashboard: 'D',
    Leads: 'L',
    Contacts: 'C',
    Accounts: 'A',
    Deals: '$',
    Activities: 'V',
    Emails: '@',
    Products: 'P',
    Quotes: 'Q',
    Orders: 'O',
    Documents: 'F',
    Tickets: 'T',
    Reports: 'R',
    Analytics: 'N',
  };
  return iconMap[label] || label[0];
}
