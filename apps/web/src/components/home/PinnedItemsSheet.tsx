'use client';

import { useState, useCallback, useRef } from 'react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@intelliflow/ui';
import { trackQuickActionsSettingsSaved, trackPinnedNavSettingsSaved } from '@/lib/analytics';

// =============================================================================
// All available quick actions (superset of what can appear on home)
// =============================================================================

interface QuickActionDef {
  id: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  href: string;
  comingSoon?: boolean;
}

const ALL_QUICK_ACTIONS: QuickActionDef[] = [
  {
    id: 'action-call',
    icon: 'add_call',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconColor: 'text-blue-600',
    label: 'Log Call',
    description: 'Record a new interaction',
    href: '/calls/new',
    comingSoon: true,
  },
  {
    id: 'action-email',
    icon: 'mail',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600',
    label: 'Send Email',
    description: 'Compose message to contact',
    href: '/email',
  },
  {
    id: 'action-meeting',
    icon: 'event',
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconColor: 'text-amber-600',
    label: 'New Appointment',
    description: 'Book time with a client',
    href: '/appointments/new',
  },
  {
    id: 'action-task',
    icon: 'task',
    iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    iconColor: 'text-purple-600',
    label: 'Create Task',
    description: 'Set reminder for yourself',
    href: '/tasks',
  },
  {
    id: 'action-lead',
    icon: 'person_add',
    iconBg: 'bg-indigo-50 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600',
    label: 'Add Lead',
    description: 'Create new prospect entry',
    href: '/leads/new',
  },
  {
    id: 'action-deal',
    icon: 'handshake',
    iconBg: 'bg-pink-50 dark:bg-pink-900/30',
    iconColor: 'text-pink-600',
    label: 'New Deal',
    description: 'Open a potential opportunity',
    href: '/deals',
  },
  {
    id: 'action-document',
    icon: 'upload_file',
    iconBg: 'bg-cyan-50 dark:bg-cyan-900/30',
    iconColor: 'text-cyan-600',
    label: 'Upload Document',
    description: 'Add files to repository',
    href: '/documents/new',
  },
  {
    id: 'action-report',
    icon: 'description',
    iconBg: 'bg-orange-50 dark:bg-orange-900/30',
    iconColor: 'text-orange-600',
    label: 'Generate Report',
    description: 'Run quick analytics export',
    href: '/reports/new',
    comingSoon: true,
  },
];

// Default enabled action IDs (matches the 4 currently on home page)
const DEFAULT_ENABLED = new Set(['action-call', 'action-email', 'action-meeting', 'action-task']);

// localStorage key
const STORAGE_KEY = 'intelliflow:quick-actions';

// =============================================================================
// Persistence helpers
// =============================================================================

function loadEnabledActions(): Set<string> {
  if (typeof globalThis.window === 'undefined') return DEFAULT_ENABLED;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const ids = JSON.parse(stored) as string[];
      return new Set(ids);
    }
  } catch {
    // ignore
  }
  return new Set(DEFAULT_ENABLED);
}

function saveEnabledActions(ids: Readonly<Set<string>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

// =============================================================================
// Exported helpers for home page to consume
// =============================================================================

export { ALL_QUICK_ACTIONS, loadEnabledActions };
export type { QuickActionDef };

// =============================================================================
// Toggle Switch component (matches mockup exactly)
// =============================================================================

function Toggle({
  checked,
  onChange,
}: Readonly<{ checked: boolean; onChange: (v: boolean) => void }>) {
  return (
    <label
      aria-label={`Toggle ${checked ? 'off' : 'on'}`}
      className="relative inline-flex items-center cursor-pointer"
    >
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#137fec]" />
    </label>
  );
}

// =============================================================================
// Edit Quick Actions Sheet
// =============================================================================

interface EditQuickActionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (enabledIds: Set<string>) => void;
}

