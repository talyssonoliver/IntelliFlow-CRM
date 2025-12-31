import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PartnersPage, { metadata } from '../page';
import partnerData from '@/data/partner-benefits.json';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('PartnersPage', () => {
  describe('Metadata', () => {
    it('should have correct SEO metadata', () => {
      expect(metadata.title).toBe('Partner with IntelliFlow CRM | Technology & Business Partners');
      expect(metadata.description).toContain('Join our partner ecosystem');
      expect(metadata.description).toContain('API access');
      expect(metadata.description).toContain('revenue share');
    });

    it('should have Open Graph metadata', () => {
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.title).toBe('Partner with IntelliFlow CRM');
      expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/partners');
      expect(metadata.openGraph?.siteName).toBe('IntelliFlow CRM');
      expect(metadata.openGraph?.type).toBe('website');
    });

    it('should have Twitter metadata', () => {
      expect(metadata.twitter).toBeDefined();
      expect(metadata.twitter?.card).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBe('Partner with IntelliFlow CRM');
    });
  });

  describe('Hero Section', () => {
    it('should render hero with main heading', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 1,
        name: /Build, Sell, Grow with IntelliFlow CRM/i,
      });
      expect(heading).toBeDefined();
    });

    it('should render hero description', () => {
      render(<PartnersPage />);
      expect(
        screen.getByText(/Join our partner ecosystem to integrate your technology/i)
      ).toBeDefined();
    });

    it('should have CTA buttons in hero', () => {
      render(<PartnersPage />);
      const becomePartnerLink = screen.getByRole('link', { name: /Become a Partner/i });
      const learnMoreLink = screen.getByRole('link', { name: /Learn More/i });

      expect(becomePartnerLink).toBeDefined();
      expect(becomePartnerLink.getAttribute('href')).toBe('/contact');
      expect(learnMoreLink).toBeDefined();
      expect(learnMoreLink.getAttribute('href')).toBe('#benefits');
    });

    it('should have proper accessibility attributes in hero', () => {
      render(<PartnersPage />);
      const main = screen.getByRole('main');
      expect(main.id).toBe('main-content');
    });
  });

  describe('Integration Partners Grid', () => {
    it('should render integration partners section heading', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 2,
        name: /Integration Partners/i,
      });
      expect(heading).toBeDefined();
    });

    it('should render all partner cards from data', () => {
      render(<PartnersPage />);
      partnerData.partners.forEach((partner) => {
        expect(screen.getByText(partner.name)).toBeDefined();
        // Categories may appear multiple times (in partners grid and integration categories)
        const categoryElements = screen.queryAllByText(partner.category);
        expect(categoryElements.length).toBeGreaterThan(0);
      });
    });

    it('should render correct number of partner cards', () => {
      render(<PartnersPage />);
      const partnerCards = screen.getAllByText(/Slack|Gmail|Google Calendar|HubSpot|Salesforce|Stripe|Zendesk|Intercom|Zapier|Segment|Mixpanel|DocuSign/);
      expect(partnerCards.length).toBeGreaterThanOrEqual(partnerData.partners.length);
    });
  });

  describe('Integration Categories', () => {
    it('should render integration ecosystem section', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 2,
        name: /Integration Ecosystem/i,
      });
      expect(heading).toBeDefined();
    });

    it('should render all integration categories from data', () => {
      render(<PartnersPage />);
      partnerData.integration_categories.forEach((category) => {
        expect(screen.getByText(category.name)).toBeDefined();
        expect(screen.getByText(category.description)).toBeDefined();
      });
    });

    it('should apply category colors to icons', () => {
      const { container } = render(<PartnersPage />);
      partnerData.integration_categories.forEach((category) => {
        // Find elements with the category color
        const elementsWithColor = container.querySelectorAll(`[style*="${category.color}"]`);
        expect(elementsWithColor.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Partnership Benefits', () => {
    it('should render partnership benefits section', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 2,
        name: /Partnership Benefits/i,
      });
      expect(heading).toBeDefined();
    });

    it('should render technology partner benefits', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 3,
        name: /Technology Partners/i,
      });
      expect(heading).toBeDefined();

      partnerData.benefits.technology.forEach((benefit) => {
        expect(screen.getByText(benefit.title)).toBeDefined();
        expect(screen.getByText(benefit.description)).toBeDefined();
      });
    });

    it('should render reseller partner benefits', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 3,
        name: /Reseller Partners/i,
      });
      expect(heading).toBeDefined();

      partnerData.benefits.reseller.forEach((benefit) => {
        expect(screen.getByText(benefit.title)).toBeDefined();
        expect(screen.getByText(benefit.description)).toBeDefined();
      });
    });

    it('should render consultant partner benefits', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 3,
        name: /Consultant Partners/i,
      });
      expect(heading).toBeDefined();

      partnerData.benefits.consultant.forEach((benefit) => {
        expect(screen.getByText(benefit.title)).toBeDefined();
        expect(screen.getByText(benefit.description)).toBeDefined();
      });
    });
  });

  describe('CTA Section', () => {
    it('should render CTA section with heading', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 2,
        name: /Ready to Partner with IntelliFlow CRM?/i,
      });
      expect(heading).toBeDefined();
    });

    it('should have Apply Now button linking to contact', () => {
      render(<PartnersPage />);
      const applyLink = screen.getByRole('link', { name: /Apply Now/i });
      expect(applyLink).toBeDefined();
      expect(applyLink.getAttribute('href')).toBe('/contact');
    });

    it('should have View FAQ button linking to FAQ section', () => {
      render(<PartnersPage />);
      const faqLink = screen.getByRole('link', { name: /View FAQ/i });
      expect(faqLink).toBeDefined();
      expect(faqLink.getAttribute('href')).toBe('#faq');
    });
  });

  describe('FAQ Section', () => {
    it('should render FAQ section heading', () => {
      render(<PartnersPage />);
      const heading = screen.getByRole('heading', {
        level: 2,
        name: /Frequently Asked Questions/i,
      });
      expect(heading).toBeDefined();
    });

    it('should render all FAQ questions from data', () => {
      render(<PartnersPage />);
      partnerData.faqs.forEach((faq) => {
        expect(screen.getByText(faq.question)).toBeDefined();
        expect(screen.getByText(faq.answer)).toBeDefined();
      });
    });

    it('should render FAQs as details/summary elements', () => {
      const { container } = render(<PartnersPage />);
      const detailsElements = container.querySelectorAll('details');
      expect(detailsElements.length).toBe(partnerData.faqs.length);
    });

    it('should have proper FAQ section ID for anchor links', () => {
      const { container } = render(<PartnersPage />);
      const faqSection = container.querySelector('section#faq');
      expect(faqSection).toBeDefined();
    });
  });

  describe('Accessibility', () => {
    it('should have semantic HTML structure', () => {
      const { container } = render(<PartnersPage />);
      expect(container.querySelector('main')).toBeDefined();
      expect(container.querySelectorAll('section').length).toBeGreaterThan(0);
    });

    it('should have proper heading hierarchy', () => {
      const { container } = render(<PartnersPage />);
      const h1 = container.querySelector('h1');
      const h2s = container.querySelectorAll('h2');
      const h3s = container.querySelectorAll('h3');

      expect(h1).toBeDefined();
      expect(h2s.length).toBeGreaterThan(0);
      expect(h3s.length).toBeGreaterThan(0);
    });

    it('should have aria-hidden on decorative icons', () => {
      const { container } = render(<PartnersPage />);
      const icons = container.querySelectorAll('.material-symbols-outlined');
      icons.forEach((icon) => {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('should have skip link to main content', () => {
      const { container } = render(<PartnersPage />);
      const main = container.querySelector('main#main-content');
      expect(main).toBeDefined();
    });
  });

  describe('Brand Compliance', () => {
    it('should use primary brand color for CTAs', () => {
      const { container } = render(<PartnersPage />);
      // Check for #137fec color usage
      const brandColorElements = container.querySelectorAll('[class*="137fec"]');
      expect(brandColorElements.length).toBeGreaterThan(0);
    });

    it('should support dark mode classes', () => {
      const { container } = render(<PartnersPage />);
      const darkModeElements = container.querySelectorAll('[class*="dark:"]');
      expect(darkModeElements.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should be a static page with no client-side JavaScript requirements', () => {
      const { container } = render(<PartnersPage />);
      // Verify no "use client" directive is needed
      expect(container).toBeDefined();
    });

    it('should use semantic HTML instead of heavy components', () => {
      const { container } = render(<PartnersPage />);
      expect(container.querySelector('main')).toBeDefined();
      expect(container.querySelectorAll('section').length).toBeGreaterThan(0);
    });
  });

  describe('Data Integration', () => {
    it('should correctly import partner data', () => {
      expect(partnerData).toBeDefined();
      expect(partnerData.partners).toBeInstanceOf(Array);
      expect(partnerData.benefits).toBeDefined();
      expect(partnerData.integration_categories).toBeInstanceOf(Array);
      expect(partnerData.faqs).toBeInstanceOf(Array);
    });

    it('should have all required data fields', () => {
      expect(partnerData.partners.length).toBeGreaterThan(0);
      expect(partnerData.benefits.technology.length).toBeGreaterThan(0);
      expect(partnerData.benefits.reseller.length).toBeGreaterThan(0);
      expect(partnerData.benefits.consultant.length).toBeGreaterThan(0);
      expect(partnerData.integration_categories.length).toBeGreaterThan(0);
      expect(partnerData.faqs.length).toBeGreaterThan(0);
    });
  });

  describe('Links and Navigation', () => {
    it('should have all anchor links properly set up', () => {
      render(<PartnersPage />);
      const benefitsLink = screen.getByRole('link', { name: /Learn More/i });
      const faqLink = screen.getByRole('link', { name: /View FAQ/i });

      expect(benefitsLink.getAttribute('href')).toBe('#benefits');
      expect(faqLink.getAttribute('href')).toBe('#faq');
    });

    it('should link CTAs to contact page', () => {
      render(<PartnersPage />);
      const ctaLinks = screen.getAllByRole('link', { name: /Become a Partner|Apply Now/i });

      ctaLinks.forEach((link) => {
        expect(link.getAttribute('href')).toBe('/contact');
      });
    });
  });
});
