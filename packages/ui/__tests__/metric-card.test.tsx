// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MetricCard, formatValue } from '../src/components/metric-card';

describe('MetricCard', () => {
  describe('Rendering', () => {
    it('should render with title and value', () => {
      render(<MetricCard title="Total Leads" value={1240} />);
      expect(screen.getByText('Total Leads')).toBeInTheDocument();
      expect(screen.getByText('1,240')).toBeInTheDocument();
    });

    it('should render with string value', () => {
      render(<MetricCard title="Status" value="Active" />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('should render with icon', () => {
      render(<MetricCard title="Leads" value={100} icon="group" />);
      expect(screen.getByText('group')).toBeInTheDocument();
    });

    it('should render description', () => {
      render(<MetricCard title="Leads" value={100} description="vs last month" />);
      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });
  });

  describe('Value Formatting', () => {
    it('should format number with commas', () => {
      render(<MetricCard title="Count" value={1234567} format="number" />);
      expect(screen.getByText('1,234,567')).toBeInTheDocument();
    });

    it('should format currency in USD', () => {
      render(<MetricCard title="Revenue" value={125000} format="currency" />);
      expect(screen.getByText('$125,000')).toBeInTheDocument();
    });

    it('should format currency in EUR', () => {
      render(<MetricCard title="Revenue" value={125000} format="currency" currency="EUR" />);
      expect(screen.getByText(/125,000/)).toBeInTheDocument();
    });

    it('should format percentage', () => {
      render(<MetricCard title="Rate" value={45} format="percentage" />);
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('should format compact numbers', () => {
      render(<MetricCard title="Count" value={1500000} format="compact" />);
      expect(screen.getByText('1.5M')).toBeInTheDocument();
    });
  });

  describe('Change Indicator', () => {
    it('should show positive change', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          change={{ value: 12, direction: 'up' }}
        />
      );
      expect(screen.getByText('+12%')).toBeInTheDocument();
      expect(screen.getByText('trending_up')).toBeInTheDocument();
    });

    it('should show negative change', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          change={{ value: 5, direction: 'down' }}
        />
      );
      expect(screen.getByText('-5%')).toBeInTheDocument();
      expect(screen.getByText('trending_down')).toBeInTheDocument();
    });

    it('should show neutral change', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          change={{ value: 0, direction: 'neutral' }}
        />
      );
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('trending_flat')).toBeInTheDocument();
    });

    it('should show change label', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          change={{ value: 12, direction: 'up', label: 'vs last week' }}
        />
      );
      expect(screen.getByText('vs last week')).toBeInTheDocument();
    });

    it('should apply correct color for positive change', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          change={{ value: 12, direction: 'up' }}
        />
      );
      const changeContainer = screen.getByText('+12%').parentElement;
      expect(changeContainer).toHaveClass('text-green-600');
    });

    it('should apply correct color for negative change', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          change={{ value: 5, direction: 'down' }}
        />
      );
      const changeContainer = screen.getByText('-5%').parentElement;
      expect(changeContainer).toHaveClass('text-red-600');
    });
  });

  describe('Icon', () => {
    it('should render icon with default styling', () => {
      render(<MetricCard title="Leads" value={100} icon="group" />);
      const iconContainer = screen.getByText('group').parentElement;
      expect(iconContainer).toHaveClass('bg-primary/10');
    });

    it('should apply custom icon background', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          icon="group"
          iconBgClass="bg-green-100"
        />
      );
      const iconContainer = screen.getByText('group').parentElement;
      expect(iconContainer).toHaveClass('bg-green-100');
    });

    it('should apply custom icon color', () => {
      render(
        <MetricCard
          title="Leads"
          value={100}
          icon="group"
          iconColorClass="text-green-600"
        />
      );
      const icon = screen.getByText('group');
      expect(icon).toHaveClass('text-green-600');
    });

    it('should have aria-hidden on icon', () => {
      render(<MetricCard title="Leads" value={100} icon="group" />);
      const icon = screen.getByText('group');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Loading State', () => {
    it('should show skeleton when loading', () => {
      render(<MetricCard title="Leads" value={100} isLoading />);
      expect(screen.queryByText('Leads')).not.toBeInTheDocument();
      expect(screen.queryByText('100')).not.toBeInTheDocument();
    });

    it('should have animation class when loading', () => {
      const { container } = render(<MetricCard title="Leads" value={100} isLoading />);
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have card styling', () => {
      const { container } = render(<MetricCard title="Leads" value={100} />);
      const card = container.firstChild;
      expect(card).toHaveClass('rounded-lg', 'border', 'border-border', 'bg-card');
    });

    it('should accept custom className', () => {
      const { container } = render(
        <MetricCard title="Leads" value={100} className="custom-class" />
      );
      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Props', () => {
    it('should forward data-testid', () => {
      render(<MetricCard title="Leads" value={100} data-testid="metric-card" />);
      expect(screen.getByTestId('metric-card')).toBeInTheDocument();
    });
  });

  describe('Ref', () => {
    it('should forward ref correctly', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<MetricCard ref={ref} title="Leads" value={100} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });
});

describe('formatValue utility', () => {
  it('should format number with commas', () => {
    expect(formatValue(1234567, 'number')).toBe('1,234,567');
  });

  it('should format currency', () => {
    expect(formatValue(125000, 'currency', 'USD')).toBe('$125,000');
  });

  it('should format percentage', () => {
    expect(formatValue(45, 'percentage')).toBe('45%');
  });

  it('should format compact', () => {
    expect(formatValue(1500000, 'compact')).toBe('1.5M');
  });

  it('should return string values as-is', () => {
    expect(formatValue('Custom Value', 'number')).toBe('Custom Value');
  });

  it('should handle zero', () => {
    expect(formatValue(0, 'number')).toBe('0');
    expect(formatValue(0, 'currency')).toBe('$0');
    expect(formatValue(0, 'percentage')).toBe('0%');
  });
});
