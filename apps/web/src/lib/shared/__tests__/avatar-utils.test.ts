import { describe, expect, it } from 'vitest';
import { isAvatarImageSource, isProxyableAvatarHost, normalizeAvatarSource } from '../avatar-utils';

describe('normalizeAvatarSource', () => {
  it('returns null for empty values', () => {
    expect(normalizeAvatarSource(undefined)).toBeNull();
    expect(normalizeAvatarSource(null)).toBeNull();
    expect(normalizeAvatarSource('')).toBeNull();
    expect(normalizeAvatarSource('   ')).toBeNull();
  });

  it('keeps non-url avatar fallbacks untouched', () => {
    expect(normalizeAvatarSource('SJ')).toBe('SJ');
    expect(normalizeAvatarSource('/api/avatar-proxy?src=test')).toBe('/api/avatar-proxy?src=test');
  });

  it('proxies googleusercontent avatars', () => {
    const src = 'https://lh3.googleusercontent.com/a/ACg8ocI1tAWmpksfd_bBrwfQ3yUxXxjaOpMU2BTlBd32zDO0WQIG9IDGWA=s96-c';
    expect(normalizeAvatarSource(src)).toBe(`/api/avatar-proxy?src=${encodeURIComponent(src)}`);
  });

  it('proxies additional known third-party avatar hosts', () => {
    const src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=davidk';
    expect(normalizeAvatarSource(src)).toBe(`/api/avatar-proxy?src=${encodeURIComponent(src)}`);
  });

  it('keeps non-proxied remote avatar URLs as-is', () => {
    const src = 'https://cdn.example.com/avatar/jane.png';
    expect(normalizeAvatarSource(src)).toBe(src);
  });
});

describe('isAvatarImageSource', () => {
  it('returns true for url, data, and local paths', () => {
    expect(isAvatarImageSource('https://example.com/avatar.png')).toBe(true);
    expect(isAvatarImageSource('data:image/png;base64,abc')).toBe(true);
    expect(isAvatarImageSource('/api/avatar-proxy?src=test')).toBe(true);
  });

  it('returns false for empty values and initials', () => {
    expect(isAvatarImageSource('')).toBe(false);
    expect(isAvatarImageSource('   ')).toBe(false);
    expect(isAvatarImageSource('SJ')).toBe(false);
  });
});

describe('isProxyableAvatarHost', () => {
  it('matches allowlisted avatar hosts and subdomains', () => {
    expect(isProxyableAvatarHost('lh3.googleusercontent.com')).toBe(true);
    expect(isProxyableAvatarHost('api.dicebear.com')).toBe(true);
    expect(isProxyableAvatarHost('images.unsplash.com')).toBe(true);
  });

  it('rejects non-allowlisted hosts', () => {
    expect(isProxyableAvatarHost('example.com')).toBe(false);
  });
});
