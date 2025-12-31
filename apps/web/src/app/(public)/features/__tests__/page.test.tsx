import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import FeaturesPage from '../page';
import featuresData from '@/data/features-content.json';

/**
 * Unit tests for Features Page (PG-002)
 *
 * Following TDD principles:
 * - Test behavior, not implementation
 * - Test accessibility
 * - Test responsive design
 * - Test dark mode support
 */

describe('FeaturesPage', () => {
  beforeEach(() => {
    // Reset any mocks or state before each test
  });

  describe('Page Structure', () => {
    it('should render the hero section with correct heading', () => {
      render(<FeaturesPage />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toContain('Powerful Features');
    });

    it('should display a descriptive subheading', () => {
      render(<FeaturesPage />);

      // Should have text that explains the value proposition
      expect(screen.getByText(/AI-first CRM with modern automation/i)).toBeInTheDocument();
    });

    it('should have semantic section elements', () => {
      const { container } = render(<FeaturesPage />);

      const sections = container.querySelectorAll('section');
      expect(sections.length).toBeGreaterThan(0);
    });
  });

  describe('Features Data', () => {
    it('should load features from JSON file', () => {
      expect(featuresData).toBeDefined();
      expect(featuresData.categories).toHaveLength(3);
      expect(featuresData.metadata.totalFeatures).toBe(12);
    });

    it('should validate feature structure', () => {
      featuresData.categories.forEach(category => {
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('features');

        category.features.forEach(feature => {
          expect(feature).toHaveProperty('id');
          expect(feature).toHaveProperty('title');
          expect(feature).toHaveProperty('description');
          expect(feature).toHaveProperty('icon');
          expect(feature).toHaveProperty('benefits');
          expect(feature).toHaveProperty('learnMoreUrl');
        });
      });
    });

    it('should have exactly 12 features across 3 categories', () => {
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
  });

  describe('Features Grid', () => {
    it('should render all 12 features', () => {
      render(<FeaturesPage />);

      const featureCards = screen.getAllByTestId(/feature-card/i);
      expect(featureCards).toHaveLength(12);
    });

    it('should group features into 3 categories', () => {
      render(<FeaturesPage />);

      const categories = screen.getAllByTestId(/category-section/i);
      expect(categories).toHaveLength(3);
    });

    it('should display category names', () => {
      render(<FeaturesPage />);

      expect(screen.getByText('Core CRM')).toBeInTheDocument();
      expect(screen.getByText(/AI & Intelligence/i)).toBeInTheDocument();
      expect(screen.getByText(/Security & Governance/i)).toBeInTheDocument();
    });

    it('should render feature icons using Material Symbols', () => {
      const { container } = render(<FeaturesPage />);

      const icons = container.querySelectorAll('.material-symbols-outlined');
      expect(icons.length).toBeGreaterThan(0);

      // Should have icons for all 12 features
      expect(icons.length).toBeGreaterThanOrEqual(12);
    });

    it('should display feature titles and descriptions', () => {
      render(<FeaturesPage />);

      // Check a few key features are rendered
      expect(screen.getByText('AI Lead Scoring')).toBeInTheDocument();
      expect(screen.getByText(/Automatically score and prioritize/i)).toBeInTheDocument();

      expect(screen.getByText('Smart Contact Management')).toBeInTheDocument();
      expect(screen.getByText('Zero Trust Security')).toBeInTheDocument();
    });

    it('should have "Learn more" links for each feature', () => {
      render(<FeaturesPage />);

      const learnMoreLinks = screen.getAllByText(/learn more/i);
      expect(learnMoreLinks).toHaveLength(12);
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<FeaturesPage />);

      const h1 = screen.getAllByRole('heading', { level: 1 });
      const h2 = screen.getAllByRole('heading', { level: 2 });
      const h3 = screen.getAllByRole('heading', { level: 3 });

      expect(h1.length).toBeGreaterThan(0);
      expect(h2.length).toBeGreaterThan(0);
      expect(h3.length).toBeGreaterThan(0);
    });

    it('should have accessible links with proper ARIA labels', () => {
      render(<FeaturesPage />);

      const links = screen.getAllByRole('link');

      links.forEach(link => {
        // Links should either have text content or aria-label
        const hasTextContent = link.textContent && link.textContent.trim().length > 0;
        const hasAriaLabel = link.getAttribute('aria-label') !== null;

        expect(hasTextContent || hasAriaLabel).toBe(true);
      });
    });

    it('should support keyboard navigation', () => {
      render(<FeaturesPage />);

      const interactiveElements = screen.getAllByRole('link');

      interactiveElements.forEach(element => {
        // Should be focusable (not have tabindex="-1")
        expect(element.getAttribute('tabindex')).not.toBe('-1');
      });
    });

    it('should have proper color contrast for text', () => {
      const { container } = render(<FeaturesPage />);

      // Check that we're using semantic color classes from the design system
      const textElements = container.querySelectorAll('p, h1, h2, h3');

      textElements.forEach(element => {
        const classes = element.className;
        // Should use slate colors for text (which meet 4.5:1 contrast)
        const hasProperTextColor =
          classes.includes('text-slate-') ||
          classes.includes('text-white') ||
          classes.includes('text-[#');

        expect(hasProperTextColor).toBe(true);
      });
    });
  });

  describe('CTA Section', () => {
    it('should render a call-to-action section', () => {
      render(<FeaturesPage />);

      const ctaSection = screen.getByTestId('cta-section');
      expect(ctaSection).toBeInTheDocument();
    });

    it('should have primary and secondary CTA buttons', () => {
      render(<FeaturesPage />);

      // Should have at least one primary CTA
      const ctaButtons = screen.getAllByRole('link', { name: /get started|start|try|demo|pricing/i });
      expect(ctaButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive grid classes', () => {
      const { container } = render(<FeaturesPage />);

      const grids = container.querySelectorAll('[class*="grid"]');

      grids.forEach(grid => {
        const classes = grid.className;
        // Should have responsive breakpoints (md:, lg:, etc.)
        const hasResponsiveClasses =
          classes.includes('md:') ||
          classes.includes('lg:') ||
          classes.includes('sm:');

        expect(hasResponsiveClasses).toBe(true);
      });
    });

    it('should use container max-width for content', () => {
      const { container } = render(<FeaturesPage />);

      const containers = container.querySelectorAll('[class*="container"]');
      expect(containers.length).toBeGreaterThan(0);
    });
  });

  describe('Dark Mode Support', () => {
    it('should have dark mode variants for backgrounds', () => {
      const { container } = render(<FeaturesPage />);

      const sections = container.querySelectorAll('section, div[class*="bg-"]');

      let hasDarkVariants = false;
      sections.forEach(section => {
        if (section.className.includes('dark:')) {
          hasDarkVariants = true;
        }
      });

      expect(hasDarkVariants).toBe(true);
    });

    it('should have dark mode variants for text', () => {
      const { container } = render(<FeaturesPage />);

      const textElements = container.querySelectorAll('p, h1, h2, h3, span');

      let hasDarkTextVariants = false;
      textElements.forEach(element => {
        if (element.className.includes('dark:text-')) {
          hasDarkTextVariants = true;
        }
      });

      expect(hasDarkTextVariants).toBe(true);
    });
  });

  describe('Brand Consistency', () => {
    it('should use IntelliFlow primary color (#137fec)', () => {
      const { container } = render(<FeaturesPage />);

      const hashedClass = container.querySelector('[class*="[#137fec]"]');
      const primaryClass = container.querySelector('[class*="primary"]');

      expect(hashedClass || primaryClass).toBeTruthy();
    });

    it('should use Material Symbols Outlined icons', () => {
      const { container } = render(<FeaturesPage />);

      const icons = container.querySelectorAll('.material-symbols-outlined');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should not have blocking external resources', () => {
      const { container } = render(<FeaturesPage />);

      // Should not have any <script> tags that block rendering
      const scripts = container.querySelectorAll('script:not([async]):not([defer])');
      expect(scripts.length).toBe(0);
    });

    it('should use semantic HTML elements', () => {
      const { container } = render(<FeaturesPage />);

      // Should have semantic elements, not just divs
      expect(container.querySelector('section')).toBeInTheDocument();
      expect(container.querySelector('h1')).toBeInTheDocument();
    });
  });
});
