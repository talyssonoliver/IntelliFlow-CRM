import { describe, it, expect } from 'vitest';
import { resolveEnabledModules, type ModuleId } from '@intelliflow/domain';
import {
  filterAvailableWidgets,
  isEntityTypeAvailable,
  isHrefAvailable,
  isSettingsItemAvailable,
} from '../module-visibility';
import { getResolvedCategories } from '@/lib/shared/settings-search';
import { buildNavLayout } from '@/components/header/nav-groups';
import { getRoutesForModules } from '@intelliflow/domain';

const enabledFor = (businessType: Parameters<typeof resolveEnabledModules>[0]['businessType']) => {
  const set = new Set<ModuleId>(resolveEnabledModules({ plan: 'PROFESSIONAL', businessType }));
  return (m: ModuleId) => set.has(m);
};

const trades = enabledFor('TRADES_HOME_SERVICES');
const agency = enabledFor('AGENCY');
const law = enabledFor('LAW_FIRM');

describe('hrefs', () => {
  it('hides Cases and Tickets pages for trades, keeps core pages', () => {
    expect(isHrefAvailable('/cases', trades)).toBe(false);
    expect(isHrefAvailable('/cases/123', trades)).toBe(false);
    expect(isHrefAvailable('/tickets', trades)).toBe(false);
    expect(isHrefAvailable('/help-center', trades)).toBe(false);
    expect(isHrefAvailable('/leads', trades)).toBe(true);
    expect(isHrefAvailable('/settings/integrations', trades)).toBe(true);
  });

  it('shows Tickets for an agency and Cases for a law firm', () => {
    expect(isHrefAvailable('/tickets', agency)).toBe(true);
    expect(isHrefAvailable('/cases', agency)).toBe(false);
    expect(isHrefAvailable('/cases', law)).toBe(true);
    expect(isHrefAvailable('/tickets', law)).toBe(false);
  });
});

describe('dashboard widgets', () => {
  const widgets = [
    { id: 'w1', type: 'total-leads' },
    { id: 'w4', type: 'open-tickets' },
    { id: 'w5', type: 'pipeline-summary' },
  ];

  it('drops the Open Tickets widget when SUPPORT is not enabled', () => {
    expect(filterAvailableWidgets(widgets, trades).map((w) => w.type)).toEqual([
      'total-leads',
      'pipeline-summary',
    ]);
  });

  it('keeps it for an agency', () => {
    expect(filterAvailableWidgets(widgets, agency)).toHaveLength(3);
  });
});

describe('search and pinned entity types', () => {
  it('tickets are not offered without SUPPORT', () => {
    expect(isEntityTypeAvailable('ticket', trades)).toBe(false);
    expect(isEntityTypeAvailable('TICKET', trades)).toBe(false);
    expect(isEntityTypeAvailable('ticket', agency)).toBe(true);
    expect(isEntityTypeAvailable('lead', trades)).toBe(true);
  });
});

describe('settings', () => {
  it('hides the Tickets and Documents settings cards for trades', () => {
    expect(isSettingsItemAvailable('tickets', trades)).toBe(false);
    expect(isSettingsItemAvailable('documents', trades)).toBe(false);
    expect(isSettingsItemAvailable('leads', trades)).toBe(true);

    const ids = getResolvedCategories(undefined, trades).flatMap((c) => c.items.map((i) => i.id));
    expect(ids).not.toContain('tickets');
    expect(ids).not.toContain('documents');
    expect(ids).toContain('workspace');
  });

  it('shows Tickets settings for an agency and Documents for a law firm', () => {
    const agencyIds = getResolvedCategories(undefined, agency).flatMap((c) =>
      c.items.map((i) => i.id)
    );
    const lawIds = getResolvedCategories(undefined, law).flatMap((c) => c.items.map((i) => i.id));
    expect(agencyIds).toContain('tickets');
    expect(lawIds).toContain('documents');
  });

  it('the search finds no Tickets card for trades', () => {
    const found = getResolvedCategories('ticket', trades).flatMap((c) => c.items.map((i) => i.id));
    expect(found).not.toContain('tickets');
  });
});

describe('top navigation', () => {
  it('never draws Cases or Tickets for a trades workspace', () => {
    const modules = resolveEnabledModules({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
    });
    const layout = buildNavLayout(
      getRoutesForModules(modules).map((r) => ({ label: r.label, href: r.href, icon: r.icon }))
    );
    const all = [...layout.primary, ...layout.groups.flatMap((g) => g.routes)].map((r) => r.href);
    expect(all).not.toContain('/cases');
    expect(all).not.toContain('/tickets');
    expect(all).toContain('/leads');
  });
});
