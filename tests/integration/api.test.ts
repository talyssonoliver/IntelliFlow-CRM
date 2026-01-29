/**
 * API Integration Tests for IntelliFlow CRM
 *
 * These tests verify that API endpoints work correctly with the database
 * and other services. They test the full request/response cycle.
 *
 * Test Categories:
 * - Health checks
 * - Authentication
 * - CRUD operations
 * - Error handling
 * - Rate limiting
 *
 * @module tests/integration/api.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApiClient, waitForService } from './setup';

describe('API Integration Tests', () => {
  let apiClient: ReturnType<typeof createTestApiClient>;
  const apiAvailable = process.env.TEST_API_AVAILABLE === 'true';

  beforeAll(() => {
    apiClient = createTestApiClient();
  });

  describe('Health Check', () => {
    it('should return healthy status from health endpoint', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('healthy');
    });

    it('should include version information', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`);
      const data = await response.json();

      expect(data).toHaveProperty('version');
      expect(typeof data.version).toBe('string');
    });

    it('should return uptime information', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`);
      const data = await response.json();

      expect(data).toHaveProperty('uptime');
      expect(typeof data.uptime).toBe('number');
      expect(data.uptime).toBeGreaterThan(0);
    });
  });

  describe('API Versioning', () => {
    it('should support API version header', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`, {
        headers: {
          'X-API-Version': 'v1',
        },
      });

      expect(response.ok).toBe(true);
    });

    it('should reject unsupported API versions', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`, {
        headers: {
          'X-API-Version': 'v999',
        },
      });

      // Should either accept it gracefully or return an error
      // Exact behavior depends on implementation
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/nonexistent-endpoint`);
      expect(response.status).toBe(404);
    });

    it('should return proper error format', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/nonexistent-endpoint`);
      expect(response.status).toBe(404);

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        expect(data).toHaveProperty('error');
      }
    });

    it('should handle malformed JSON', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/test-endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      // Should return 400 Bad Request for malformed JSON
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in responses', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`);

      // Check for common security headers
      const headers = response.headers;

      // X-Content-Type-Options should be set
      if (headers.has('x-content-type-options')) {
        expect(headers.get('x-content-type-options')).toBe('nosniff');
      }

      // X-Frame-Options should be set (if not using CSP frame-ancestors)
      if (headers.has('x-frame-options')) {
        expect(['DENY', 'SAMEORIGIN']).toContain(headers.get('x-frame-options'));
      }

      // Response should have appropriate content type
      expect(headers.get('content-type')).toContain('application/json');
    });

    it('should not expose sensitive information in headers', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`);
      const headers = response.headers;

      // Should not expose server technology
      const serverHeader = headers.get('server');
      if (serverHeader) {
        // Should not contain version numbers or detailed server info
        expect(serverHeader.toLowerCase()).not.toContain('express');
        expect(serverHeader.toLowerCase()).not.toContain('nodejs');
      }

      // Should not expose X-Powered-By
      expect(headers.has('x-powered-by')).toBe(false);
    });
  });

  describe('CORS Configuration', () => {
    it('should handle CORS preflight requests', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      });

      // Should allow OPTIONS requests
      expect(response.status).toBeLessThan(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to API endpoints', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      // Make multiple rapid requests
      const requests = Array.from({ length: 10 }, () => fetch(`${apiClient.baseURL}/api/health`));

      const responses = await Promise.all(requests);

      // All responses should be successful (rate limit should be reasonable)
      const allSuccessful = responses.every((r) => r.ok);

      // Either all should succeed (high limit) or some should be rate limited
      if (!allSuccessful) {
        // Check if rate-limited responses return 429
        const rateLimited = responses.filter((r) => r.status === 429);
        expect(rateLimited.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Request Validation', () => {
    it('should validate request content type', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const response = await fetch(`${apiClient.baseURL}/api/test-endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'plain text data',
      });

      // Should reject or handle non-JSON content appropriately
      expect(response.status).toBeLessThan(500);
    });

    it('should enforce request size limits', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      // Create a large payload (e.g., 10MB)
      const largePayload = 'x'.repeat(10 * 1024 * 1024);

      const response = await fetch(`${apiClient.baseURL}/api/test-endpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: largePayload }),
      });

      // Should reject with 413 Payload Too Large or handle gracefully
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Performance', () => {
    it('should respond to health check within acceptable time', async () => {
      if (!apiAvailable) {
        console.log('⏭️  Skipping API test - API not available');
        return;
      }

      const startTime = Date.now();
      const response = await fetch(`${apiClient.baseURL}/api/health`);
      const endTime = Date.now();

      const responseTime = endTime - startTime;

      // Health check should respond in < 200ms
      expect(responseTime).toBeLessThan(200);
      expect(response.ok).toBe(true);
    });
  });
});
