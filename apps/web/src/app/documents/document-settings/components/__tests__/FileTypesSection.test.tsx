import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTypesSection, type FileTypesValue } from '../FileTypesSection';

const VALUE: FileTypesValue = {
  allowedExtensions: ['pdf', 'docx'],
  blockedExtensions: ['exe'],
  allowedMimeTypes: ['application/pdf'],
};

describe('FileTypesSection', () => {
  it('renders allowed extensions as badges', () => {
    render(<FileTypesSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByTestId('allowed-pdf')).toBeInTheDocument();
    expect(screen.getByTestId('allowed-docx')).toBeInTheDocument();
  });

  it('renders blocked extensions as destructive badges', () => {
    render(<FileTypesSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByTestId('blocked-exe')).toBeInTheDocument();
  });

  it('calls onChange when an allowed extension is added', () => {
    const onChange = vi.fn();
    render(<FileTypesSection value={VALUE} onChange={onChange} />);
    const input = screen.getByLabelText(/Add allowed extension/i);
    fireEvent.change(input, { target: { value: 'xlsx' } });
    const addButton = screen.getAllByRole('button', { name: /Add/i })[0]!;
    fireEvent.click(addButton);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedExtensions: ['pdf', 'docx', 'xlsx'],
      })
    );
  });

  it('calls onChange when an allowed extension is removed', () => {
    const onChange = vi.fn();
    render(<FileTypesSection value={VALUE} onChange={onChange} />);
    const removeBtn = screen.getByLabelText(/Remove \.pdf/i);
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedExtensions: ['docx'],
      })
    );
  });

  it('ignores duplicate additions', () => {
    const onChange = vi.fn();
    render(<FileTypesSection value={VALUE} onChange={onChange} />);
    const input = screen.getByLabelText(/Add allowed extension/i);
    fireEvent.change(input, { target: { value: 'pdf' } });
    const addButton = screen.getAllByRole('button', { name: /Add/i })[0]!;
    fireEvent.click(addButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('normalizes additions (leading dot stripped, lowercased)', () => {
    const onChange = vi.fn();
    render(<FileTypesSection value={VALUE} onChange={onChange} />);
    const input = screen.getByLabelText(/Add allowed extension/i);
    fireEvent.change(input, { target: { value: '.PDF ' } });
    const addButton = screen.getAllByRole('button', { name: /Add/i })[0]!;
    fireEvent.click(addButton);
    // pdf already exists — no call
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows empty state when allowed extensions is empty', () => {
    render(
      <FileTypesSection
        value={{ allowedExtensions: [], blockedExtensions: [], allowedMimeTypes: [] }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText(/No allowed extensions configured/i)).toBeInTheDocument();
    expect(screen.getByText(/No blocked extensions/i)).toBeInTheDocument();
  });

  it('renders section header with icon', () => {
    render(<FileTypesSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByText('File Types')).toBeInTheDocument();
  });
});
