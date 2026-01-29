/**
 * Common Validator Tests
 *
 * These tests verify the shared Zod validation schemas used across
 * the application. They ensure consistent validation for common types
 * like IDs, emails, pagination, etc.
 */

import { describe, it, expect } from 'vitest';
import {
  idSchema,
  uuidSchema,
  cuidSchema,
  emailSchema,
  phoneSchema,
  urlSchema,
  paginationSchema,
  dateRangeSchema,
  searchSchema,
  apiResponseSchema,
  apiErrorSchema,
  metadataSchema,
} from '../src/common';
import { z } from 'zod';

describe('Common Validators', () => {
  describe('idSchema (UUID)', () => {
    it('should validate valid UUID', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = idSchema.safeParse(validUuid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID format', () => {
      const invalidUuid = 'not-a-uuid';
      const result = idSchema.safeParse(invalidUuid);
      expect(result.success).toBe(false);
    });

    it('should reject UUID with wrong length', () => {
      const invalidUuid = '123e4567-e89b-12d3-a456';
      const result = idSchema.safeParse(invalidUuid);
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = idSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject non-string values', () => {
      const result = idSchema.safeParse(123);
      expect(result.success).toBe(false);
    });
  });

  describe('uuidSchema', () => {
    it('should be an alias for idSchema', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const idResult = idSchema.safeParse(validUuid);
      const uuidResult = uuidSchema.safeParse(validUuid);

      expect(idResult.success).toBe(uuidResult.success);
    });
  });

  describe('cuidSchema', () => {
    it('should validate valid CUID', () => {
      const validCuid = 'clh1x2p3y0000qwer1234asdf';
      const result = cuidSchema.safeParse(validCuid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid CUID format', () => {
      const invalidCuid = 'not-a-cuid';
      const result = cuidSchema.safeParse(invalidCuid);
      expect(result.success).toBe(false);
    });
  });

  describe('emailSchema', () => {
    it('should validate valid email', () => {
      const validEmail = 'test@example.com';
      const result = emailSchema.safeParse(validEmail);
      expect(result.success).toBe(true);
    });

    it('should transform email to lowercase', () => {
      const mixedCase = 'Test@EXAMPLE.COM';
      const result = emailSchema.safeParse(mixedCase);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test@example.com');
      }
    });

    it('should reject email with leading/trailing whitespace', () => {
      const emailWithSpaces = '  test@example.com  ';
      const result = emailSchema.safeParse(emailWithSpaces);

      // Email validation happens before trim, so spaces cause failure
      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const invalidEmail = 'not-an-email';
      const result = emailSchema.safeParse(invalidEmail);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid email address');
      }
    });

    it('should reject email without domain', () => {
      const invalidEmail = 'test@';
      const result = emailSchema.safeParse(invalidEmail);
      expect(result.success).toBe(false);
    });

    it('should reject email without @', () => {
      const invalidEmail = 'testexample.com';
      const result = emailSchema.safeParse(invalidEmail);
      expect(result.success).toBe(false);
    });

    it('should accept email with subdomains', () => {
      const validEmail = 'test@mail.example.com';
      const result = emailSchema.safeParse(validEmail);
      expect(result.success).toBe(true);
    });

    it('should accept email with plus addressing', () => {
      const validEmail = 'test+tag@example.com';
      const result = emailSchema.safeParse(validEmail);
      expect(result.success).toBe(true);
    });
  });

  describe('phoneSchema', () => {
    it('should validate E.164 format phone number', () => {
      const validPhone = '+15551234567';
      const result = phoneSchema.safeParse(validPhone);
      expect(result.success).toBe(true);
    });

    it('should normalize phone with spaces', () => {
      const phoneWithSpaces = '+1 555 123 4567';
      const result = phoneSchema.safeParse(phoneWithSpaces);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.value).toBe('+15551234567');
      }
    });

    it('should normalize phone with dashes', () => {
      const phoneWithDashes = '+1-555-123-4567';
      const result = phoneSchema.safeParse(phoneWithDashes);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.value).toBe('+15551234567');
      }
    });

    it('should normalize phone with parentheses', () => {
      const phoneWithParens = '+1 (555) 123-4567';
      const result = phoneSchema.safeParse(phoneWithParens);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.value).toBe('+15551234567');
      }
    });

    it('should reject invalid phone format', () => {
      const invalidPhone = 'not-a-phone';
      const result = phoneSchema.safeParse(invalidPhone);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid phone');
      }
    });

    it('should accept phone without plus sign', () => {
      const validPhone = '15551234567';
      const result = phoneSchema.safeParse(validPhone);
      expect(result.success).toBe(true);
    });

    it('should reject phone starting with zero', () => {
      const invalidPhone = '05551234567';
      const result = phoneSchema.safeParse(invalidPhone);
      expect(result.success).toBe(false);
    });

    it('should be optional', () => {
      const result = phoneSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('urlSchema', () => {
    it('should validate valid HTTP URL', () => {
      const validUrl = 'http://example.com';
      const result = urlSchema.safeParse(validUrl);
      expect(result.success).toBe(true);
    });

    it('should validate valid HTTPS URL', () => {
      const validUrl = 'https://example.com';
      const result = urlSchema.safeParse(validUrl);
      expect(result.success).toBe(true);
    });

    it('should validate URL with path', () => {
      const validUrl = 'https://example.com/path/to/page';
      const result = urlSchema.safeParse(validUrl);
      expect(result.success).toBe(true);
    });

    it('should validate URL with query params', () => {
      const validUrl = 'https://example.com?param=value';
      const result = urlSchema.safeParse(validUrl);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      // Use a URL with invalid characters that can't be parsed even with https:// prefix
      const invalidUrl = 'https://:invalid';
      const result = urlSchema.safeParse(invalidUrl);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid');
      }
    });

    it('should normalize URL without protocol by adding https://', () => {
      const urlWithoutProtocol = 'example.com';
      const result = urlSchema.safeParse(urlWithoutProtocol);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.value).toBe('https://example.com');
      }
    });

    it('should be optional', () => {
      const result = urlSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('paginationSchema', () => {
    it('should validate valid pagination params', () => {
      const validPagination = {
        page: 2,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'asc' as const,
      };

      const result = paginationSchema.safeParse(validPagination);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const minimalPagination = {};

      const result = paginationSchema.safeParse(minimalPagination);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should reject zero page', () => {
      const invalidPagination = { page: 0 };
      const result = paginationSchema.safeParse(invalidPagination);
      expect(result.success).toBe(false);
    });

    it('should reject negative page', () => {
      const invalidPagination = { page: -1 };
      const result = paginationSchema.safeParse(invalidPagination);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer page', () => {
      const invalidPagination = { page: 1.5 };
      const result = paginationSchema.safeParse(invalidPagination);
      expect(result.success).toBe(false);
    });

    it('should reject zero limit', () => {
      const invalidPagination = { limit: 0 };
      const result = paginationSchema.safeParse(invalidPagination);
      expect(result.success).toBe(false);
    });

    it('should reject limit exceeding max', () => {
      const invalidPagination = { limit: 101 }; // Max is 100
      const result = paginationSchema.safeParse(invalidPagination);
      expect(result.success).toBe(false);
    });

    it('should accept limit at max', () => {
      const validPagination = { limit: 100 };
      const result = paginationSchema.safeParse(validPagination);
      expect(result.success).toBe(true);
    });

    it('should reject invalid sortOrder', () => {
      const invalidPagination = { sortOrder: 'invalid' };
      const result = paginationSchema.safeParse(invalidPagination);
      expect(result.success).toBe(false);
    });

    it('should accept asc sortOrder', () => {
      const validPagination = { sortOrder: 'asc' as const };
      const result = paginationSchema.safeParse(validPagination);
      expect(result.success).toBe(true);
    });

    it('should accept desc sortOrder', () => {
      const validPagination = { sortOrder: 'desc' as const };
      const result = paginationSchema.safeParse(validPagination);
      expect(result.success).toBe(true);
    });
  });

  describe('dateRangeSchema', () => {
    it('should validate valid date range', () => {
      const validRange = {
        start: '2024-01-01',
        end: '2024-12-31',
      };

      const result = dateRangeSchema.safeParse(validRange);
      expect(result.success).toBe(true);
    });

    it('should coerce strings to dates', () => {
      const range = {
        start: '2024-01-01',
        end: '2024-12-31',
      };

      const result = dateRangeSchema.safeParse(range);
      expect(result.success).toBe(true);

      if (result.success) {
        // DateRange value object has start and end Date properties
        expect(result.data.start).toBeInstanceOf(Date);
        expect(result.data.end).toBeInstanceOf(Date);
      }
    });

    it('should reject end before start', () => {
      const invalidRange = {
        start: '2024-12-31',
        end: '2024-01-01',
      };

      const result = dateRangeSchema.safeParse(invalidRange);
      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.issues[0].message).toContain('before');
      }
    });

    it('should accept same start and end date', () => {
      const validRange = {
        start: '2024-06-15',
        end: '2024-06-15',
      };

      const result = dateRangeSchema.safeParse(validRange);
      expect(result.success).toBe(true);
    });

    it('should accept Date objects', () => {
      const validRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31'),
      };

      const result = dateRangeSchema.safeParse(validRange);
      expect(result.success).toBe(true);
    });
  });

  describe('searchSchema', () => {
    it('should validate valid search params', () => {
      const validSearch = {
        query: 'search term',
        filters: {
          category: 'technology',
          status: 'active',
          count: 5,
          featured: true,
        },
      };

      const result = searchSchema.safeParse(validSearch);
      expect(result.success).toBe(true);
    });

    it('should validate search without query', () => {
      const searchWithFilters = {
        filters: {
          status: 'active',
        },
      };

      const result = searchSchema.safeParse(searchWithFilters);
      expect(result.success).toBe(true);
    });

    it('should validate search without filters', () => {
      const searchWithQuery = {
        query: 'search term',
      };

      const result = searchSchema.safeParse(searchWithQuery);
      expect(result.success).toBe(true);
    });

    it('should validate empty search', () => {
      const emptySearch = {};
      const result = searchSchema.safeParse(emptySearch);
      expect(result.success).toBe(true);
    });

    it('should reject query exceeding max length', () => {
      const invalidSearch = {
        query: 'Q'.repeat(201), // Max is 200
      };

      const result = searchSchema.safeParse(invalidSearch);
      expect(result.success).toBe(false);
    });

    it('should accept filters with array values', () => {
      const searchWithArrays = {
        filters: {
          tags: ['tag1', 'tag2', 'tag3'],
        },
      };

      const result = searchSchema.safeParse(searchWithArrays);
      expect(result.success).toBe(true);
    });
  });

  describe('apiResponseSchema', () => {
    it('should validate successful API response', () => {
      const dataSchema = z.object({ id: z.string(), name: z.string() });
      const responseSchema = apiResponseSchema(dataSchema);

      const validResponse = {
        success: true,
        data: { id: '123', name: 'Test' },
        message: 'Success',
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = responseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should validate response without optional message', () => {
      const dataSchema = z.object({ id: z.string() });
      const responseSchema = apiResponseSchema(dataSchema);

      const validResponse = {
        success: true,
        data: { id: '123' },
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = responseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should reject invalid timestamp', () => {
      const dataSchema = z.object({ id: z.string() });
      const responseSchema = apiResponseSchema(dataSchema);

      const invalidResponse = {
        success: true,
        data: { id: '123' },
        timestamp: 'not-a-datetime',
      };

      const result = responseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject missing data field', () => {
      const dataSchema = z.object({ id: z.string() });
      const responseSchema = apiResponseSchema(dataSchema);

      const invalidResponse = {
        success: true,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = responseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('apiErrorSchema', () => {
    it('should validate valid error response', () => {
      const validError = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: { field: 'email', reason: 'Invalid format' },
        },
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = apiErrorSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });

    it('should validate error without details', () => {
      const validError = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = apiErrorSchema.safeParse(validError);
      expect(result.success).toBe(true);
    });

    it('should reject success: true in error schema', () => {
      const invalidError = {
        success: true,
        error: {
          code: 'ERROR',
          message: 'Error message',
        },
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = apiErrorSchema.safeParse(invalidError);
      expect(result.success).toBe(false);
    });

    it('should reject missing error field', () => {
      const invalidError = {
        success: false,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = apiErrorSchema.safeParse(invalidError);
      expect(result.success).toBe(false);
    });
  });

  describe('metadataSchema', () => {
    it('should validate valid metadata', () => {
      const validMetadata = {
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        createdBy: 'user123',
        updatedBy: 'user456',
        version: 1,
      };

      const result = metadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it('should validate minimal metadata', () => {
      const minimalMetadata = {
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = metadataSchema.safeParse(minimalMetadata);
      expect(result.success).toBe(true);
    });

    it('should coerce date strings to Date objects', () => {
      const metadata = {
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      const result = metadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.createdAt).toBeInstanceOf(Date);
        expect(result.data.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('should reject negative version', () => {
      const invalidMetadata = {
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        version: -1,
      };

      const result = metadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer version', () => {
      const invalidMetadata = {
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        version: 1.5,
      };

      const result = metadataSchema.safeParse(invalidMetadata);
      expect(result.success).toBe(false);
    });

    it('should accept version 0', () => {
      const validMetadata = {
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        version: 0,
      };

      const result = metadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });
  });
});
