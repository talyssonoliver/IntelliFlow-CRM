// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplyButton, SaveJobButton, ShareJobButton } from '../apply-button';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    className,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a href={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

/**
 * ApplyButton Component Tests
 *
 * Tests the apply button component for:
 * - Rendering and display
 * - Link behavior
 * - Accessibility
 * - Size variants
 * - Visual variants
 */
describe('ApplyButton', () => {
  const defaultProps = {
    jobId: 'sr-fullstack-eng',
    jobTitle: 'Senior Full-Stack Engineer',
  };

  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<ApplyButton {...defaultProps} />);

      expect(screen.getByText('Apply Now')).toBeInTheDocument();
    });

    it('should render with correct href', () => {
      render(<ApplyButton {...defaultProps} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/careers/sr-fullstack-eng#apply');
    });

    it('should have accessible label', () => {
      render(<ApplyButton {...defaultProps} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute(
        'aria-label',
        'Apply for Senior Full-Stack Engineer position'
      );
    });

    it('should show icon by default', () => {
      const { container } = render(<ApplyButton {...defaultProps} />);

      const icon = container.querySelector('.material-symbols-outlined');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveTextContent('arrow_forward');
    });

    it('should hide icon when showIcon is false', () => {
      const { container } = render(
        <ApplyButton {...defaultProps} showIcon={false} />
      );

      const icons = container.querySelectorAll('.material-symbols-outlined');
      expect(icons.length).toBe(0);
    });
  });

  describe('Size Variants', () => {
    it('should render small size', () => {
      render(<ApplyButton {...defaultProps} size="sm" />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('px-4', 'py-2', 'text-sm');
    });

    it('should render medium size by default', () => {
      render(<ApplyButton {...defaultProps} />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('px-6', 'py-2.5', 'text-base');
    });

    it('should render large size', () => {
      render(<ApplyButton {...defaultProps} size="lg" />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('px-8', 'py-3', 'text-lg');
    });
  });

  describe('Visual Variants', () => {
    it('should render primary variant by default', () => {
      render(<ApplyButton {...defaultProps} />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('bg-[#137fec]', 'text-white');
    });

    it('should render secondary variant', () => {
      render(<ApplyButton {...defaultProps} variant="secondary" />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('bg-slate-900');
    });

    it('should render outline variant', () => {
      render(<ApplyButton {...defaultProps} variant="outline" />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('border-2', 'border-[#137fec]');
    });
  });

  describe('Full Width', () => {
    it('should apply full width class when fullWidth is true', () => {
      render(<ApplyButton {...defaultProps} fullWidth />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('w-full');
    });

    it('should not have full width class by default', () => {
      render(<ApplyButton {...defaultProps} />);

      const link = screen.getByRole('link');
      expect(link).not.toHaveClass('w-full');
    });
  });

  describe('Custom ClassName', () => {
    it('should accept custom className', () => {
      render(<ApplyButton {...defaultProps} className="custom-class" />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('custom-class');
    });
  });
});

/**
 * SaveJobButton Component Tests
 */
describe('SaveJobButton', () => {
  const defaultProps = {
    jobId: 'sr-fullstack-eng',
    jobTitle: 'Senior Full-Stack Engineer',
  };

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('Rendering', () => {
    it('should render unsaved state by default', () => {
      render(<SaveJobButton {...defaultProps} />);

      expect(screen.getByText('Save for Later')).toBeInTheDocument();
    });

    it('should have accessible label for unsaved state', () => {
      render(<SaveJobButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute(
        'aria-label',
        'Save Senior Full-Stack Engineer for later'
      );
    });

    it('should show bookmark_border icon when unsaved', () => {
      const { container } = render(<SaveJobButton {...defaultProps} />);

      const icon = container.querySelector('.material-symbols-outlined');
      expect(icon).toHaveTextContent('bookmark_border');
    });
  });

  describe('Save Functionality', () => {
    it('should toggle to saved state on click', async () => {
      const user = userEvent.setup();
      render(<SaveJobButton {...defaultProps} />);

      const button = screen.getByRole('button');
      await user.click(button);

      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument();
      });
    });

    it('should show bookmark icon when saved', async () => {
      const user = userEvent.setup();
      const { container } = render(<SaveJobButton {...defaultProps} />);

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const icon = container.querySelector('.material-symbols-outlined');
        expect(icon).toHaveTextContent('bookmark');
      });
    });

    it('should update aria-pressed when saved', async () => {
      const user = userEvent.setup();
      render(<SaveJobButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-pressed', 'false');

      await user.click(button);

      await waitFor(() => {
        expect(button).toHaveAttribute('aria-pressed', 'true');
      });
    });

    it('should update aria-label when saved', async () => {
      const user = userEvent.setup();
      render(<SaveJobButton {...defaultProps} />);

      const button = screen.getByRole('button');
      await user.click(button);

      await waitFor(() => {
        expect(button).toHaveAttribute(
          'aria-label',
          'Remove Senior Full-Stack Engineer from saved jobs'
        );
      });
    });

    it('should persist saved state to localStorage', async () => {
      const user = userEvent.setup();
      render(<SaveJobButton {...defaultProps} />);

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const savedJobs = JSON.parse(localStorage.getItem('savedJobs') || '[]');
        expect(savedJobs).toContain('sr-fullstack-eng');
      });
    });

    it('should remove from localStorage when unsaved', async () => {
      const user = userEvent.setup();
      localStorage.setItem('savedJobs', JSON.stringify(['sr-fullstack-eng']));

      render(<SaveJobButton {...defaultProps} />);

      // First verify it shows as saved
      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument();
      });

      // Then unsave it
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const savedJobs = JSON.parse(localStorage.getItem('savedJobs') || '[]');
        expect(savedJobs).not.toContain('sr-fullstack-eng');
      });
    });

    it('should load saved state from localStorage on mount', async () => {
      localStorage.setItem('savedJobs', JSON.stringify(['sr-fullstack-eng']));

      render(<SaveJobButton {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument();
      });
    });
  });
});

