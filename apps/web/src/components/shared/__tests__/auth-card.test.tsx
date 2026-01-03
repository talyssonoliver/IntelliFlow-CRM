/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuthCard } from '../auth-card';

describe('AuthCard', () => {
  it('renders title', () => {
    render(<AuthCard title="Welcome">Content</AuthCard>);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome');
  });

  it('renders children', () => {
    render(
      <AuthCard title="Test">
        <div data-testid="child">Child content</div>
      </AuthCard>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders badge when provided', () => {
    render(
      <AuthCard title="Test" badge="SECURE">
        Content
      </AuthCard>
    );

    expect(screen.getByText('SECURE')).toBeInTheDocument();
  });

  it('renders badge icon when provided', () => {
    const { container } = render(
      <AuthCard title="Test" badge="Secure" badgeIcon="shield_lock">
        Content
      </AuthCard>
    );

    const icon = container.querySelector('.material-symbols-outlined');
    expect(icon).toHaveTextContent('shield_lock');
  });

  it('renders description when provided', () => {
    render(
      <AuthCard title="Test" description="This is a description">
        Content
      </AuthCard>
    );

    expect(screen.getByText('This is a description')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(
      <AuthCard title="Test" footer={<p data-testid="footer">Footer content</p>}>
        Content
      </AuthCard>
    );

    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('renders security badge when provided', () => {
    render(
      <AuthCard title="Test" securityBadge="256-bit encryption">
        Content
      </AuthCard>
    );

    expect(screen.getByText('256-bit encryption')).toBeInTheDocument();
  });

  it('applies animation by default', () => {
    const { container } = render(<AuthCard title="Test">Content</AuthCard>);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('animate-in');
  });

  it('can disable animation', () => {
    const { container } = render(
      <AuthCard title="Test" animate={false}>
        Content
      </AuthCard>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toHaveClass('animate-in');
  });

  it('applies custom className', () => {
    const { container } = render(
      <AuthCard title="Test" className="custom-class">
        Content
      </AuthCard>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('renders card with glass-morphism styling', () => {
    const { container } = render(<AuthCard title="Test">Content</AuthCard>);

    // Find the Card element with backdrop-blur
    const card = container.querySelector('.backdrop-blur-xl');
    expect(card).toBeInTheDocument();
  });

  it('does not render badge section when badge is not provided', () => {
    render(<AuthCard title="Test">Content</AuthCard>);

    // Should not find the badge wrapper
    const badges = document.querySelectorAll('.rounded-full.bg-white\\/10');
    expect(badges.length).toBe(0);
  });

  it('does not render description when not provided', () => {
    render(<AuthCard title="Test">Content</AuthCard>);

    const paragraphs = document.querySelectorAll('p.text-slate-300.text-sm');
    expect(paragraphs.length).toBe(0);
  });
});
