// @vitest-environment jsdom
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

      expect(screen.getByText(/crm@leangency\.com/i)).toBeInTheDocument();
      // The "24 hours" text appears in multiple places - use getAllByText
      const elements24Hours = screen.getAllByText(/within 24 hours/i);
      expect(elements24Hours.length).toBeGreaterThan(0);
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
      expect(screen.getByText(/personalised demo/i)).toBeInTheDocument();
      expect(screen.getByText(/no commitment/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('renders no main landmark of its own (the Aurora shell provides it)', () => {
      render(<ContactPage />);

      expect(screen.queryByRole('main')).toBeNull();
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

      const emailLink = screen.getByRole('link', { name: /crm@leangency\.com/i });
      expect(emailLink).toHaveAttribute('href', 'mailto:crm@leangency.com');
    });

    it('should use semantic HTML for FAQ section', () => {
      render(<ContactPage />);

      const faqItems = document.querySelectorAll('details');
      expect(faqItems.length).toBeGreaterThan(0);
    });
  });

  describe('Brand Compliance', () => {
    it('uses the Aurora page frame and carries no old brand', () => {
      const { container } = render(<ContactPage />);

      expect(container.querySelector('.aurora-contact .as-h1')).toHaveTextContent('Get in touch');
      expect(document.body.innerHTML).not.toMatch(/IntelliFlow|#137fec/i);
    });

    it('answers only with claims the product backs', () => {
      render(<ContactPage />);

      expect(document.body.textContent).not.toMatch(/SOC 2|ISO 27001|REST API|Google Calendar/);
      expect(
        screen.getByText(/Gmail, Outlook, Slack, Microsoft Teams, Stripe and PayPal/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/multi-factor sign-in is available on every account/)
      ).toBeInTheDocument();
    });

    it('should use Material Symbols icons', () => {
      render(<ContactPage />);

      const icons = document.querySelectorAll('.material-symbols-outlined');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('lays the details and the form out side by side (stacking on a phone in contact.css)', () => {
      const { container } = render(<ContactPage />);

      const grid = container.querySelector('.ac-grid')!;
      expect(grid.querySelector('.ac-info')).not.toBeNull();
      expect(grid.querySelector('.ac-form form')).not.toBeNull();
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
      const images = document.body.querySelectorAll('img');
      expect(images.length).toBe(0); // Using icons instead of images
    });

    it('should use semantic HTML to minimize DOM size', () => {
      render(<ContactPage />);

      // Count total DOM nodes (should be reasonable)
      const allElements = document.body.querySelectorAll('*');
      expect(allElements.length).toBeLessThan(500); // Keep DOM lean
    });
  });
});
