// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Pagination, generatePageNumbers } from '../src/components/pagination';

describe('Pagination', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    onPageChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render pagination navigation', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByLabelText('Pagination')).toBeInTheDocument();
    });

    it('should render page numbers', () => {
      render(<Pagination {...defaultProps} totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to page 2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to page 3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to page 4' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to page 5' })).toBeInTheDocument();
    });

    it('should render previous and next buttons', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByLabelText('Previous')).toBeInTheDocument();
      expect(screen.getByLabelText('Next')).toBeInTheDocument();
    });

    it('should render first/last buttons when showFirstLast is true', () => {
      render(<Pagination {...defaultProps} showFirstLast />);
      expect(screen.getByLabelText('Go to first page')).toBeInTheDocument();
      expect(screen.getByLabelText('Go to last page')).toBeInTheDocument();
    });

    it('should not render first/last buttons by default', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.queryByLabelText('Go to first page')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Go to last page')).not.toBeInTheDocument();
    });
  });

  describe('Active Page', () => {
    it('should highlight current page', () => {
      render(<Pagination {...defaultProps} currentPage={3} totalPages={5} />);
      const activeButton = screen.getByRole('button', { name: 'Go to page 3' });
      expect(activeButton).toHaveAttribute('aria-current', 'page');
      // Active page uses bg-slate-900 (design system semantic color)
      expect(activeButton).toHaveClass('bg-slate-900');
    });

    it('should not highlight non-active pages', () => {
      render(<Pagination {...defaultProps} currentPage={3} totalPages={5} />);
      const inactiveButton = screen.getByRole('button', { name: 'Go to page 1' });
      expect(inactiveButton).not.toHaveAttribute('aria-current');
      // Non-active pages should not have the active background
      expect(inactiveButton).not.toHaveClass('bg-slate-900');
    });
  });

  describe('Navigation', () => {
    it('should call onPageChange when clicking page number', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      render(<Pagination {...defaultProps} onPageChange={onPageChange} totalPages={5} />);

      await user.click(screen.getByRole('button', { name: 'Go to page 3' }));
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('should call onPageChange when clicking next', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      render(<Pagination {...defaultProps} currentPage={2} onPageChange={onPageChange} />);

      await user.click(screen.getByLabelText('Next'));
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('should call onPageChange when clicking previous', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      render(<Pagination {...defaultProps} currentPage={3} onPageChange={onPageChange} />);

      await user.click(screen.getByLabelText('Previous'));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('should call onPageChange when clicking first page', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Pagination {...defaultProps} currentPage={5} onPageChange={onPageChange} showFirstLast />
      );

      await user.click(screen.getByLabelText('Go to first page'));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('should call onPageChange when clicking last page', async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      render(
        <Pagination {...defaultProps} currentPage={5} onPageChange={onPageChange} showFirstLast />
      );

      await user.click(screen.getByLabelText('Go to last page'));
      expect(onPageChange).toHaveBeenCalledWith(10);
    });
  });

  describe('Disabled States', () => {
    it('should disable previous button on first page', () => {
      render(<Pagination {...defaultProps} currentPage={1} />);
      expect(screen.getByLabelText('Previous')).toBeDisabled();
    });

    it('should disable next button on last page', () => {
      render(<Pagination {...defaultProps} currentPage={10} totalPages={10} />);
      expect(screen.getByLabelText('Next')).toBeDisabled();
    });

    it('should disable first button on first page', () => {
      render(<Pagination {...defaultProps} currentPage={1} showFirstLast />);
      expect(screen.getByLabelText('Go to first page')).toBeDisabled();
    });

    it('should disable last button on last page', () => {
      render(<Pagination {...defaultProps} currentPage={10} totalPages={10} showFirstLast />);
      expect(screen.getByLabelText('Go to last page')).toBeDisabled();
    });

    it('should enable all buttons when in middle', () => {
      render(<Pagination {...defaultProps} currentPage={5} showFirstLast />);
      expect(screen.getByLabelText('Previous')).not.toBeDisabled();
      expect(screen.getByLabelText('Next')).not.toBeDisabled();
      expect(screen.getByLabelText('Go to first page')).not.toBeDisabled();
      expect(screen.getByLabelText('Go to last page')).not.toBeDisabled();
    });
  });

  describe('Summary', () => {
    it('should show summary when showSummary is true', () => {
      render(
        <Pagination
          {...defaultProps}
          showSummary
          totalItems={100}
          pageSize={10}
          currentPage={1}
        />
      );
      // Summary format: "Showing X to Y of Z results"
      const summary = screen.getByText(/Showing.*to.*of.*results/);
      expect(summary).toBeInTheDocument();
    });

    it('should calculate correct range for middle pages', () => {
      render(
        <Pagination
          {...defaultProps}
          showSummary
          totalItems={100}
          pageSize={10}
          currentPage={5}
        />
      );
      // Page 5 of 10 pages with 10 items per page: items 41-50
      // Numbers are in separate span elements, so check for their presence
      expect(screen.getByText('41')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('should handle last page with fewer items', () => {
      render(
        <Pagination
          {...defaultProps}
          showSummary
          totalItems={95}
          pageSize={10}
          currentPage={10}
          totalPages={10}
        />
      );
      // Last page with 95 total items: items 91-95
      // Check for summary presence and specific values
      expect(screen.getByText(/Showing/)).toBeInTheDocument();
      expect(screen.getByText('91')).toBeInTheDocument();
    });

    it('should not show summary when showSummary is false', () => {
      render(
        <Pagination
          {...defaultProps}
          showSummary={false}
          totalItems={100}
          pageSize={10}
        />
      );
      expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    });
  });

  describe('Ellipsis', () => {
    it('should show ellipsis for many pages', () => {
      render(<Pagination {...defaultProps} currentPage={5} totalPages={20} />);
      const ellipsis = screen.getAllByText('...');
      expect(ellipsis.length).toBeGreaterThan(0);
    });

    it('should not show ellipsis for few pages', () => {
      render(<Pagination {...defaultProps} currentPage={2} totalPages={5} />);
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('should apply small size', () => {
      render(<Pagination {...defaultProps} size="sm" totalPages={3} />);
      const button = screen.getByRole('button', { name: 'Go to page 1' });
      expect(button).toHaveClass('h-7', 'min-w-7', 'text-xs');
    });

    it('should apply medium size by default', () => {
      render(<Pagination {...defaultProps} totalPages={3} />);
      const button = screen.getByRole('button', { name: 'Go to page 1' });
      expect(button).toHaveClass('h-9', 'min-w-9', 'text-sm');
    });

    it('should apply large size', () => {
      render(<Pagination {...defaultProps} size="lg" totalPages={3} />);
      const button = screen.getByRole('button', { name: 'Go to page 1' });
      expect(button).toHaveClass('h-11', 'min-w-11', 'text-base');
    });
  });

  describe('Styling', () => {
    it('should accept custom className', () => {
      render(<Pagination {...defaultProps} className="custom-class" />);
      expect(screen.getByRole('navigation')).toHaveClass('custom-class');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single page', () => {
      render(<Pagination {...defaultProps} currentPage={1} totalPages={1} />);
      expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
      expect(screen.getByLabelText('Previous')).toBeDisabled();
      expect(screen.getByLabelText('Next')).toBeDisabled();
    });

    it('should handle two pages', () => {
      render(<Pagination {...defaultProps} currentPage={1} totalPages={2} />);
      expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to page 2' })).toBeInTheDocument();
    });
  });
});

describe('generatePageNumbers', () => {
  it('should return all pages when totalPages <= maxVisible', () => {
    expect(generatePageNumbers(1, 5, 7)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should include ellipsis at end when current page is near start', () => {
    const pages = generatePageNumbers(2, 20, 5);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
    expect(pages).toContain('ellipsis');
  });

  it('should include ellipsis at start when current page is near end', () => {
    const pages = generatePageNumbers(19, 20, 5);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
    expect(pages).toContain('ellipsis');
  });

  it('should include ellipsis on both sides when in middle', () => {
    const pages = generatePageNumbers(10, 20, 5);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
    const ellipsisCount = pages.filter((p) => p === 'ellipsis').length;
    expect(ellipsisCount).toBe(2);
  });

  it('should always include first and last page', () => {
    const pages = generatePageNumbers(10, 20, 5);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
  });

  it('should handle edge case of 2 pages', () => {
    expect(generatePageNumbers(1, 2, 5)).toEqual([1, 2]);
  });

  it('should handle edge case of 1 page', () => {
    expect(generatePageNumbers(1, 1, 5)).toEqual([1]);
  });
});
