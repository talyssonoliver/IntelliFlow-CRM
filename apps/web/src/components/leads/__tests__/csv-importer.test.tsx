/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from '@/lib/leads/field-mapper';

// ---------------------------------------------------------------------------
// Mocks (mirror leads/(list)/new/__tests__/page.test.tsx)
// ---------------------------------------------------------------------------
const { mockUseRequireAuth, mockMutateAsync } = vi.hoisted(() => ({
  mockUseRequireAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'u1', email: 't@t.com' },
  })),
  mockMutateAsync: vi.fn().mockResolvedValue({ id: 'lead-1' }),
}));

vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: mockUseRequireAuth }));

vi.mock('@/lib/api', () => ({
  api: {
    lead: { create: { useMutation: () => ({ mutateAsync: mockMutateAsync, isPending: false }) } },
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) =>
    React.createElement('a', { href, ...props }, children),
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

vi.mock('@/components/shared', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { CsvImporter } from '../csv-importer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFile(content: string, name = 'leads.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

async function uploadFile(file: File): Promise<void> {
  const input = document.getElementById('lead-csv-file') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  mockMutateAsync.mockReset();
  mockMutateAsync.mockResolvedValue({ id: 'lead-1' });
  mockUseRequireAuth.mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'u1', email: 't@t.com' },
  });
});

describe('CsvImporter', () => {
  it('shows a skeleton while auth is loading', () => {
    mockUseRequireAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      user: { id: 'u1', email: 't@t.com' },
    });
    render(<CsvImporter />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Import Leads')).toBeNull();
  });

  it('renders the file-select step when authenticated', () => {
    render(<CsvImporter />);
    expect(screen.getByText('Import Leads')).toBeTruthy();
    expect(screen.getByText('Choose a .csv file')).toBeTruthy();
  });

  it('rejects an oversized file before reading it', async () => {
    render(<CsvImporter />);
    const file = makeFile('email\na@x.com', 'big.csv');
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_FILE_BYTES + 1 });
    await uploadFile(file);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/too large/i));
    // still on the select step — the map heading never rendered
    expect(screen.queryByText('Map columns to lead fields')).toBeNull();
    expect(screen.getByText('Choose a .csv file')).toBeTruthy();
  });

  it('rejects a file with too many rows without truncating', async () => {
    render(<CsvImporter />);
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `u${i}@x.com,N${i}`).join(
      '\n'
    );
    await uploadFile(makeFile(`email,first\n${body}`));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/too many rows/i));
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('rejects a header-only file with no data rows', async () => {
    render(<CsvImporter />);
    await uploadFile(makeFile('email,first'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no data rows/i));
  });

  it('auto-detects mapping and previews rows with validation status', async () => {
    render(<CsvImporter />);
    await uploadFile(makeFile('Email,First Name\na@x.com,Ann\n,Bob'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    // auto-detected email column
    expect((screen.getByLabelText(/Email/) as HTMLSelectElement).value).toBe('0');
    expect(screen.getByText('a@x.com')).toBeTruthy();
    // counts: 1 valid (Ann), 1 invalid (missing email)
    expect(screen.getByText('1', { selector: '.text-green-700, .text-green-400' })).toBeTruthy();
  });

  it('disables Import until an email column is mapped, then enables it', async () => {
    render(<CsvImporter />);
    // header "identifier" does not auto-map to email
    await uploadFile(makeFile('identifier,First Name\na@x.com,Ann'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    expect((screen.getByLabelText(/Email/) as HTMLSelectElement).value).toBe('');
    const importBtn = screen.getByRole('button', {
      name: /Import \d+ valid lead/i,
    }) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
    expect(screen.getByText(/Map a column to Email to enable import/i)).toBeTruthy();
    // user maps email -> column 0
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: '0' } });
    await waitFor(() => expect(importBtn.disabled).toBe(false));
  });

  it('imports each valid row via mutateAsync and shows the imported count', async () => {
    render(<CsvImporter />);
    await uploadFile(makeFile('email,first\na@x.com,Ann\nb@x.com,Bob'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Import 2 valid leads/i }));
    await waitFor(() => expect(screen.getByText('Import complete')).toBeTruthy());
    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/2/).textContent).toBeTruthy();
    expect(screen.getByText(/leads imported/i)).toBeTruthy();
  });

  it('sends the phone as a raw string, not a PhoneNumber value object', async () => {
    render(<CsvImporter />);
    await uploadFile(makeFile('email,phone\na@x.com,+442079460958'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Import 1 valid lead/i }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const payload = mockMutateAsync.mock.calls[0][0];
    expect(typeof payload.phone).toBe('string');
    expect(payload.phone).toBe('+442079460958');
  });

  it('continues past a mid-sequence server failure (does not abort)', async () => {
    mockMutateAsync
      .mockResolvedValueOnce({ id: 'r1' })
      .mockRejectedValueOnce(new Error('duplicate email'))
      .mockResolvedValueOnce({ id: 'r3' });
    render(<CsvImporter />);
    await uploadFile(makeFile('email,first\na@x.com,A\nb@x.com,B\nc@x.com,C'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Import 3 valid leads/i }));
    await waitFor(() => expect(screen.getByText('Import complete')).toBeTruthy());
    expect(mockMutateAsync).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/2/).textContent).toBeTruthy(); // 2 imported
    expect(screen.getByText('Failed rows (server error)')).toBeTruthy();
    expect(screen.getByText(/Row 3: duplicate email/i)).toBeTruthy();
  });

  it('surfaces invalid rows with reasons in the result (never silently dropped)', async () => {
    render(<CsvImporter />);
    await uploadFile(makeFile('email,first\na@x.com,Ann\n,Bob'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Import 1 valid lead/i }));
    await waitFor(() => expect(screen.getByText('Import complete')).toBeTruthy());
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Skipped rows (not imported)')).toBeTruthy();
    expect(screen.getByText(/Row 3:/i)).toBeTruthy();
  });

  it('announces progress in an aria-live region during import', async () => {
    let resolveFirst: ((v: unknown) => void) | undefined;
    mockMutateAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    render(<CsvImporter />);
    await uploadFile(makeFile('email,first\na@x.com,Ann'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Import 1 valid lead/i }));
    await waitFor(() =>
      expect(document.querySelector('output[aria-live="polite"]')?.textContent).toMatch(
        /Importing row 1 of 1/i
      )
    );
    resolveFirst?.({ id: 'r1' });
    await waitFor(() => expect(screen.getByText('Import complete')).toBeTruthy());
  });

  it('result step links back to leads and resets on "Import another"', async () => {
    render(<CsvImporter />);
    await uploadFile(makeFile('email,first\na@x.com,Ann'));
    await waitFor(() => expect(screen.getByText('Map columns to lead fields')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Import 1 valid lead/i }));
    await waitFor(() => expect(screen.getByText('Import complete')).toBeTruthy());
    const back = screen.getByRole('link', { name: 'Back to Leads' }) as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/leads');
    fireEvent.click(screen.getByRole('button', { name: 'Import another file' }));
    await waitFor(() => expect(screen.getByText('Choose a .csv file')).toBeTruthy());
    expect(screen.queryByText('Import complete')).toBeNull();
  });
});
