/**
 * Module visibility — one place that says which surfaces belong to which module.
 *
 * Owner ruling 23/11/2026: a module that is not part of the workspace is neither shown nor
 * reachable. The enabled set comes from the single resolver (`moduleAccess.getEnabledModules`,
 * which calls the domain's `resolveEnabledModules`); these helpers only map UI surfaces to modules.
 * No feature code or route is removed: a surface is hidden, and the server refuses its data.
 */

import { getModuleForRoute, type ModuleId } from '@intelliflow/domain';

/** Dashboard widgets that read a vertical module's data. Core widgets are absent. */
export const WIDGET_MODULE: Readonly<Record<string, ModuleId>> = {
  'open-tickets': 'SUPPORT',
};

/** Settings cards that configure a vertical module. Core settings are absent. */
export const SETTINGS_ITEM_MODULE: Readonly<Record<string, ModuleId>> = {
  tickets: 'SUPPORT',
  // Documents settings run on the legal document router (LEGAL-gated on the server).
  documents: 'LEGAL',
};

/** Search / pinned-item entity types that belong to a vertical module. */
export const ENTITY_TYPE_MODULE: Readonly<Record<string, ModuleId>> = {
  ticket: 'SUPPORT',
  TICKET: 'SUPPORT',
};

type IsEnabled = (moduleId: ModuleId) => boolean;

/** True unless the href belongs to a module the workspace does not have. */
export function isHrefAvailable(href: string, isModuleEnabled: IsEnabled): boolean {
  const moduleId = getModuleForRoute(href);
  return moduleId === undefined || isModuleEnabled(moduleId);
}

export function isWidgetAvailable(widgetType: string, isModuleEnabled: IsEnabled): boolean {
  const moduleId = WIDGET_MODULE[widgetType];
  return moduleId === undefined || isModuleEnabled(moduleId);
}

export function filterAvailableWidgets<T extends { type: string }>(
  widgets: readonly T[],
  isModuleEnabled: IsEnabled
): T[] {
  return widgets.filter((w) => isWidgetAvailable(w.type, isModuleEnabled));
}

export function isSettingsItemAvailable(itemId: string, isModuleEnabled: IsEnabled): boolean {
  const moduleId = SETTINGS_ITEM_MODULE[itemId];
  return moduleId === undefined || isModuleEnabled(moduleId);
}

export function isEntityTypeAvailable(entityType: string, isModuleEnabled: IsEnabled): boolean {
  const moduleId = ENTITY_TYPE_MODULE[entityType];
  return moduleId === undefined || isModuleEnabled(moduleId);
}
