/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TrustIndicators, type TrustIndicatorItem } from '../trust-indicators';

describe('TrustIndicators', () => {
  it('renders default trust items', () => {
    render(<TrustIndicators />);

    expect(screen.getByText('Secure')).toBeInTheDocument();
    expect(screen.getByText('SOC 2 Type II')).toBeInTheDocument();
    expect(screen.getByText('GDPR Ready')).toBeInTheDocument();
  });

  it('renders custom items', () => {
    const customItems: TrustIndicatorItem[] = [
      { icon: 'lock', label: 'Encrypted' },
      { icon: 'verified', label: 'Verified' },
    ];

    render(<TrustIndicators items={customItems} />);

    expect(screen.getByText('Encrypted')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByText('Secure')).not.toBeInTheDocument();
  });

  it('renders inline variant by default', () => {
    const { container } = render(<TrustIndicators />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex', 'items-center', 'justify-center');
  });

  it('renders stacked variant', () => {
    const { container } = render(<TrustIndicators variant="stacked" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex-col');
  });

  it('renders separator dots in inline variant', () => {
    const { container } = render(<TrustIndicators />);

    // Should have 2 separator dots for 3 items
    const separators = container.querySelectorAll('.rounded-full.bg-slate-600');
    expect(separators.length).toBe(2);
  });

  it('does not render separator dots in stacked variant', () => {
    const { container } = render(<TrustIndicators variant="stacked" />);

    const separators = container.querySelectorAll('.rounded-full.bg-slate-600');
    expect(separators.length).toBe(0);
  });

  it('applies custom className', () => {
    const { container } = render(<TrustIndicators className="custom-class" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('renders material symbols icons', () => {
    const { container } = render(<TrustIndicators />);

    const icons = container.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBe(3);
  });

  it('hides icons from screen readers', () => {
    const { container } = render(<TrustIndicators />);

    const icons = container.querySelectorAll('.material-symbols-outlined');
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('renders single item without separator', () => {
    const singleItem: TrustIndicatorItem[] = [{ icon: 'lock', label: 'Secure' }];

    const { container } = render(<TrustIndicators items={singleItem} />);

    const separators = container.querySelectorAll('.rounded-full.bg-slate-600');
    expect(separators.length).toBe(0);
  });
});
