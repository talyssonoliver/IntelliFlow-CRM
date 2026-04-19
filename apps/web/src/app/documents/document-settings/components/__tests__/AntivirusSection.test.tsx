import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AntivirusSection, type AntivirusValue } from '../AntivirusSection';

const VALUE: AntivirusValue = {
  enableAntivirusScan: true,
  quarantineInfected: true,
  notifyAdminOnThreat: true,
};

describe('AntivirusSection', () => {
  it('renders all three switches', () => {
    render(<AntivirusSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Scan uploads for malware/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Quarantine infected files/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notify admin on threat detection/i)).toBeInTheDocument();
  });

  it('initializes switches from value prop', () => {
    render(<AntivirusSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Scan uploads/i)).toBeChecked();
    expect(screen.getByLabelText(/Quarantine/i)).toBeChecked();
    expect(screen.getByLabelText(/Notify admin/i)).toBeChecked();
  });

  it('calls onChange when enableAntivirusScan is toggled', () => {
    const onChange = vi.fn();
    render(<AntivirusSection value={VALUE} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Scan uploads/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enableAntivirusScan: false }));
  });

  it('calls onChange when quarantineInfected is toggled', () => {
    const onChange = vi.fn();
    render(<AntivirusSection value={VALUE} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Quarantine/i));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ quarantineInfected: false }));
  });

  it('renders section header with Antivirus title', () => {
    render(<AntivirusSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByText('Antivirus')).toBeInTheDocument();
  });

  it('handles all-false initial state', () => {
    render(
      <AntivirusSection
        value={{
          enableAntivirusScan: false,
          quarantineInfected: false,
          notifyAdminOnThreat: false,
        }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Scan uploads/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Quarantine/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Notify admin/i)).not.toBeChecked();
  });
});
