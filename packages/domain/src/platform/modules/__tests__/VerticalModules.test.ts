import { describe, it, expect } from 'vitest';
import { PLAN_TIERS, CRM_MODULES, type ModuleId, type PlanTier } from '../ModuleRegistry';
import { getRoutesForModules } from '../ModuleRoutes';
import {
  TENANT_BUSINESS_TYPES,
  VERTICAL_MODULE_MAP,
  resolveEnabledModules,
  isModuleResolvedEnabled,
  getModulesForBusinessType,
  isTenantBusinessType,
  dataProtectionFor,
  type TenantBusinessType,
} from '../VerticalModules';

const CORE_SET: ModuleId[] = ['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS'];

describe('VERTICAL_MODULE_MAP', () => {
  it('gives every business type the core, AI and analytics modules', () => {
    for (const type of TENANT_BUSINESS_TYPES) {
      expect(VERTICAL_MODULE_MAP[type]).toEqual(expect.arrayContaining(CORE_SET));
    }
  });

  it('grants each vertical module to exactly one business type', () => {
    const owners = (m: ModuleId) =>
      TENANT_BUSINESS_TYPES.filter((t) => VERTICAL_MODULE_MAP[t].includes(m));
    expect(owners('SUPPORT')).toEqual(['AGENCY']);
    expect(owners('LEGAL')).toEqual(['LAW_FIRM']);
    expect(owners('COMMERCE')).toEqual(['SHOP_ECOMMERCE']);
  });

  it('OTHER and a missing business type get the core set only', () => {
    expect(getModulesForBusinessType('OTHER')).toEqual(CORE_SET);
    expect(getModulesForBusinessType(null)).toEqual(CORE_SET);
    expect(getModulesForBusinessType(undefined)).toEqual(CORE_SET);
  });

  it('validates business type strings', () => {
    expect(isTenantBusinessType('LAW_FIRM')).toBe(true);
    expect(isTenantBusinessType('PLUMBER')).toBe(false);
    expect(isTenantBusinessType(null)).toBe(false);
  });
});

