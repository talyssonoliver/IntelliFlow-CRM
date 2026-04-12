// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { metadata } from '../page';

describe('About Page Metadata', () => {
  it('should have correct SEO metadata', () => {
    expect(metadata.title).toBe('About Us - Modern AI-First CRM | IntelliFlow');
    expect(metadata.description).toContain('IntelliFlow CRM');
    expect(metadata.description).toContain('mission');
  });

  it('should have Open Graph metadata', () => {
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph?.title).toBe('About IntelliFlow CRM — AI-First, Governance-Grade');
    expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/about');
    expect(metadata.openGraph?.siteName).toBe('IntelliFlow CRM');
    expect((metadata.openGraph as Record<string, unknown>)?.type).toBe('website');
  });

  it('should have Twitter metadata', () => {
    expect(metadata.twitter).toBeDefined();
    expect((metadata.twitter as Record<string, unknown>)?.card).toBe('summary_large_image');
    expect(metadata.twitter?.title).toBe('About IntelliFlow CRM — AI-First, Governance-Grade');
  });

  it('should have canonical URL', () => {
    expect(metadata.alternates?.canonical).toBe('/about');
  });
});
