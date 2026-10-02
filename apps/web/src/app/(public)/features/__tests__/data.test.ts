import { describe, it, expect } from 'vitest';
import featuresData from '@/data/features-content.json';

/**
 * Data Validation Tests for Features Content
 *
 * Ensures features-content.json maintains correct structure
 * and has all required fields for the Features page.
 */

describe('Features Content Data', () => {
  describe('Metadata', () => {
    it('should have valid metadata', () => {
      expect(featuresData.metadata).toBeDefined();
      expect(featuresData.metadata.version).toBe('1.0.0');
      expect(featuresData.metadata.totalFeatures).toBe(12);
      expect(featuresData.metadata.totalCategories).toBe(3);
    });

    it('should have a last updated timestamp', () => {
      expect(featuresData.metadata.lastUpdated).toBeDefined();
      expect(typeof featuresData.metadata.lastUpdated).toBe('string');
    });
  });

  describe('Categories Structure', () => {
    it('should have exactly 3 categories', () => {
      expect(featuresData.categories).toHaveLength(3);
    });

    it('should have required category fields', () => {
      featuresData.categories.forEach((category) => {
        expect(category.id).toBeDefined();
        expect(category.name).toBeDefined();
        expect(category.description).toBeDefined();
        expect(category.icon).toBeDefined();
        expect(category.features).toBeDefined();
        expect(Array.isArray(category.features)).toBe(true);
      });
    });

    it('should have unique category IDs', () => {
      const ids = featuresData.categories.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have the expected category names', () => {
      const categoryNames = featuresData.categories.map((c) => c.name);
      expect(categoryNames).toEqual([
        'Agents that do the work',
        'Your pipeline and service',
        'Connected and secure',
      ]);
    });
  });

  describe('Features Structure', () => {
    it('should have exactly 12 features total', () => {
      const totalFeatures = featuresData.categories.reduce(
        (sum, category) => sum + category.features.length,
        0
      );
      expect(totalFeatures).toBe(12);
    });

    it('should have 4 features per category', () => {
      featuresData.categories.forEach((category) => {
        expect(category.features).toHaveLength(4);
      });
    });

    it('should have required feature fields', () => {
      featuresData.categories.forEach((category) => {
        category.features.forEach((feature) => {
          expect(feature.id).toBeDefined();
          expect(feature.title).toBeDefined();
          expect(feature.description).toBeDefined();
          expect(feature.icon).toBeDefined();
          expect(feature.benefits).toBeDefined();
          expect(feature.learnMoreUrl).toBeDefined();

          expect(typeof feature.id).toBe('string');
          expect(typeof feature.title).toBe('string');
          expect(typeof feature.description).toBe('string');
          expect(typeof feature.icon).toBe('string');
          expect(Array.isArray(feature.benefits)).toBe(true);
          expect(typeof feature.learnMoreUrl).toBe('string');
        });
      });
    });

    it('should have unique feature IDs across all categories', () => {
      const allFeatureIds: string[] = [];

      featuresData.categories.forEach((category) => {
        category.features.forEach((feature) => {
          allFeatureIds.push(feature.id);
        });
      });

      const uniqueIds = new Set(allFeatureIds);
      expect(uniqueIds.size).toBe(allFeatureIds.length);
    });

    it('should have non-empty feature titles', () => {
      featuresData.categories.forEach((category) => {
        category.features.forEach((feature) => {
          expect(feature.title.trim().length).toBeGreaterThan(0);
        });
      });
    });

    it('should have descriptive feature descriptions (min 50 chars)', () => {
      featuresData.categories.forEach((category) => {
        category.features.forEach((feature) => {
          expect(feature.description.length).toBeGreaterThan(50);
        });
      });
    });

    it('should have at least 2 benefits per feature', () => {
      featuresData.categories.forEach((category) => {
        category.features.forEach((feature) => {
          expect(feature.benefits.length).toBeGreaterThanOrEqual(2);
        });
      });
    });

    it('should only link to a landing section or a page that exists', () => {
      featuresData.categories.forEach((category) => {
        category.features.forEach((feature) => {
          expect(['/#agents', '/#platform', '/security', '/pricing']).toContain(
            feature.learnMoreUrl
          );
        });
      });
    });

    it('keeps the anchors the product tour points at', () => {
      const ids = featuresData.categories.flatMap((c) => c.features.map((f) => f.id));
      for (const anchor of ['ai-lead-scoring', 'workflow-automation', 'pipeline-analytics']) {
        expect(ids).toContain(anchor);
      }
    });

    it('claims nothing the product does not back', () => {
      const text = JSON.stringify(featuresData.categories).toLowerCase();
      for (const claim of [
        '%',
        'uptime sla',
        'sla guarantee',
        'iso 27001',
        'iso 42001',
        'gdpr',
        'soc 2',
        'zero trust',
        'zero-trust',
        'certif',
        'templates included',
        'hours per week',
      ]) {
        expect(text, claim).not.toContain(claim);
      }
    });
  });

  describe('Icon Names', () => {
    it('should use valid Material Symbols icon names', () => {
      const validIconPattern = /^[a-z_]+$/;

      featuresData.categories.forEach((category) => {
        expect(category.icon).toMatch(validIconPattern);

        category.features.forEach((feature) => {
          expect(feature.icon).toMatch(validIconPattern);
        });
      });
    });
  });

  describe('Content Quality', () => {
    it('should lead with the agents and a person approving their work', () => {
      const agents = featuresData.categories.find((c) => c.id === 'agents');
      expect(agents).toBeDefined();
      expect(agents!.features.map((f) => f.title)).toContain('One approval queue');
    });

    it('should say multi-factor sign-in is available, never enforced', () => {
      const secure = featuresData.categories.find((c) => c.id === 'connected-secure')!;
      const text = JSON.stringify(secure);
      expect(text).toMatch(/multi-factor sign-in is available on every account/i);
      expect(text).not.toMatch(/enforced/i);
    });
  });
});
