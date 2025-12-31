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
      featuresData.categories.forEach(category => {
        expect(category.id).toBeDefined();
        expect(category.name).toBeDefined();
        expect(category.description).toBeDefined();
        expect(category.icon).toBeDefined();
        expect(category.features).toBeDefined();
        expect(Array.isArray(category.features)).toBe(true);
      });
    });

    it('should have unique category IDs', () => {
      const ids = featuresData.categories.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have the expected category names', () => {
      const categoryNames = featuresData.categories.map(c => c.name);
      expect(categoryNames).toContain('Core CRM');
      expect(categoryNames).toContain('AI & Intelligence');
      expect(categoryNames).toContain('Security & Governance');
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
      featuresData.categories.forEach(category => {
        expect(category.features).toHaveLength(4);
      });
    });

    it('should have required feature fields', () => {
      featuresData.categories.forEach(category => {
        category.features.forEach(feature => {
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

      featuresData.categories.forEach(category => {
        category.features.forEach(feature => {
          allFeatureIds.push(feature.id);
        });
      });

      const uniqueIds = new Set(allFeatureIds);
      expect(uniqueIds.size).toBe(allFeatureIds.length);
    });

    it('should have non-empty feature titles', () => {
      featuresData.categories.forEach(category => {
        category.features.forEach(feature => {
          expect(feature.title.trim().length).toBeGreaterThan(0);
        });
      });
    });

    it('should have descriptive feature descriptions (min 50 chars)', () => {
      featuresData.categories.forEach(category => {
        category.features.forEach(feature => {
          expect(feature.description.length).toBeGreaterThan(50);
        });
      });
    });

    it('should have at least 2 benefits per feature', () => {
      featuresData.categories.forEach(category => {
        category.features.forEach(feature => {
          expect(feature.benefits.length).toBeGreaterThanOrEqual(2);
        });
      });
    });

    it('should have valid learn more URLs', () => {
      featuresData.categories.forEach(category => {
        category.features.forEach(feature => {
          expect(feature.learnMoreUrl).toMatch(/^\/features\//);
        });
      });
    });
  });

  describe('Icon Names', () => {
    it('should use valid Material Symbols icon names', () => {
      const validIconPattern = /^[a-z_]+$/;

      featuresData.categories.forEach(category => {
        expect(category.icon).toMatch(validIconPattern);

        category.features.forEach(feature => {
          expect(feature.icon).toMatch(validIconPattern);
        });
      });
    });
  });

  describe('Content Quality', () => {
    it('should have AI-related features in AI category', () => {
      const aiCategory = featuresData.categories.find(
        c => c.id === 'ai-intelligence'
      );

      expect(aiCategory).toBeDefined();
      expect(aiCategory!.features.length).toBeGreaterThan(0);

      // Check that features mention AI or intelligence
      const hasAIContent = aiCategory!.features.some(
        feature =>
          feature.title.toLowerCase().includes('ai') ||
          feature.description.toLowerCase().includes('ai') ||
          feature.description.toLowerCase().includes('intelligence')
      );

      expect(hasAIContent).toBe(true);
    });

    it('should have security-related features in security category', () => {
      const securityCategory = featuresData.categories.find(
        c => c.id === 'security-governance'
      );

      expect(securityCategory).toBeDefined();
      expect(securityCategory!.features.length).toBeGreaterThan(0);

      // Check that features mention security or compliance
      const hasSecurityContent = securityCategory!.features.some(
        feature =>
          feature.title.toLowerCase().includes('security') ||
          feature.title.toLowerCase().includes('compliance') ||
          feature.description.toLowerCase().includes('security')
      );

      expect(hasSecurityContent).toBe(true);
    });
  });
});