describe('resolveEnabledModules matrix (business type x plan)', () => {
  const matrix: Array<[TenantBusinessType, PlanTier, ModuleId[]]> = [
    ['TRADES_HOME_SERVICES', 'PARTNER_FREE', ['CORE_CRM']],
    ['TRADES_HOME_SERVICES', 'STARTER', CORE_SET],
    ['TRADES_HOME_SERVICES', 'PROFESSIONAL', CORE_SET],
    ['TRADES_HOME_SERVICES', 'ENTERPRISE', CORE_SET],
    ['AGENCY', 'PARTNER_FREE', ['CORE_CRM']],
    ['AGENCY', 'STARTER', ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS']],
    ['AGENCY', 'PROFESSIONAL', ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS']],
    ['AGENCY', 'ENTERPRISE', ['CORE_CRM', 'SUPPORT', 'AI_INTELLIGENCE', 'ANALYTICS']],
    ['LAW_FIRM', 'PARTNER_FREE', ['CORE_CRM']],
    ['LAW_FIRM', 'STARTER', CORE_SET], // LEGAL needs Professional or above
    ['LAW_FIRM', 'PROFESSIONAL', ['CORE_CRM', 'LEGAL', 'AI_INTELLIGENCE', 'ANALYTICS']],
    ['LAW_FIRM', 'ENTERPRISE', ['CORE_CRM', 'LEGAL', 'AI_INTELLIGENCE', 'ANALYTICS']],
    ['SHOP_ECOMMERCE', 'STARTER', CORE_SET],
    ['SHOP_ECOMMERCE', 'PROFESSIONAL', CORE_SET],
    ['SHOP_ECOMMERCE', 'ENTERPRISE', ['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS', 'COMMERCE']],
    ['SHOP_ECOMMERCE', 'CUSTOM', ['CORE_CRM', 'AI_INTELLIGENCE', 'ANALYTICS', 'COMMERCE']],
    ['OTHER', 'STARTER', CORE_SET],
    ['OTHER', 'ENTERPRISE', CORE_SET],
  ];

  it.each(matrix)('%s on %s', (businessType, plan, modules) => {
    expect(resolveEnabledModules({ plan, businessType })).toEqual(modules);
  });

  it('a handyman never sees Cases or Tickets on any plan', () => {
    for (const plan of PLAN_TIERS) {
      const modules = resolveEnabledModules({ plan, businessType: 'TRADES_HOME_SERVICES' });
      expect(modules).not.toContain('LEGAL');
      expect(modules).not.toContain('SUPPORT');
    }
  });

  it('null business type gates like OTHER', () => {
    for (const plan of PLAN_TIERS) {
      expect(resolveEnabledModules({ plan, businessType: null })).toEqual(
        resolveEnabledModules({ plan, businessType: 'OTHER' })
      );
    }
  });

  it('returns canonical order', () => {
    const modules = resolveEnabledModules({
      plan: 'CUSTOM',
      businessType: 'AGENCY',
      overrides: [{ moduleId: 'COMMERCE', enabled: true, origin: 'OVERRIDE' }],
    });
    expect(modules).toEqual(CRM_MODULES.filter((m) => modules.includes(m)));
  });
});

describe('resolveEnabledModules overrides', () => {
  it('an OVERRIDE row switches a module on outside the vertical', () => {
    const modules = resolveEnabledModules({
      plan: 'STARTER',
      businessType: 'TRADES_HOME_SERVICES',
      overrides: [{ moduleId: 'SUPPORT', enabled: true, origin: 'OVERRIDE' }],
    });
    expect(modules).toContain('SUPPORT');
  });

  it('an override can switch a module on even beyond the plan (admin decision)', () => {
    const modules = resolveEnabledModules({
      plan: 'STARTER',
      businessType: 'LAW_FIRM',
      overrides: [{ moduleId: 'LEGAL', enabled: true, origin: 'OVERRIDE' }],
    });
    expect(modules).toContain('LEGAL');
  });

  it('a PLAN-origin enabled row (written by plan sync) does not widen the vertical', () => {
    const modules = resolveEnabledModules({
      plan: 'PROFESSIONAL',
      businessType: 'TRADES_HOME_SERVICES',
      overrides: [
        { moduleId: 'LEGAL', enabled: true, origin: 'PLAN' },
        { moduleId: 'SUPPORT', enabled: true, origin: 'PLAN' },
      ],
    });
    expect(modules).not.toContain('LEGAL');
    expect(modules).not.toContain('SUPPORT');
  });

  it('an EXISTING_DATA row switches a module on like an override', () => {
    const modules = resolveEnabledModules({
      plan: 'STARTER',
      businessType: 'TRADES_HOME_SERVICES',
      overrides: [{ moduleId: 'SUPPORT', enabled: true, origin: 'EXISTING_DATA' }],
    });
    expect(modules).toContain('SUPPORT');
  });

  it('an enabled=false row switches a module off whatever its origin', () => {
    for (const origin of ['PLAN', 'OVERRIDE', 'EXISTING_DATA'] as const) {
      const modules = resolveEnabledModules({
        plan: 'PROFESSIONAL',
        businessType: 'LAW_FIRM',
        overrides: [{ moduleId: 'LEGAL', enabled: false, origin }],
      });
      expect(modules).not.toContain('LEGAL');
    }
  });

  it('CORE_CRM cannot be switched off', () => {
    const modules = resolveEnabledModules({
      plan: 'STARTER',
      businessType: 'OTHER',
      overrides: [{ moduleId: 'CORE_CRM', enabled: false, origin: 'OVERRIDE' }],
    });
    expect(modules).toContain('CORE_CRM');
  });

  it('isModuleResolvedEnabled agrees with the list', () => {
    const input = { plan: 'PROFESSIONAL', businessType: 'LAW_FIRM' } as const;
    expect(isModuleResolvedEnabled('LEGAL', input)).toBe(true);
    expect(isModuleResolvedEnabled('SUPPORT', input)).toBe(false);
  });
});

describe('dataProtectionFor', () => {
  const base = {
    moduleId: 'SUPPORT',
    plan: 'PROFESSIONAL',
    hasData: true,
    enabled: false,
    switchedOff: false,
  } as const;

  it('protects data hidden only by the business type', () => {
    expect(dataProtectionFor(base)).toBe('protect');
  });

  it('does nothing without data or when the module is already enabled', () => {
    expect(dataProtectionFor({ ...base, hasData: false })).toBe('none');
    expect(dataProtectionFor({ ...base, enabled: true })).toBe('none');
  });

  it('sends a plan downgrade to review instead of handing out a paid module', () => {
    expect(dataProtectionFor({ ...base, moduleId: 'LEGAL', plan: 'STARTER' })).toBe('review');
  });

  it('sends a deliberate switch-off to review instead of undoing it', () => {
    expect(dataProtectionFor({ ...base, switchedOff: true })).toBe('review');
  });
});

describe('navigation follows the resolver', () => {
  const hrefs = (businessType: TenantBusinessType | null, plan: PlanTier = 'PROFESSIONAL') =>
    getRoutesForModules(resolveEnabledModules({ plan, businessType })).map((r) => r.href);

  it('hides Cases and Tickets for a trades business', () => {
    const nav = hrefs('TRADES_HOME_SERVICES');
    expect(nav).not.toContain('/cases');
    expect(nav).not.toContain('/tickets');
    expect(nav).not.toContain('/help-center');
    expect(nav).toContain('/leads');
    expect(nav).toContain('/analytics');
  });

  it('shows Tickets and Help Center for an agency but not Cases', () => {
    const nav = hrefs('AGENCY');
    expect(nav).toContain('/tickets');
    expect(nav).toContain('/help-center');
    expect(nav).not.toContain('/cases');
  });

  it('shows Cases for a law firm on Professional but not Tickets', () => {
    const nav = hrefs('LAW_FIRM');
    expect(nav).toContain('/cases');
    expect(nav).not.toContain('/tickets');
  });

  it('a workspace with no business type sees neither', () => {
    const nav = hrefs(null);
    expect(nav).not.toContain('/cases');
    expect(nav).not.toContain('/tickets');
  });

  it('an existing-data override keeps Cases in the nav for a trades business', () => {
    const nav = getRoutesForModules(
      resolveEnabledModules({
        plan: 'PROFESSIONAL',
        businessType: 'TRADES_HOME_SERVICES',
        overrides: [{ moduleId: 'LEGAL', enabled: true, origin: 'OVERRIDE' }],
      })
    ).map((r) => r.href);
    expect(nav).toContain('/cases');
  });
});
