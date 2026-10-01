/**
 * Copy for the tenant switcher and the pinned-session banner.
 *
 * The web app has no i18n framework yet; this keeps the two languages the product ships in
 * (English default, pt-BR) in one place so a future i18n layer can lift them out unchanged.
 */

export type TenantLocale = 'en' | 'pt-BR';

export interface TenantMessages {
  pinnedBanner: (tenantName: string) => string;
  backToMyCrm: string;
  switcherLabel: string;
  switcherDisabled: string;
  switcherHome: string;
  switching: string;
}

const MESSAGES: Record<TenantLocale, TenantMessages> = {
  en: {
    pinnedBanner: (tenantName) => `You are in ${tenantName}'s CRM`,
    backToMyCrm: 'back to my CRM',
    switcherLabel: 'Switch workspace',
    switcherDisabled: 'Switching workspace is disabled in this session',
    switcherHome: 'Your CRM',
    switching: 'Switching…',
  },
  'pt-BR': {
    pinnedBanner: (tenantName) => `Você está no CRM de ${tenantName}`,
    backToMyCrm: 'voltar ao meu CRM',
    switcherLabel: 'Trocar de espaço de trabalho',
    switcherDisabled: 'Trocar de espaço de trabalho está desativado nesta sessão',
    switcherHome: 'Seu CRM',
    switching: 'Trocando…',
  },
};

/**
 * pt-* browsers get Portuguese; everything else gets English.
 *
 * The browser language comes FIRST. `<html lang>` is the static `en` the root layout ships for
 * every visitor, so it says nothing about the person and would hide the pt-BR copy from the very
 * users this feature is for. It is only a fallback when the browser reports no language.
 */
export function resolveTenantLocale(): TenantLocale {
  const candidates: Array<string | undefined> = [];
  if (typeof navigator !== 'undefined') {
    candidates.push(...(navigator.languages ?? []), navigator.language);
  }
  if (typeof document !== 'undefined') candidates.push(document.documentElement?.lang);
  for (const candidate of candidates) {
    if (candidate) return candidate.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
  }
  return 'en';
}

export function getTenantMessages(locale: TenantLocale = resolveTenantLocale()): TenantMessages {
  return MESSAGES[locale];
}
