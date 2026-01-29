// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { JobDetailTemplate, type JobListing } from '../job-detail-template';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

/**
 * JobDetailTemplate Component Tests
 *
 * Tests the job detail template component for:
 * - Rendering job information
 * - Sections display (responsibilities, requirements, benefits)
 * - Breadcrumb navigation
 * - Related jobs
 * - Sticky apply bar behavior
 * - Accessibility
 */

const mockJob: JobListing = {
  id: 'sr-fullstack-eng',
  title: 'Senior Full-Stack Engineer',
  department: 'Engineering',
  location: 'Remote (UK/EU)',
  type: 'Full-time',
  description:
    'We are looking for a Senior Full-Stack Engineer to join our core platform team.',
  responsibilities: [
    'Design and implement new features',
    'Lead technical design discussions',
    'Mentor junior engineers',
  ],
  requirements: [
    '5+ years of professional software engineering experience',
    'Strong proficiency in TypeScript and React',
    'Experience with Node.js backend development',
  ],
  niceToHave: [
    'Experience with AI/ML integrations',
    'Contributions to open-source projects',
  ],
  benefits: [
    'Competitive salary + equity',
    'Remote-first culture',
    'Flexible working hours',
  ],
  salary: {
    min: 90000,
    max: 130000,
    currency: 'GBP',
  },
  postedAt: '2025-12-15',
};

const mockRelatedJobs: JobListing[] = [
  {
    id: 'ai-engineer',
    title: 'AI/ML Engineer',
    department: 'Engineering',
    location: 'Remote (Global)',
    type: 'Full-time',
    description: 'Design and implement AI features.',
    responsibilities: [],
    requirements: [],
    postedAt: '2025-12-10',
  },
];

