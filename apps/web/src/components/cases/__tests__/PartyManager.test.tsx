import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyManager } from '../PartyManager';
import type { PartyData } from '../types';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'mock-uuid-123' });

const mockParties: PartyData[] = [
  { id: 'p1', name: 'John Smith', role: 'CLIENT', organization: 'Acme Corp', email: 'john@acme.com' },
  { id: 'p2', name: 'Sarah Johnson', role: 'OPPOSING_COUNSEL', organization: 'Law Firm LLC' },
];

const defaultProps = {
  parties: mockParties,
  onUpdate: vi.fn(),
};

describe('PartyManager', () => {
  it('renders party list from props', () => {
    render(<PartyManager {...defaultProps} />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
  });

  it('shows role badges', () => {
    render(<PartyManager {...defaultProps} />);
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Opposing Counsel')).toBeInTheDocument();
  });

  it('add party form with role selection', () => {
    render(<PartyManager {...defaultProps} />);
    fireEvent.click(screen.getByText('+ Add Party'));

    const nameInput = screen.getByLabelText('Party name');
    fireEvent.change(nameInput, { target: { value: 'Expert Witness' } });

    const roleSelect = screen.getByLabelText('Party role');
    fireEvent.change(roleSelect, { target: { value: 'EXPERT' } });

    fireEvent.click(screen.getByText('Add Party'));
    expect(defaultProps.onUpdate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'Expert Witness', role: 'EXPERT' }),
    ]));
  });

  it('edit party opens edit form', () => {
    render(<PartyManager {...defaultProps} />);
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    const nameInput = screen.getByLabelText('Party name') as HTMLInputElement;
    expect(nameInput.value).toBe('John Smith');
  });

  it('remove party calls callback', () => {
    render(<PartyManager {...defaultProps} />);
    const removeButtons = screen.getAllByText('Remove');
    fireEvent.click(removeButtons[0]);
    expect(defaultProps.onUpdate).toHaveBeenCalledWith([mockParties[1]]);
  });

  it('empty state shows "No parties"', () => {
    render(<PartyManager {...defaultProps} parties={[]} />);
    expect(screen.getByText('No parties')).toBeInTheDocument();
  });

  it('validation: name required', () => {
    render(<PartyManager {...defaultProps} />);
    fireEvent.click(screen.getByText('+ Add Party'));

    // Submit without filling name
    fireEvent.click(screen.getByText('Add Party'));

    // onUpdate should not be called with empty name
    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
  });
});
