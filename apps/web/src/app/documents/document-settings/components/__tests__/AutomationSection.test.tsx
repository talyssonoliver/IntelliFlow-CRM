import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AutomationSection, type AutomationValue } from '../AutomationSection';

const DEFAULTS: AutomationValue = {
  normalizeFilename: true,
  preventDeleteIfReferenced: true,
  notifyOnOwnerChange: false,
  notifyOnUpload: false,
  aiDocumentClassification: false,
  aiSensitiveDataDetection: false,
  aiSummarization: false,
};

describe('AutomationSection', () => {
  it('renders the three category headings', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /^Active$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Pending infrastructure/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /AI .+ Intelligence/i })).toBeInTheDocument();
  });

  it('renders Cat-1 wired toggles as enabled', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    const normalize = screen.getByLabelText(/Normalize filenames on upload/i);
    const preventDelete = screen.getByLabelText(/Prevent delete if referenced/i);
    expect(normalize).not.toBeDisabled();
    expect(preventDelete).not.toBeDisabled();
  });

  it('renders Cat-2 pending toggles as disabled', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    const notifyUpload = screen.getByLabelText(/Notify stakeholders on upload/i);
    const notifyOwner = screen.getByLabelText(/Notify on owner change/i);
    expect(notifyUpload).toBeDisabled();
    expect(notifyOwner).toBeDisabled();
  });

  it('renders "Pending IFC-310" badge for notifyOnUpload', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    expect(screen.getByText(/Pending IFC-310/i)).toBeInTheDocument();
  });

  it('renders "Pending IFC-311" badge for notifyOnOwnerChange', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    expect(screen.getByText(/Pending IFC-311/i)).toBeInTheDocument();
  });

  it('defaults AI toggles to off (opt-in privacy stance)', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/AI document classification/i)).not.toBeChecked();
    expect(screen.getByLabelText(/AI sensitive data detection/i)).not.toBeChecked();
    expect(screen.getByLabelText(/AI summarization/i)).not.toBeChecked();
  });

  it('calls onChange when a Cat-1 toggle is flipped', () => {
    const onChange = vi.fn();
    render(<AutomationSection value={DEFAULTS} onChange={onChange} />);
    const toggle = screen.getByLabelText(/Normalize filenames on upload/i);
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ normalizeFilename: false }));
  });

  it('renders at least 3 "Opt-in" badge references for the AI section', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    // Badge component may render accessible text in multiple DOM nodes; accept ≥3 occurrences
    const optInBadges = screen.getAllByText(/Opt-in/i);
    expect(optInBadges.length).toBeGreaterThanOrEqual(3);
  });

  it('applies lg:col-span-12 for full-width automation card', () => {
    const { container } = render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    const card = container.querySelector('[class*="col-span-12"]');
    expect(card).not.toBeNull();
  });

  it('displays pending badges with data-testid for both Cat-2 rows', () => {
    render(<AutomationSection value={DEFAULTS} onChange={vi.fn()} />);
    expect(screen.getByTestId('pending-notifyOnUpload')).toBeInTheDocument();
    expect(screen.getByTestId('pending-notifyOnOwnerChange')).toBeInTheDocument();
  });
});