describe('JobDetailTemplate', () => {
  beforeEach(() => {
    // Mock scroll position
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Header Section', () => {
    it('should render job title as h1', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Senior Full-Stack Engineer');
    });

    it('should render department badge', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // Department appears in header and sidebar
      const deptElements = screen.getAllByText('Engineering');
      expect(deptElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should render location', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // Location appears in header and sidebar
      const locationElements = screen.getAllByText('Remote (UK/EU)');
      expect(locationElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should render employment type', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // Type appears multiple times
      expect(screen.getAllByText('Full-time').length).toBeGreaterThanOrEqual(1);
    });

    it('should render formatted salary range', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // GBP formatting - appears in both header and sidebar
      const salaryElements = screen.getAllByText(/£90,000 - £130,000/);
      expect(salaryElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('should render breadcrumb navigation', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav).toBeInTheDocument();
    });

    it('should have link to home', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const homeLink = screen.getByRole('link', { name: 'Home' });
      expect(homeLink).toHaveAttribute('href', '/');
    });

    it('should have link to careers page', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const careersLink = screen.getByRole('link', { name: 'Careers' });
      expect(careersLink).toHaveAttribute('href', '/careers');
    });

    it('should show current job title', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav).toHaveTextContent('Senior Full-Stack Engineer');
    });
  });

  describe('About Section', () => {
    it('should render About the Role section', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const heading = screen.getByRole('heading', { name: /about the role/i });
      expect(heading).toBeInTheDocument();
    });

    it('should render job description', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByText(/We are looking for a Senior Full-Stack Engineer/)
      ).toBeInTheDocument();
    });
  });

  describe('Responsibilities Section', () => {
    it('should render responsibilities heading', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByRole('heading', { name: /what you'll do/i })
      ).toBeInTheDocument();
    });

    it('should render all responsibilities', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByText('Design and implement new features')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Lead technical design discussions')
      ).toBeInTheDocument();
      expect(screen.getByText('Mentor junior engineers')).toBeInTheDocument();
    });

    it('should have section with aria-labelledby', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const section = document.querySelector(
        'section[aria-labelledby="responsibilities-heading"]'
      );
      expect(section).toBeInTheDocument();
    });
  });

  describe('Requirements Section', () => {
    it('should render requirements heading', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByRole('heading', { name: /what we're looking for/i })
      ).toBeInTheDocument();
    });

    it('should render all requirements', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByText(/5\+ years of professional software engineering/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Strong proficiency in TypeScript and React/)
      ).toBeInTheDocument();
    });
  });

  describe('Nice to Have Section', () => {
    it('should render nice to have section when present', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByRole('heading', { name: /nice to have/i })
      ).toBeInTheDocument();
    });

    it('should render all nice to have items', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByText('Experience with AI/ML integrations')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Contributions to open-source projects')
      ).toBeInTheDocument();
    });

    it('should not render section when niceToHave is empty', () => {
      const jobWithoutNiceToHave = { ...mockJob, niceToHave: [] };
      render(<JobDetailTemplate job={jobWithoutNiceToHave} />);

      expect(
        screen.queryByRole('heading', { name: /nice to have/i })
      ).not.toBeInTheDocument();
    });

    it('should not render section when niceToHave is undefined', () => {
      const jobWithoutNiceToHave = { ...mockJob, niceToHave: undefined };
      render(<JobDetailTemplate job={jobWithoutNiceToHave} />);

      expect(
        screen.queryByRole('heading', { name: /nice to have/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Benefits Section', () => {
    it('should render benefits section when present', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByRole('heading', { name: /benefits & perks/i })
      ).toBeInTheDocument();
    });

    it('should render all benefits', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        screen.getByText('Competitive salary + equity')
      ).toBeInTheDocument();
      expect(screen.getByText('Remote-first culture')).toBeInTheDocument();
      expect(screen.getByText('Flexible working hours')).toBeInTheDocument();
    });

    it('should not render section when benefits is empty', () => {
      const jobWithoutBenefits = { ...mockJob, benefits: [] };
      render(<JobDetailTemplate job={jobWithoutBenefits} />);

      expect(
        screen.queryByRole('heading', { name: /benefits & perks/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('Sidebar', () => {
    it('should render job details card', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(screen.getByText('Job Details')).toBeInTheDocument();
    });

    it('should render department in sidebar', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const sidebar = screen.getByText('Job Details').closest('aside');
      expect(sidebar).toHaveTextContent('Engineering');
    });

    it('should render formatted post date', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // December 15, 2025 format
      expect(screen.getByText('December 15, 2025')).toBeInTheDocument();
    });

    it('should render questions card', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(screen.getByText('Questions?')).toBeInTheDocument();
    });

    it('should have contact recruiting link', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const contactLink = screen.getByRole('link', {
        name: /contact recruiting/i,
      });
      expect(contactLink).toHaveAttribute('href', '/contact?subject=careers');
    });
  });

  describe('Related Jobs Section', () => {
    it('should render related jobs section when provided', () => {
      render(
        <JobDetailTemplate job={mockJob} relatedJobs={mockRelatedJobs} />
      );

      expect(
        screen.getByRole('heading', { name: /similar opportunities/i })
      ).toBeInTheDocument();
    });

    it('should render related job cards', () => {
      render(
        <JobDetailTemplate job={mockJob} relatedJobs={mockRelatedJobs} />
      );

      expect(screen.getByText('AI/ML Engineer')).toBeInTheDocument();
    });

    it('should not render section when no related jobs', () => {
      render(<JobDetailTemplate job={mockJob} relatedJobs={[]} />);

      expect(
        screen.queryByRole('heading', { name: /similar opportunities/i })
      ).not.toBeInTheDocument();
    });

    it('should link to related job detail page', () => {
      render(
        <JobDetailTemplate job={mockJob} relatedJobs={mockRelatedJobs} />
      );

      // Find the related job card link by its text content
      const relatedJobTitle = screen.getByText('AI/ML Engineer');
      const relatedJobLink = relatedJobTitle.closest('a');
      expect(relatedJobLink).toHaveAttribute('href', '/careers/ai-engineer');
    });
  });

  describe('Apply Buttons', () => {
    it('should render apply button in header', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // There should be multiple apply buttons
      const applyLinks = screen.getAllByRole('link', { name: /apply/i });
      expect(applyLinks.length).toBeGreaterThanOrEqual(1);
    });

    it('should render apply button in sidebar', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // Sidebar apply button
      const applyLinks = screen.getAllByRole('link', { name: /apply/i });
      expect(applyLinks.some(link => link.closest('aside'))).toBe(true);
    });
  });

  describe('Sticky Apply Bar', () => {
    it('should not show sticky bar initially', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // The sticky bar should only appear after scrolling
      const stickyBar = document.querySelector('.fixed.bottom-0');
      expect(stickyBar).not.toBeInTheDocument();
    });

    it('should show sticky bar after scrolling past hero', async () => {
      render(<JobDetailTemplate job={mockJob} />);

      // Simulate scroll
      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 500 });
        window.dispatchEvent(new Event('scroll'));
      });

      const stickyBar = document.querySelector('.fixed.bottom-0.lg\\:hidden');
      expect(stickyBar).toBeInTheDocument();
    });

    it('should hide sticky bar when scrolling back to top', async () => {
      render(<JobDetailTemplate job={mockJob} />);

      // Scroll down first
      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 500 });
        window.dispatchEvent(new Event('scroll'));
      });

      // Then scroll back up
      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 0 });
        window.dispatchEvent(new Event('scroll'));
      });

      const stickyBar = document.querySelector('.fixed.bottom-0.lg\\:hidden');
      expect(stickyBar).not.toBeInTheDocument();
    });

    it('should display job title in sticky bar', async () => {
      render(<JobDetailTemplate job={mockJob} />);

      await act(async () => {
        Object.defineProperty(window, 'scrollY', { value: 500 });
        window.dispatchEvent(new Event('scroll'));
      });

      const stickyBar = document.querySelector('.fixed.bottom-0');
      expect(stickyBar).toHaveTextContent('Senior Full-Stack Engineer');
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      render(<JobDetailTemplate job={mockJob} />);

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent('Senior Full-Stack Engineer');

      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBeGreaterThanOrEqual(3); // About, Responsibilities, Requirements
    });

    it('should have aria-labelledby for sections', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(
        document.querySelector('section[aria-labelledby="about-heading"]')
      ).toBeInTheDocument();
      expect(
        document.querySelector(
          'section[aria-labelledby="responsibilities-heading"]'
        )
      ).toBeInTheDocument();
      expect(
        document.querySelector('section[aria-labelledby="requirements-heading"]')
      ).toBeInTheDocument();
    });

    it('should have aria-hidden on decorative icons', () => {
      const { container } = render(<JobDetailTemplate job={mockJob} />);

      const icons = container.querySelectorAll('.material-symbols-outlined');
      const hiddenIcons = Array.from(icons).filter(
        icon => icon.getAttribute('aria-hidden') === 'true'
      );
      expect(hiddenIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Date Formatting', () => {
    it('should format posted date correctly', () => {
      render(<JobDetailTemplate job={mockJob} />);

      expect(screen.getByText('December 15, 2025')).toBeInTheDocument();
    });

    it('should format closing date when present', () => {
      const jobWithClosingDate = {
        ...mockJob,
        closingDate: '2026-01-15',
      };
      render(<JobDetailTemplate job={jobWithClosingDate} />);

      expect(screen.getByText('January 15, 2026')).toBeInTheDocument();
    });
  });

  describe('Salary Formatting', () => {
    it('should format GBP salary correctly', () => {
      render(<JobDetailTemplate job={mockJob} />);

      // Salary appears in both header and sidebar
      const salaryElements = screen.getAllByText(/£90,000 - £130,000/);
      expect(salaryElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should format USD salary correctly', () => {
      const jobWithUSD = {
        ...mockJob,
        salary: { min: 100000, max: 150000, currency: 'USD' },
      };
      render(<JobDetailTemplate job={jobWithUSD} />);

      // Salary appears in both header and sidebar
      const salaryElements = screen.getAllByText(/\$100,000 - \$150,000/);
      expect(salaryElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should not show salary when not provided', () => {
      const jobWithoutSalary = { ...mockJob, salary: undefined };
      render(<JobDetailTemplate job={jobWithoutSalary} />);

      // Should not have payments icon visible in header
      const salarySection = screen.queryByText(/£90,000/);
      expect(salarySection).not.toBeInTheDocument();
    });
  });
});
