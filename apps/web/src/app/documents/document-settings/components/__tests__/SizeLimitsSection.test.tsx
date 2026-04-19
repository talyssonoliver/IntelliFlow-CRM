import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SizeLimitsSection, type SizeLimitsValue } from '../SizeLimitsSection';

const VALUE: SizeLimitsValue = {
  maxFileSizeMB: 100,
  maxTotalStorageMB: 10240,
  maxFilesPerUpload: 20,
};

describe('SizeLimitsSection', () => {
  it('renders all three numeric inputs', () => {
    render(<SizeLimitsSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Max file size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max total storage/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max files per upload batch/i)).toBeInTheDocument();
  });

  it('initializes inputs from value prop', () => {
    render(<SizeLimitsSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Max file size/i)).toHaveValue(100);
    expect(screen.getByLabelText(/Max total storage/i)).toHaveValue(10240);
    expect(screen.getByLabelText(/Max files per upload batch/i)).toHaveValue(20);
  });

  it('calls onChange when maxFileSizeMB changes', () => {
    const onChange = vi.fn();
    render(<SizeLimitsSection value={VALUE} onChange={onChange} />);
    const input = screen.getByLabelText(/Max file size/i);
    fireEvent.change(input, { target: { value: '500' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxFileSizeMB: 500 }));
  });

  it('coerces float input to integer', () => {
    const onChange = vi.fn();
    render(<SizeLimitsSection value={VALUE} onChange={onChange} />);
    const input = screen.getByLabelText(/Max file size/i);
    fireEvent.change(input, { target: { value: '500.7' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxFileSizeMB: 500 }));
  });

  it('has min=1 and max=10000 attributes on maxFileSizeMB input', () => {
    render(<SizeLimitsSection value={VALUE} onChange={vi.fn()} />);
    const input = screen.getByLabelText(/Max file size/i);
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '10000');
  });

  it('renders section header', () => {
    render(<SizeLimitsSection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByText('Size Limits')).toBeInTheDocument();
  });

  it('clears to 0 on empty/non-numeric input (validator catches via min=1)', () => {
    const onChange = vi.fn();
    render(<SizeLimitsSection value={VALUE} onChange={onChange} />);
    const input = screen.getByLabelText(/Max file size/i);
    // type="number" browsers forward empty string for non-numeric; Number('') → 0
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ maxFileSizeMB: 0 }));
  });
});
