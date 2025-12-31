import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ContactPage from '../page';

/**
 * Contact Page Tests
 *
 * Tests the contact page for:
 * - Rendering and content
 * - SEO metadata
 * - Accessibility
 * - Brand compliance
 */

describe('Contact Page', () => {
  describe('Rendering', () => {
    it('should render the page heading', () => {
      render(<ContactPage />);

      expect(screen.getByRole('heading', { name: /get in touch/i })).toBeInTheDocument();
    });

    it('should render the contact form', () => {
      render(<ContactPage />);

      expect(screen.getByRole('form')).toBeInTheDocument();
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
    });

    it('should display contact information', () => {
      render(<ContactPage />);

      expect(screen.getByText(/contact@intelliflow-crm\.com/i)).toBeInTheDocument();
      expect(screen.getByText(/24 hours/i)).toBeInTheDocument();
    });

    it('should render FAQ section', () => {
      render(<ContactPage />);

      expect(screen.getByText(/frequently asked questions/i)).toBeInTheDocument();
      expect(screen.getByText(/how quickly can we get started/i)).toBeInTheDocument();
      expect(screen.getByText(/do you offer a free trial/i)).toBeInTheDocument();
    });

    it('should render benefits/expectations section', () => {
      render(<ContactPage />);

      expect(screen.getByText(/what to expect/i)).toBeInTheDocument();
      expect(screen.getByText(/personalized demo/i)).toBeInTheDocument();
      expect(screen.getByText(/no commitment/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have main landmark', () => {
      render(<ContactPage />);

      const main = screen.getByRole('main');
      expect(main).toBeInTheDocument();
      expect(main).toHaveAttribute('id', 'main-content');
    });

    it('should have proper heading hierarchy', () => {
      render(<ContactPage />);

      const headings = screen.getAllByRole('heading');
      const h1 = headings.find((h) => h.tagName === 'H1');
      const h2s = headings.filter((h) => h.tagName === 'H2');

      expect(h1).toBeInTheDocument();
      expect(h2s.length).toBeGreaterThan(0);
    });

    it('should have accessible email link', () => {
      render(<ContactPage />);

      const emailLink = screen.getByRole('link', { name: /contact@intelliflow-crm\.com/i });
      expect(emailLink).toHaveAttribute('href', 'mailto:contact@intelliflow-crm.com');
    });

    it('should use semantic HTML for FAQ section', () => {
      render(<ContactPage />);

      const faqItems = document.querySelectorAll('details');
      expect(faqItems.length).toBeGreaterThan(0);
    });
  });

  describe('Brand Compliance', () => {
    it('should use primary brand color', () => {
      render(<ContactPage />);

      const page = document.body;
      expect(page.innerHTML).toContain('#137fec');
    });

    it('should use Material Symbols icons', () => {
      render(<ContactPage />);

      const icons = document.querySelectorAll('.material-symbols-outlined');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should have responsive layout classes', () => {
      render(<ContactPage />);

      const main = screen.getByRole('main');
      expect(main.className).toMatch(/lg:|md:|sm:/);
    });
  });

  describe('SEO', () => {
    it('should have descriptive content for search engines', () => {
      render(<ContactPage />);

      // Check for keyword-rich content
      expect(screen.getByText(/AI-powered platform/i)).toBeInTheDocument();
      expect(screen.getByText(/transform your sales process/i)).toBeInTheDocument();
    });
  });

  describe('Performance Considerations', () => {
    it('should not load heavy external resources', () => {
      render(<ContactPage />);

      // No external images or heavy scripts
      const main = screen.getByRole('main');
      const images = main.querySelectorAll('img');
      expect(images.length).toBe(0); // Using icons instead of images
    });

    it('should use semantic HTML to minimize DOM size', () => {
      render(<ContactPage />);

      // Count total DOM nodes (should be reasonable)
      const main = screen.getByRole('main');
      const allElements = main.querySelectorAll('*');
      expect(allElements.length).toBeLessThan(500); // Keep DOM lean
    });
  });
});
