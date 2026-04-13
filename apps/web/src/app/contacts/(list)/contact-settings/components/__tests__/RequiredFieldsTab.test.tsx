import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RequiredFieldsTab, type RequiredFieldRow } from '../RequiredFieldsTab';

const baseFields: RequiredFieldRow[] = [
  { fieldKey: 'email', isRequired: true },
  { fieldKey: 'phone', isRequired: false },
  { fieldKey: 'company', isRequired: false },
  { fieldKey: 'jobTitle', isRequired: false },
  { fieldKey: 'ownerId', isRequired: false },
];

describe('RequiredFieldsTab', () => {
  it('renders email switch as checked and disabled', () => {
    render(<RequiredFieldsTab fields={baseFields} onFieldsChange={() => {}} />);
    const emailSwitch = screen.getByLabelText(/Require Email address/i) as HTMLElement;
    expect(emailSwitch).toHaveAttribute('aria-checked', 'true');
    expect(emailSwitch).toBeDisabled();
  });

  it('toggling phone calls onFieldsChange', () => {
    const onFieldsChange = vi.fn();
    render(<RequiredFieldsTab fields={baseFields} onFieldsChange={onFieldsChange} />);
    fireEvent.click(screen.getByLabelText(/Require Phone number/i));
    expect(onFieldsChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ fieldKey: 'phone', isRequired: true })])
    );
  });

  it('clicking the email switch does not change state', () => {
    const onFieldsChange = vi.fn();
    render(<RequiredFieldsTab fields={baseFields} onFieldsChange={onFieldsChange} />);
    fireEvent.click(screen.getByLabelText(/Require Email address/i));
    expect(onFieldsChange).not.toHaveBeenCalled();
  });
});
