/**
 * WebsiteUrl Value Object Tests
 *
 * Tests URL validation, normalization, protocol handling,
 * and property extraction.
 *
 * Coverage target: >95% for domain layer
 */

import { describe, it, expect } from 'vitest';
import { WebsiteUrl, InvalidUrlError } from '../WebsiteUrl';

describe('WebsiteUrl', () => {
  describe('create()', () => {
    it('should add https:// when protocol is missing', () => {
      const result = WebsiteUrl.create('example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('https://example.com');
    });

    it('should preserve https:// protocol', () => {
      const result = WebsiteUrl.create('https://example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('https://example.com');
    });

    it('should preserve http:// protocol', () => {
      const result = WebsiteUrl.create('http://example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('http://example.com');
    });

    it('should preserve URL with path', () => {
      const result = WebsiteUrl.create('https://example.com/path');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toContain('/path');
    });

    it('should normalize by removing trailing slash for root URL', () => {
      const result = WebsiteUrl.create('https://example.com/');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('https://example.com');
    });

    it('should trim whitespace', () => {
      const result = WebsiteUrl.create('  https://example.com  ');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toBe('https://example.com');
    });

    it('should fail for null', () => {
      const result = WebsiteUrl.create(null);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidUrlError);
      expect(result.error.message).toContain('empty');
    });

    it('should fail for undefined', () => {
      const result = WebsiteUrl.create(undefined);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidUrlError);
    });

    it('should fail for empty string', () => {
      const result = WebsiteUrl.create('');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidUrlError);
    });

    it('should fail for whitespace-only string', () => {
      const result = WebsiteUrl.create('   ');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidUrlError);
    });

    it('should fail for URL exceeding 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2048);
      const result = WebsiteUrl.create(longUrl);

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidUrlError);
      expect(result.error.message).toContain('maximum length');
    });

    it('should fail for malformed URL', () => {
      const result = WebsiteUrl.create('://bad');

      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(InvalidUrlError);
    });

    it('should have error code INVALID_URL', () => {
      const result = WebsiteUrl.create('');

      expect(result.error.code).toBe('INVALID_URL');
    });

    it('should handle URL with query parameters', () => {
      const result = WebsiteUrl.create('https://example.com/search?q=test');

      expect(result.isSuccess).toBe(true);
      expect(result.value.value).toContain('?q=test');
    });

    it('should handle URL with subdomain', () => {
      const result = WebsiteUrl.create('https://www.example.com');

      expect(result.isSuccess).toBe(true);
      expect(result.value.domain).toBe('www.example.com');
    });
  });

  describe('value and normalized properties', () => {
    it('value should return the normalized URL', () => {
      const url = WebsiteUrl.create('example.com').value;

      expect(url.value).toBe('https://example.com');
    });

    it('normalized should be an alias for value', () => {
      const url = WebsiteUrl.create('example.com').value;

      expect(url.normalized).toBe(url.value);
    });
  });

  describe('domain property', () => {
    it('should return the hostname', () => {
      const url = WebsiteUrl.create('https://example.com/path').value;

      expect(url.domain).toBe('example.com');
    });

    it('should include subdomain', () => {
      const url = WebsiteUrl.create('https://sub.example.com').value;

      expect(url.domain).toBe('sub.example.com');
    });
  });

  describe('protocol property', () => {
    it('should return https: for HTTPS URLs', () => {
      const url = WebsiteUrl.create('https://example.com').value;

      expect(url.protocol).toBe('https:');
    });

    it('should return http: for HTTP URLs', () => {
      const url = WebsiteUrl.create('http://example.com').value;

      expect(url.protocol).toBe('http:');
    });
  });

  describe('path property', () => {
    it('should return the pathname', () => {
      const url = WebsiteUrl.create('https://example.com/about/team').value;

      expect(url.path).toBe('/about/team');
    });

    it('should return / for root URL', () => {
      // Note: normalized URL strips trailing slash, but URL constructor returns /
      const url = WebsiteUrl.create('https://example.com').value;

      expect(url.path).toBe('/');
    });
  });

  describe('isSecure property', () => {
    it('should return true for https', () => {
      const url = WebsiteUrl.create('https://example.com').value;

      expect(url.isSecure).toBe(true);
    });

    it('should return false for http', () => {
      const url = WebsiteUrl.create('http://example.com').value;

      expect(url.isSecure).toBe(false);
    });

    it('should default to true when protocol is added', () => {
      const url = WebsiteUrl.create('example.com').value;

      expect(url.isSecure).toBe(true);
    });
  });

  describe('withoutProtocol property', () => {
    it('should remove https://', () => {
      const url = WebsiteUrl.create('https://example.com').value;

      expect(url.withoutProtocol).toBe('example.com');
    });

    it('should remove http://', () => {
      const url = WebsiteUrl.create('http://example.com').value;

      expect(url.withoutProtocol).toBe('example.com');
    });

    it('should preserve path after removing protocol', () => {
      const url = WebsiteUrl.create('https://example.com/about').value;

      expect(url.withoutProtocol).toContain('example.com/about');
    });
  });

  describe('toValue()', () => {
    it('should return the normalized URL string', () => {
      const url = WebsiteUrl.create('example.com').value;

      expect(url.toValue()).toBe('https://example.com');
    });
  });

  describe('toString()', () => {
    it('should return the normalized URL string', () => {
      const url = WebsiteUrl.create('example.com').value;

      expect(url.toString()).toBe('https://example.com');
    });

    it('should equal the value property', () => {
      const url = WebsiteUrl.create('https://example.com/path').value;

      expect(url.toString()).toBe(url.value);
    });
  });
});
