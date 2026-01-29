/**
 * @vitest-environment jsdom
 */
/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { PasswordInput } from '../password-input';

describe('PasswordInput', () => {
  it('renders with default props', () => {
    const onChange = vi.fn();
    render(<PasswordInput value="" onChange={onChange} />);

    // Password inputs don't have a textbox role, use placeholder to find
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    const onChange = vi.fn();
    render(<PasswordInput value="" onChange={onChange} label="Password" />);

    expect(screen.getByText('Password')).toBeInTheDocument();
  });

  it('renders labelExtra content', () => {
    const onChange = vi.fn();
    render(
      <PasswordInput
        value=""
        onChange={onChange}
        label="Password"
        labelExtra={<a href="/forgot">Forgot?</a>}
      />
    );

    expect(screen.getByText('Forgot?')).toBeInTheDocument();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordInput value="secret" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Enter your password');
    expect(input).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: /show password/i });
    await user.click(toggleButton);

    expect(input).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('calls onChange when typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PasswordInput value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Enter your password');
    await user.type(input, 'test');

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onChange).toHaveBeenLastCalledWith('t');
  });

  it('displays error message', () => {
    const onChange = vi.fn();
    render(
      <PasswordInput
        value=""
        onChange={onChange}
        error="Password is required"
      />
    );

    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies error styling when error prop is provided', () => {
    const onChange = vi.fn();
    render(
      <PasswordInput
        value=""
        onChange={onChange}
        error="Error"
      />
    );

    const input = screen.getByPlaceholderText('Enter your password');
    expect(input).toHaveClass('border-red-500/50');
  });

  it('disables input when disabled prop is true', () => {
    const onChange = vi.fn();
    render(<PasswordInput value="" onChange={onChange} disabled />);

    const input = screen.getByPlaceholderText('Enter your password');
    expect(input).toBeDisabled();

    const toggleButton = screen.getByRole('button');
    expect(toggleButton).toBeDisabled();
  });

  it('sets correct autocomplete attribute', () => {
    const onChange = vi.fn();
    render(
      <PasswordInput
        value=""
        onChange={onChange}
        autoComplete="new-password"
      />
    );

    const input = screen.getByPlaceholderText('Enter your password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
  });

  it('uses custom placeholder', () => {
    const onChange = vi.fn();
    render(
      <PasswordInput
        value=""
        onChange={onChange}
        placeholder="Custom placeholder"
      />
    );

    expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
  });

  it('sets aria-invalid when error is present', () => {
    const onChange = vi.fn();
    render(
      <PasswordInput
        value=""
        onChange={onChange}
        error="Error message"
      />
    );

    const input = screen.getByPlaceholderText('Enter your password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-describedby for error messages', () => {
    const onChange = vi.fn();
    render(
      <PasswordInput
        id="password"
        value=""
        onChange={onChange}
        error="Error message"
      />
    );

    const input = screen.getByPlaceholderText('Enter your password');
    expect(input).toHaveAttribute('aria-describedby', 'password-error');
    expect(screen.getByText('Error message')).toHaveAttribute('id', 'password-error');
  });
});