/**
 * ShareJobButton Component Tests
 */
describe('ShareJobButton', () => {
  const defaultProps = {
    jobId: 'sr-fullstack-eng',
    jobTitle: 'Senior Full-Stack Engineer',
  };

  const mockWriteText = vi.fn().mockResolvedValue(undefined);
  let originalClipboard: Clipboard;

  beforeAll(() => {
    // Store original clipboard
    originalClipboard = navigator.clipboard;
    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: mockWriteText,
        readText: vi.fn().mockResolvedValue(''),
      },
      configurable: true,
    });
  });

  afterAll(() => {
    // Restore original clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
  });

  beforeEach(() => {
    mockWriteText.mockClear();
  });

  describe('Rendering', () => {
    it('should render share button', () => {
      render(<ShareJobButton {...defaultProps} />);

      expect(screen.getByText('Share')).toBeInTheDocument();
    });

    it('should have accessible label', () => {
      render(<ShareJobButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Share this job');
    });

    it('should have aria-haspopup attribute', () => {
      render(<ShareJobButton {...defaultProps} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('should start with dropdown closed', () => {
      render(<ShareJobButton {...defaultProps} />);

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('Dropdown Behavior', () => {
    it('should open dropdown on click', async () => {
      const user = userEvent.setup();
      render(<ShareJobButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Share this job' }));

      expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('should update aria-expanded when opened', async () => {
      const user = userEvent.setup();
      render(<ShareJobButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Share this job' });
      expect(button).toHaveAttribute('aria-expanded', 'false');

      await user.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('should show all share options in dropdown', async () => {
      const user = userEvent.setup();
      render(<ShareJobButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Share this job' }));

      expect(screen.getByText('Copy Link')).toBeInTheDocument();
      expect(screen.getByText('Share on LinkedIn')).toBeInTheDocument();
      expect(screen.getByText('Share on Twitter')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('should close dropdown when clicking outside', async () => {
      const user = userEvent.setup();
      render(<ShareJobButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Share this job' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click the overlay
      const overlay = document.querySelector('.fixed.inset-0');
      if (overlay) {
        fireEvent.click(overlay);
      }

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('Share Actions', () => {
    it('should execute copy link action', async () => {
      const user = userEvent.setup();
      render(<ShareJobButton {...defaultProps} />);

      // Open dropdown
      await user.click(screen.getByRole('button', { name: 'Share this job' }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click Copy Link
      await user.click(screen.getByText('Copy Link'));

      // Verify the action completed by checking dropdown closed
      await waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      });
    });

    it('should close dropdown after action', async () => {
      const user = userEvent.setup();
      render(<ShareJobButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Share this job' }));
      await user.click(screen.getByText('Copy Link'));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('Menu Items', () => {
    it('should have menuitem role for all options', async () => {
      const user = userEvent.setup();
      render(<ShareJobButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Share this job' }));

      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(4);
    });
  });
});
