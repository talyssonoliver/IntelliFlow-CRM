/**
 * @vitest-environment happy-dom
 *
 * Tenant copy (ADR-071). The root layout hardcodes `<html lang="en">`, so the locale has to come
 * from the browser, not from the document, or the pt-BR copy can never render.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTenantMessages, resolveTenantLocale } from '../messages';

function browser(languages: string[] | undefined, language: string | undefined, htmlLang = 'en') {
  document.documentElement.lang = htmlLang;
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages as never);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(language as never);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.lang = '';
});

describe('resolveTenantLocale', () => {
  it('is pt-BR for a Portuguese browser even though the layout says <html lang="en">', () => {
    browser(['pt-BR', 'en'], 'pt-BR', 'en');
    expect(resolveTenantLocale()).toBe('pt-BR');
    expect(getTenantMessages().backToMyCrm).toBe('voltar ao meu CRM');
    expect(getTenantMessages().pinnedBanner('Acme')).toBe('Você está no CRM de Acme');
  });

  it('is English for an English browser', () => {
    browser(['en-GB'], 'en-GB', 'en');
    expect(resolveTenantLocale()).toBe('en');
    expect(getTenantMessages().backToMyCrm).toBe('back to my CRM');
  });

  it('falls back to the document language when the browser reports none', () => {
    browser(undefined, undefined, 'pt-PT');
    expect(resolveTenantLocale()).toBe('pt-BR');
  });

  it('defaults to English when nothing says otherwise', () => {
    browser([], undefined, '');
    expect(resolveTenantLocale()).toBe('en');
  });
});
