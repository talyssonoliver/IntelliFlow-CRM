import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PartyManager } from '../PartyManager';
import type { PartyData, PartyRole } from '../types';

// Mock crypto.randomUUID
vi.stubGlobal('crypto', { randomUUID: () => 'mock-uuid-123' });

const mockParties: PartyData[] = [
  {
    id: 'p1',
    name: 'John Smith',
    role: 'CLIENT',
    organization: 'Acme Corp',
    email: 'john@acme.com',
  },
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
    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'Expert Witness', role: 'EXPERT' })])
    );
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

  it('edit and update party', () => {
    const onUpdate = vi.fn();
    render(<PartyManager {...defaultProps} onUpdate={onUpdate} />);

    // Click edit on first party
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);

    // Form should show "Update Party" button
    expect(screen.getByText('Update Party')).toBeInTheDocument();

    // Change the name
    const nameInput = screen.getByLabelText('Party name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'John Smith Jr.' } });

    // Submit
    fireEvent.click(screen.getByText('Update Party'));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'John Smith Jr.', id: 'p1' })])
    );
  });

  it('cancel during edit resets form', () => {
    render(<PartyManager {...defaultProps} />);

    // Start editing
    const editButtons = screen.getAllByText('Edit');
    fireEvent.click(editButtons[0]);
    expect(screen.getByText('Update Party')).toBeInTheDocument();

    // Cancel
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Update Party')).not.toBeInTheDocument();
    expect(screen.getByText('+ Add Party')).toBeInTheDocument();
  });

  it('disabled prop hides edit/remove buttons and add party', () => {
    render(<PartyManager {...defaultProps} disabled={true} />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Add Party')).not.toBeInTheDocument();
  });

  it('renders party with all optional fields', () => {
    const fullParties: PartyData[] = [
      {
        id: 'p-full',
        name: 'Expert Witness',
        role: 'EXPERT',
        organization: 'Forensics Inc.',
        email: 'expert@forensics.com',
        phone: '+1-555-0123',
        notes: 'Available Mon-Fri',
      },
    ];
    render(<PartyManager {...defaultProps} parties={fullParties} />);
    expect(screen.getByText('Expert Witness')).toBeInTheDocument();
    expect(screen.getByText('Forensics Inc.')).toBeInTheDocument();
    expect(screen.getByText('expert@forensics.com')).toBeInTheDocument();
    expect(screen.getByText('+1-555-0123')).toBeInTheDocument();
    expect(screen.getByText('Available Mon-Fri')).toBeInTheDocument();
    expect(screen.getByText('Expert')).toBeInTheDocument();
  });

  it('renders WITNESS role badge color', () => {
    const witnessParties: PartyData[] = [{ id: 'pw', name: 'Witness 1', role: 'WITNESS' }];
    render(<PartyManager {...defaultProps} parties={witnessParties} />);
    expect(screen.getByText('Witness')).toBeInTheDocument();
  });

  it('renders JUDGE role badge color', () => {
    const judgeParties: PartyData[] = [{ id: 'pj', name: 'Hon. Justice Smith', role: 'JUDGE' }];
    render(<PartyManager {...defaultProps} parties={judgeParties} />);
    expect(screen.getByText('Judge')).toBeInTheDocument();
  });

  it('renders OTHER role badge with fallback', () => {
    const otherParties: PartyData[] = [
      { id: 'po', name: 'Translator', role: 'OTHER' as PartyRole },
    ];
    render(<PartyManager {...defaultProps} parties={otherParties} />);
    expect(screen.getByText('Translator')).toBeInTheDocument();
  });

  it('edit loads all fields into form', () => {
    const fullParties: PartyData[] = [
      {
        id: 'p-edit',
        name: 'Full Edit',
        role: 'EXPERT',
        organization: 'Org',
        email: 'e@o.com',
        phone: '123',
        notes: 'Some notes',
      },
    ];
    render(<PartyManager {...defaultProps} parties={fullParties} />);
    fireEvent.click(screen.getByText('Edit'));

    expect((screen.getByLabelText('Party name') as HTMLInputElement).value).toBe('Full Edit');
    expect((screen.getByLabelText('Organization') as HTMLInputElement).value).toBe('Org');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('e@o.com');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('123');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Some notes');
  });

  it('add party with organization, email, phone, and notes', () => {
    const onUpdate = vi.fn();
    render(<PartyManager {...defaultProps} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByText('+ Add Party'));

    fireEvent.change(screen.getByLabelText('Party name'), { target: { value: 'New Party' } });
    fireEvent.change(screen.getByLabelText('Organization'), { target: { value: 'Org Inc' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'np@org.com' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '555-0000' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'VIP' } });

    fireEvent.click(screen.getByText('Add Party'));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'New Party',
          organization: 'Org Inc',
          email: 'np@org.com',
          phone: '555-0000',
          notes: 'VIP',
        }),
      ])
    );
  });
});