export function EditQuickActionsSheet({
  open,
  onOpenChange,
  onSave,
}: Readonly<EditQuickActionsSheetProps>) {
  const [draft, setDraft] = useState<Set<string>>(() => loadEnabledActions());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Reset draft when opening
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const loaded = loadEnabledActions();
        setDraft(loaded);
        draftRef.current = loaded;
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleToggle = useCallback((id: string, enabled: boolean) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.add(id);
      } else {
        next.delete(id);
      }
      draftRef.current = next;
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const current = draftRef.current;
    saveEnabledActions(current);
    trackQuickActionsSettingsSaved(current.size);
    onSave(current);
    onOpenChange(false);
  }, [onSave, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md flex flex-col overflow-hidden p-0 gap-0"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#e2e8f0] dark:border-[#334155] flex-shrink-0">
          <SheetTitle className="text-xl font-bold text-slate-900 dark:text-white">
            Edit Quick Actions
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select and pin actions to your home dashboard
          </SheetDescription>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-1">
          {ALL_QUICK_ACTIONS.map((action) => (
            <div
              key={action.id}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`size-10 ${action.iconBg} ${action.iconColor} rounded-lg flex items-center justify-center`}
                >
                  <span className="material-symbols-outlined">{action.icon}</span>
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-200 text-sm">
                    {action.label}
                  </p>
                  <p className="text-xs text-slate-500">{action.description}</p>
                </div>
              </div>
              <Toggle checked={draft.has(action.id)} onChange={(v) => handleToggle(action.id, v)} />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#e2e8f0] dark:border-[#334155] bg-slate-50/50 dark:bg-slate-800/20 flex gap-3 flex-shrink-0">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 bg-[#137fec] text-white rounded-lg font-semibold hover:bg-[#0e6ac7] transition-colors shadow-sm"
          >
            Save Changes
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2.5 border border-[#e2e8f0] dark:border-[#334155] text-slate-600 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// Pinned Items Sheet
// =============================================================================

interface PinnedItemDisplay {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  subtitle?: string | null;
  url: string;
}

interface IconStyle {
  icon: string;
  iconBg: string;
  iconColor: string;
}

const PINNED_ICON_MAP: Record<string, IconStyle> = {
  document: {
    icon: 'folder_special',
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600',
  },
  contact: {
    icon: 'contacts',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600',
  },
  list: { icon: 'contacts', iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconColor: 'text-blue-600' },
  lead: { icon: 'person', iconBg: 'bg-cyan-100 dark:bg-cyan-900/30', iconColor: 'text-cyan-600' },
  opportunity: {
    icon: 'attach_money',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600',
  },
  report: {
    icon: 'assessment',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600',
  },
  ticket: {
    icon: 'confirmation_number',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600',
  },
};

const DEFAULT_ICON: IconStyle = {
  icon: 'push_pin',
  iconBg: 'bg-slate-100 dark:bg-slate-800',
  iconColor: 'text-slate-600',
};

function getPinnedIcon(entityType: string): IconStyle {
  return PINNED_ICON_MAP[entityType] || DEFAULT_ICON;
}

// Re-export for AuthenticatedHomePage inline pinned card usage
export { PINNED_ICON_MAP, DEFAULT_ICON, getPinnedIcon };

// =============================================================================
// Pinned Navigation Groups (for Edit Pinned Navigation sheet)
// =============================================================================

interface PinnedNavGroup {
  id: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  entityTypes: string[];
  href: string;
}

const ALL_PINNED_NAV_GROUPS: PinnedNavGroup[] = [
  {
    id: 'nav-leads',
    icon: 'person_search',
    iconBg: 'bg-indigo-50 dark:bg-indigo-900/30',
    iconColor: 'text-indigo-600',
    label: 'Leads',
    description: 'Track and manage potential prospects',
    entityTypes: ['lead'],
    href: '/leads',
  },
  {
    id: 'nav-contacts',
    icon: 'contacts',
    iconBg: 'bg-blue-50 dark:bg-blue-900/30',
    iconColor: 'text-blue-600',
    label: 'Contacts',
    description: 'Full address book and history',
    entityTypes: ['contact'],
    href: '/contacts',
  },
  {
    id: 'nav-deals',
    icon: 'handshake',
    iconBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600',
    label: 'Deals',
    description: 'Sales pipeline and revenue tracking',
    entityTypes: ['opportunity'],
    href: '/deals',
  },
  {
    id: 'nav-tickets',
    icon: 'confirmation_number',
    iconBg: 'bg-amber-50 dark:bg-amber-900/30',
    iconColor: 'text-amber-600',
    label: 'Tickets',
    description: 'Customer support and service requests',
    entityTypes: ['ticket'],
    href: '/tickets',
  },
  {
    id: 'nav-analytics',
    icon: 'monitoring',
    iconBg: 'bg-purple-50 dark:bg-purple-900/30',
    iconColor: 'text-purple-600',
    label: 'Analytics',
    description: 'Performance reports and dashboards',
    entityTypes: ['report'],
    href: '/analytics',
  },
  {
    id: 'nav-marketing',
    icon: 'campaign',
    iconBg: 'bg-pink-50 dark:bg-pink-900/30',
    iconColor: 'text-pink-600',
    label: 'Marketing',
    description: 'Email campaigns and automation',
    entityTypes: ['list'],
    href: '/marketing',
  },
  {
    id: 'nav-knowledge',
    icon: 'menu_book',
    iconBg: 'bg-cyan-50 dark:bg-cyan-900/30',
    iconColor: 'text-cyan-600',
    label: 'Knowledge Base',
    description: 'Internal docs and customer help',
    entityTypes: ['document'],
    href: '/documents',
  },
];

const DEFAULT_PINNED_GROUPS = new Set(['nav-leads', 'nav-contacts', 'nav-deals']);
const PINNED_GROUPS_STORAGE_KEY = 'intelliflow:pinned-groups';

function loadPinnedGroups(): Set<string> {
  if (typeof globalThis.window === 'undefined') return DEFAULT_PINNED_GROUPS;
  try {
    const stored = localStorage.getItem(PINNED_GROUPS_STORAGE_KEY);
    if (stored) {
      return new Set(JSON.parse(stored) as string[]);
    }
  } catch {
    // ignore
  }
  return new Set(DEFAULT_PINNED_GROUPS);
}

function savePinnedGroups(ids: Readonly<Set<string>>): void {
  try {
    localStorage.setItem(PINNED_GROUPS_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

export { ALL_PINNED_NAV_GROUPS, loadPinnedGroups };
export type { PinnedNavGroup };

// =============================================================================
// Edit Pinned Navigation Sheet (star icons, matches mockup)
// =============================================================================

interface EditPinnedNavigationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (enabledGroupIds: Set<string>) => void;
  pinnedItems?: PinnedItemDisplay[];
  onUnpin: (entityType: string, entityId: string) => void;
}

const STAR_FILLED_STYLE: React.CSSProperties = {
  fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
};

export function EditPinnedNavigationSheet({
  open,
  onOpenChange,
  onSave,
  pinnedItems,
  onUnpin,
}: Readonly<EditPinnedNavigationSheetProps>) {
  const [draft, setDraft] = useState<Set<string>>(() => loadPinnedGroups());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        const loaded = loadPinnedGroups();
        setDraft(loaded);
        draftRef.current = loaded;
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  const handleToggle = useCallback((id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      draftRef.current = next;
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    const current = draftRef.current;
    savePinnedGroups(current);
    trackPinnedNavSettingsSaved(current.size);
    onSave(current);
    onOpenChange(false);
  }, [onSave, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md flex flex-col overflow-hidden p-0 gap-0"
      >
        {/* Header */}
        <div className="p-6 border-b border-[#e2e8f0] dark:border-[#334155] flex-shrink-0">
          <SheetTitle className="text-xl font-bold text-slate-900 dark:text-white">
            Edit Pinned Navigation
          </SheetTitle>
          <SheetDescription className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Select items to pin to your sidebar for quick access
          </SheetDescription>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Groups with star toggle */}
          <div className="space-y-2">
            {ALL_PINNED_NAV_GROUPS.map((group) => {
              const isStarred = draft.has(group.id);
              return (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`size-10 ${group.iconBg} ${group.iconColor} rounded-lg flex items-center justify-center`}
                    >
                      <span className="material-symbols-outlined">{group.icon}</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-200 text-sm">
                        {group.label}
                      </p>
                      <p className="text-xs text-slate-500">{group.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(group.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      isStarred
                        ? 'text-[#137fec] hover:bg-blue-50 dark:hover:bg-blue-900/20'
                        : 'text-slate-300 dark:text-slate-600 hover:text-[#137fec]'
                    }`}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={isStarred ? STAR_FILLED_STYLE : undefined}
                    >
                      star
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Individual pinned items with unpin */}
          {pinnedItems && pinnedItems.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                Pinned Items
              </p>
              <div className="space-y-1">
                {pinnedItems.map((item) => {
                  const iconStyle = getPinnedIcon(item.entityType);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div
                          className={`size-10 ${iconStyle.iconBg} ${iconStyle.iconColor} rounded-lg flex items-center justify-center shrink-0`}
                        >
                          <span className="material-symbols-outlined">{iconStyle.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-200 text-sm truncate">
                            {item.title}
                          </p>
                          {item.subtitle && (
                            <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => onUnpin(item.entityType, item.entityId)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-2 shrink-0"
                        title="Unpin"
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#e2e8f0] dark:border-[#334155] bg-slate-50/50 dark:bg-slate-800/20 flex gap-3 flex-shrink-0">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2.5 bg-[#137fec] text-white rounded-lg font-semibold hover:bg-[#0e6ac7] transition-colors shadow-sm"
          >
            Save Changes
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2.5 border border-[#e2e8f0] dark:border-[#334155] text-slate-600 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
