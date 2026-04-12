import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ============================================
// Mock SavedReportView to isolate page tests
// ============================================

const mockSavedReportView = vi.fn((_props: Record<string, unknown>) => (
  <div data-testid="saved-report-view" />
));

vi.mock('@/components/analytics/SavedReportView', () => ({
  default: (props: Record<string, unknown>) => {
    mockSavedReportView(props);
    return (
      <div data-testid="saved-report-view">
        <h1>{(props.config as Record<string, unknown>).title as string}</h1>
        <p>{(props.config as Record<string, unknown>).description as string}</p>
      </div>
    );
  },
}));

// ============================================
// Tests
// ============================================

describe('Saved Report Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Weekly page', () => {
    it('renders with heading "Weekly Summary"', async () => {
      const { default: WeeklyPage } = await import('@/app/analytics/(list)/saved/weekly/page');
      render(<WeeklyPage />);
      expect(screen.getByText('Weekly Summary')).toBeInTheDocument();
    });

    it('passes defaultPeriod="7d" to SavedReportView', async () => {
      const { default: WeeklyPage } = await import('@/app/analytics/(list)/saved/weekly/page');
      render(<WeeklyPage />);
      expect(mockSavedReportView).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ defaultPeriod: '7d', reportType: 'weekly' }),
        })
      );
    });

    it('passes breadcrumbLabel "Weekly Summary"', async () => {
      const { default: WeeklyPage } = await import('@/app/analytics/(list)/saved/weekly/page');
      render(<WeeklyPage />);
      expect(mockSavedReportView).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ breadcrumbLabel: 'Weekly Summary' }),
        })
      );
    });

    it('has use client directive', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('src/app/analytics/(list)/saved/weekly/page.tsx', 'utf-8');
      expect(content.startsWith("'use client'")).toBe(true);
    });
  });

  describe('Monthly page', () => {
    it('renders with heading "Monthly Revenue"', async () => {
      const { default: MonthlyPage } = await import('@/app/analytics/(list)/saved/monthly/page');
      render(<MonthlyPage />);
      expect(screen.getByText('Monthly Revenue')).toBeInTheDocument();
    });

    it('passes defaultPeriod="30d" to SavedReportView', async () => {
      const { default: MonthlyPage } = await import('@/app/analytics/(list)/saved/monthly/page');
      render(<MonthlyPage />);
      expect(mockSavedReportView).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ defaultPeriod: '30d', reportType: 'monthly' }),
        })
      );
    });

    it('passes breadcrumbLabel "Monthly Revenue"', async () => {
      const { default: MonthlyPage } = await import('@/app/analytics/(list)/saved/monthly/page');
      render(<MonthlyPage />);
      expect(mockSavedReportView).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ breadcrumbLabel: 'Monthly Revenue' }),
        })
      );
    });

    it('has use client directive', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('src/app/analytics/(list)/saved/monthly/page.tsx', 'utf-8');
      expect(content.startsWith("'use client'")).toBe(true);
    });
  });

  describe('Quarterly page', () => {
    it('renders with heading "Q4 Performance"', async () => {
      const { default: QuarterlyPage } =
        await import('@/app/analytics/(list)/saved/quarterly/page');
      render(<QuarterlyPage />);
      expect(screen.getByText('Q4 Performance')).toBeInTheDocument();
    });

    it('passes defaultPeriod="90d" to SavedReportView', async () => {
      const { default: QuarterlyPage } =
        await import('@/app/analytics/(list)/saved/quarterly/page');
      render(<QuarterlyPage />);
      expect(mockSavedReportView).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ defaultPeriod: '90d', reportType: 'quarterly' }),
        })
      );
    });

    it('passes breadcrumbLabel "Q4 Performance"', async () => {
      const { default: QuarterlyPage } =
        await import('@/app/analytics/(list)/saved/quarterly/page');
      render(<QuarterlyPage />);
      expect(mockSavedReportView).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ breadcrumbLabel: 'Q4 Performance' }),
        })
      );
    });

    it('has use client directive', async () => {
      const fs = await import('node:fs');
      const content = fs.readFileSync('src/app/analytics/(list)/saved/quarterly/page.tsx', 'utf-8');
      expect(content.startsWith("'use client'")).toBe(true);
    });
  });
});
