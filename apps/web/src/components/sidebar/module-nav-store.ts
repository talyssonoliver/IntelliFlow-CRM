/**
 * The open module's sidebar sections, shared with the app's phone menu (MVP-006).
 *
 * On a phone the page used to show two menus: the app's ≡ in the top bar and a second
 * "≡ <Module>" bar for the module's own sidebar. The module's sidebar now publishes its sections
 * here while it is mounted, and the app menu lists them under the module, so a phone has one
 * menu. The app menu lives in the root layout, above the module layouts, so a React context
 * cannot carry this; a small store can.
 */
import { useSyncExternalStore } from 'react';
import type { SidebarConfig, SidebarSection } from './sidebar-types';

/** The open module's sidebar config, as its own sidebar renders it. */
export type ModuleNav = SidebarConfig;

let current: ModuleNav | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Publish a module's sections; returns the function that withdraws them (for effect cleanup). */
export function publishModuleNav(config: SidebarConfig) {
  const entry: ModuleNav = config;
  current = entry;
  emit();
  return () => {
    // Only withdraw our own entry: a newer module may already have published its own.
    if (current === entry) {
      current = null;
      emit();
    }
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => current;
const readOnServer = () => null;

/** The sections of the module open now, or null outside a module. */
export function useModuleNav(): ModuleNav | null {
  return useSyncExternalStore(subscribe, read, readOnServer);
}

/** Sections a role may see: items with `roles` only for those roles, and no empty section. */
export function visibleSections(sections: readonly SidebarSection[], role: string | undefined) {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          !item.roles ||
          item.roles.length === 0 ||
          (role !== undefined && item.roles.includes(role))
      ),
    }))
    .filter((section) => section.items.length > 0);
}
