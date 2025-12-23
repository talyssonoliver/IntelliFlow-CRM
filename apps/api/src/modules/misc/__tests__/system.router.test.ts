import { TEST_UUIDS } from '../../../test/setup';
/**
 * System Router Tests
 *
 * Comprehensive tests for all system router procedures:
 * - version, info, features, config, metrics, capabilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { systemRouter } from '../system.router';
import { createPublicContext, createAdminContext } from '../../../test/setup';

describe('System Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('version', () => {
    it('should return API version information', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.version();

      expect(result.version).toBeDefined();
      expect(result.build).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should return consistent version format', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.version();

      // Version should be semver format
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('info', () => {
    it('should return system information', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.info();

      expect(result.node).toBeDefined();
      expect(result.node.version).toBe(process.version);
      expect(result.node.platform).toBe(process.platform);
      expect(result.node.arch).toBe(process.arch);

      expect(result.memory).toBeDefined();
      expect(result.memory.total).toBeGreaterThan(0);
      expect(result.memory.used).toBeGreaterThan(0);

      expect(result.uptime).toBeGreaterThan(0);
      expect(result.environment).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should return valid memory usage', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.info();

      expect(result.memory.total).toBeGreaterThanOrEqual(result.memory.used);
      expect(result.memory.external).toBeGreaterThanOrEqual(0);
    });
  });

  describe('features', () => {
    it('should return feature flags', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.features();

      expect(result.features).toBeDefined();
      expect(result.features.leadManagement).toBe(true);
      expect(result.features.contactManagement).toBe(true);
      expect(result.features.accountManagement).toBe(true);
      expect(result.features.opportunityManagement).toBe(true);
      expect(result.features.taskManagement).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should reflect AI feature environment variables', async () => {
      const originalEnv = process.env.ENABLE_AI_SCORING;
      process.env.ENABLE_AI_SCORING = 'true';

      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.features();

      expect(result.features.aiScoring).toBe(true);

      // Restore
      if (originalEnv === undefined) {
        delete process.env.ENABLE_AI_SCORING;
      } else {
        process.env.ENABLE_AI_SCORING = originalEnv;
      }
    });

    it('should have AI features disabled by default', async () => {
      const originalEnv = process.env.ENABLE_AI_SCORING;
      delete process.env.ENABLE_AI_SCORING;

      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.features();

      expect(result.features.aiScoring).toBe(false);
      expect(result.features.aiEmailGeneration).toBe(false);
      expect(result.features.aiWorkflows).toBe(false);

      // Restore
      if (originalEnv !== undefined) {
        process.env.ENABLE_AI_SCORING = originalEnv;
      }
    });
  });

  describe('config', () => {
    it('should return system configuration for admin', async () => {
      const caller = systemRouter.createCaller(createAdminContext());
      const result = await caller.config();

      expect(result.database).toBeDefined();
      expect(result.database.type).toBe('postgresql');
      expect(result.api).toBeDefined();
      expect(result.api.version).toBeDefined();
      expect(result.ai).toBeDefined();
      expect(result.logging).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should throw FORBIDDEN for non-admin users', async () => {
      const caller = systemRouter.createCaller(createPublicContext());

      await expect(caller.config()).rejects.toThrow(
        expect.objectContaining({
          code: 'UNAUTHORIZED',
        })
      );
    });

    it('should include rate limit configuration', async () => {
      const caller = systemRouter.createCaller(createAdminContext());
      const result = await caller.config();

      expect(result.api.rateLimit).toBeDefined();
      expect(result.api.rateLimit.enabled).toBeDefined();
      expect(result.api.rateLimit.maxRequests).toBeDefined();
      expect(result.api.rateLimit.windowMs).toBeDefined();
    });

    it('should include AI configuration', async () => {
      const caller = systemRouter.createCaller(createAdminContext());
      const result = await caller.config();

      expect(result.ai.provider).toBeDefined();
      expect(result.ai.model).toBeDefined();
      expect(result.ai.timeout).toBeDefined();
    });
  });

  describe('metrics', () => {
    it('should return process metrics for admin', async () => {
      const caller = systemRouter.createCaller(createAdminContext());
      const result = await caller.metrics();

      expect(result.process).toBeDefined();
      expect(result.process.uptime).toBeGreaterThan(0);
      expect(result.process.memory).toBeDefined();
      expect(result.process.memory.heapUsed).toBeGreaterThan(0);
      expect(result.process.cpu).toBeDefined();
      expect(result.requests).toBeDefined();
      expect(result.latency).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should throw FORBIDDEN for non-admin users', async () => {
      const caller = systemRouter.createCaller(createPublicContext());

      await expect(caller.metrics()).rejects.toThrow(
        expect.objectContaining({
          code: 'UNAUTHORIZED',
        })
      );
    });

    it('should include memory metrics', async () => {
      const caller = systemRouter.createCaller(createAdminContext());
      const result = await caller.metrics();

      expect(result.process.memory.heapUsed).toBeGreaterThan(0);
      expect(result.process.memory.heapTotal).toBeGreaterThan(0);
      expect(result.process.memory.rss).toBeGreaterThan(0);
      expect(result.process.memory.external).toBeGreaterThanOrEqual(0);
    });

    it('should include placeholder request metrics', async () => {
      const caller = systemRouter.createCaller(createAdminContext());
      const result = await caller.metrics();

      expect(result.requests.total).toBe(0);
      expect(result.requests.success).toBe(0);
      expect(result.requests.errors).toBe(0);
    });
  });

  describe('capabilities', () => {
    it('should return API capabilities', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.capabilities();

      expect(result.endpoints).toBeDefined();
      expect(result.endpoints.lead).toBeDefined();
      expect(result.endpoints.contact).toBeDefined();
      expect(result.endpoints.account).toBeDefined();
      expect(result.endpoints.opportunity).toBeDefined();
      expect(result.endpoints.task).toBeDefined();
      expect(result.endpoints.health).toBeDefined();
      expect(result.endpoints.system).toBeDefined();
      expect(result.authentication).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('should list lead operations', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.capabilities();

      expect(result.endpoints.lead.operations).toContain('create');
      expect(result.endpoints.lead.operations).toContain('read');
      expect(result.endpoints.lead.operations).toContain('update');
      expect(result.endpoints.lead.operations).toContain('delete');
      expect(result.endpoints.lead.operations).toContain('qualify');
      expect(result.endpoints.lead.operations).toContain('convert');
      expect(result.endpoints.lead.operations).toContain('score');
    });

    it('should list supported features', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.capabilities();

      expect(result.endpoints.lead.features).toContain('filtering');
      expect(result.endpoints.lead.features).toContain('pagination');
      expect(result.endpoints.lead.features).toContain('sorting');
      expect(result.endpoints.lead.features).toContain('search');
    });

    it('should include authentication methods', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.capabilities();

      expect(result.authentication.methods).toContain('jwt');
      expect(result.authentication.methods).toContain('session');
      expect(result.authentication.roles).toContain('USER');
      expect(result.authentication.roles).toContain('ADMIN');
    });

    it('should list all entity endpoints', async () => {
      const caller = systemRouter.createCaller(createPublicContext());
      const result = await caller.capabilities();

      const expectedEndpoints = ['lead', 'contact', 'account', 'opportunity', 'task', 'health', 'system'];

      expectedEndpoints.forEach(endpoint => {
        expect(result.endpoints).toHaveProperty(endpoint);
        expect(result.endpoints[endpoint].operations).toBeDefined();
        expect(result.endpoints[endpoint].features).toBeDefined();
      });
    });
  });
});
