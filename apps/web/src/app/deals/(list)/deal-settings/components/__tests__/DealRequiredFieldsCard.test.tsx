import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealRequiredFieldsCard, type DealRequiredFieldRow } from '../DealRequiredFieldsCard';

const baseFields: DealRequiredFieldRow[] = [
  { fieldKey: 'accountId', isRequired: true },
  { fieldKey: 'ownerId', isRequired: true },
  { fieldKey: 'value', isRequired: false },
  { fieldKey: 'expectedCloseDate', isRequired: false },
  { fieldKey: 'stage', isRequired: false },
  { fieldKey: 'description', isRequired: false },
];

describe('DealRequiredFieldsCard', () => {
  it('renders every field row', () => {
    render(<DealRequiredFieldsCard fields={baseFields} onFieldsChange={vi.fn()} />);
    expect(screen.getByText('Account')).toBeDefined();
    expect(screen.getByText('Owner')).toBeDefined();
    expect(screen.getByText('Value')).toBeDefined();
    expect(screen.getByText('Stage')).toBeDefined();
    expect(screen.getByText('Description')).toBeDefined();
  });

  it('accountId and ownerId switches are disabled', () => {
    render(<DealRequiredFieldsCard fields={baseFields} onFieldsChange={vi.fn()} />);
    const account = screen.getByLabelText(/toggle account required/i) as HTMLButtonElement;
    const owner = screen.getByLabelText(/toggle owner required/i) as HTMLButtonElement;
    expect(account).toBeDisabled();
    expect(owner).toBeDisabled();
  });

  it('toggles value field', () => {
    const onChange = vi.fn();
    render(<DealRequiredFieldsCard fields={baseFields} onFieldsChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/toggle value required/i));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as DealRequiredFieldRow[];
    expect(next.find((f) => f.fieldKey === 'value')?.isRequired).toBe(true);
  });

  it('does nothing when locked keys are clicked', () => {
    const onChange = vi.fn();
    render(<DealRequiredFieldsCard fields={baseFields} onFieldsChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/toggle account required/i));
    expect(onChange).not.toHaveBeenCalled();
  });
});
