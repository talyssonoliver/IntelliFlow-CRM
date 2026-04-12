// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockHasSigned = vi.fn();
const mockRecordDpaSignature = vi.fn();
const mockGetStoredDpaSignature = vi.fn();

vi.mock('@/lib/legal/signature-handler.client', () => ({
  hasSigned: (...args: unknown[]) => mockHasSigned(...args),
  recordDpaSignature: (...args: unknown[]) => mockRecordDpaSignature(...args),
  getStoredDpaSignature: (...args: unknown[]) => mockGetStoredDpaSignature(...args),
  DPA_SIGNATURE_KEY: 'intelliflow_dpa_signature',
}));

import { DpaSignaturePanel } from '../dpa-signature-panel';

const DEFAULT_PROPS = {
  currentVersion: 'v2026.08',
  downloadPath: '/legal/dpa-template.pdf',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockHasSigned.mockReturnValue(false);
  mockGetStoredDpaSignature.mockReturnValue(null);
});

describe('DpaSignaturePanel', () => {
  it('returns null during loading state (SSR/hydration safety)', () => {
    // In SSR (server-side renderToString), useEffect never fires.
    // The component stays in 'loading' state and returns null → empty HTML.
    // This verifies NF-002: no hydration mismatch risk.
    const html = renderToString(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    expect(html).toBe('');
  });

  it('renders pending banner when no signature stored', async () => {
    mockHasSigned.mockReturnValue(false);
    mockGetStoredDpaSignature.mockReturnValue(null);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    // After useEffect, pending state should show
    const heading = await screen.findByText(/execute dpa/i);
    expect(heading).toBeTruthy();
  });

  it('renders name input in pending state', async () => {
    mockHasSigned.mockReturnValue(false);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    const input = await screen.findByRole('textbox');
    expect(input).toBeTruthy();
  });

  it('renders Download DPA Template link with correct href and download attribute', async () => {
    mockHasSigned.mockReturnValue(false);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    const link = await screen.findByRole('link', { name: /download dpa template/i });
    expect(link).toHaveAttribute('href', '/legal/dpa-template.pdf');
    expect(link).toHaveAttribute('download');
  });

  it('Execute button is disabled when name is empty', async () => {
    mockHasSigned.mockReturnValue(false);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    const button = await screen.findByRole('button', { name: /execute dpa/i });
    expect(button).toBeDisabled();
  });

  it('Execute button is disabled when name is filled but checkbox unchecked', async () => {
    mockHasSigned.mockReturnValue(false);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Jane Smith' } });
    const button = screen.getByRole('button', { name: /execute dpa/i });
    expect(button).toBeDisabled();
  });

  it('Execute button is enabled when name is filled AND checkbox is checked', async () => {
    mockHasSigned.mockReturnValue(false);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Jane Smith' } });
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    const button = screen.getByRole('button', { name: /execute dpa/i });
    expect(button).not.toBeDisabled();
  });

  it('clicking Execute with valid inputs calls recordDpaSignature and hides banner', async () => {
    mockHasSigned.mockReturnValue(false);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'Jane Smith' } });
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    const button = screen.getByRole('button', { name: /execute dpa/i });
    fireEvent.click(button);
    expect(mockRecordDpaSignature).toHaveBeenCalledWith('v2026.08', 'Jane Smith');
    // After signing, component returns null (signed state)
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: /execute dpa/i })).toBeNull();
    });
  });

  it('does NOT call recordDpaSignature when name is empty even if checkbox checked', async () => {
    mockHasSigned.mockReturnValue(false);
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    const checkboxes = await screen.findAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    // Try clicking the button (it should be disabled, but even if somehow triggered)
    const button = screen.getByRole('button', { name: /execute dpa/i });
    fireEvent.click(button);
    expect(mockRecordDpaSignature).not.toHaveBeenCalled();
  });

  it('returns null when localStorage has matching version (already signed)', () => {
    mockHasSigned.mockReturnValue(true);
    const { container } = render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    // Synchronously returns null
    expect(container.firstChild).toBeNull();
  });

  it('renders updated/re-acknowledge banner when stored version differs from currentVersion', async () => {
    mockHasSigned.mockReturnValue(false);
    mockGetStoredDpaSignature.mockReturnValue({
      dpaVersion: 'v2025.01',
      signedAt: '2025-01-01T00:00:00Z',
      signatoryName: 'Jane Smith',
      route: '/dpa',
    });
    render(<DpaSignaturePanel {...DEFAULT_PROPS} />);
    // Use findByRole('status') to find the banner, then check textContent for re-acknowledge
    const banner = await screen.findByRole('status');
    expect(banner.textContent).toMatch(/re-acknowledge/i);
  });
});
