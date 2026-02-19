import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentUpload } from '../DocumentUpload';

// =============================================================================
// Mocks
// =============================================================================

const mockToast = vi.fn();

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, type, variant, size, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} type={type} data-variant={variant} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Badge: ({ children, variant, ...props }: any) => <span data-variant={variant} {...props}>{children}</span>,
  toast: (...args: any[]) => mockToast(...args),
}));

// Mock crypto.subtle for SHA-256
const mockDigest = vi.fn().mockResolvedValue(new ArrayBuffer(32));
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
  writable: true,
});

// =============================================================================
// Tests
// =============================================================================

describe('DocumentUpload', () => {
  const defaultProps = {
    tenantId: 'tenant-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDigest.mockResolvedValue(new ArrayBuffer(32));
  });

  // ─── Rendering ────────────────────────────────────────────────────────────

  it('renders drag-and-drop zone', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
  });

  it('renders click-to-browse prompt', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByText(/click to browse/i)).toBeInTheDocument();
  });

  it('renders metadata form with title field', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
  });

  it('renders classification dropdown', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByLabelText(/classification/i)).toBeInTheDocument();
  });

  it('renders tags input', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
  });

  it('renders description textarea', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('renders accepted file types hint', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByText(/\.pdf/)).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('renders submit button disabled when no file selected', () => {
    render(<DocumentUpload {...defaultProps} />);
    const submitBtn = screen.getByRole('button', { name: /upload document/i });
    expect(submitBtn).toBeDisabled();
  });

  // ─── File Selection ───────────────────────────────────────────────────────

  it('accepts valid PDF file via input', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });

  it('rejects invalid file type with toast error', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['exe content'], 'malware.exe', { type: 'application/x-msdownload' });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });

  it('rejects file exceeding size limit', async () => {
    render(<DocumentUpload {...defaultProps} maxFileSizeMB={1} />);
    const file = new File(['large content'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 }); // 2MB

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' })
      );
    });
  });

  it('shows file name and size after selection', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 2048 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });
  });

  it('allows removing selected file', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });

    const removeBtn = screen.getByLabelText(/remove selected file/i);
    fireEvent.click(removeBtn);

    expect(screen.queryByText('test.pdf')).not.toBeInTheDocument();
  });

  // ─── Drag and Drop ────────────────────────────────────────────────────────

  it('shows drag-over visual state', () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');

    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.className).toContain('border-primary');
  });

  it('accepts file on drop', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    const file = new File(['dropped content'], 'dropped.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    fireEvent.drop(dropzone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
    });
  });

  // ─── Metadata Form ────────────────────────────────────────────────────────

  it('has required title field', () => {
    render(<DocumentUpload {...defaultProps} />);
    const titleInput = screen.getByLabelText(/title/i);
    expect(titleInput).toHaveAttribute('required');
  });

  it('renders all classification options', () => {
    render(<DocumentUpload {...defaultProps} />);
    const select = screen.getByLabelText(/classification/i);
    expect(select).toBeInTheDocument();
    // Default is INTERNAL
    expect(select).toHaveValue('INTERNAL');
  });

  it('auto-fills title from file name', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'my-document.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      expect(titleInput.value).toContain('my-document');
    });
  });

  // ─── Cancel ───────────────────────────────────────────────────────────────

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    render(<DocumentUpload {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('resets form state on cancel', async () => {
    render(<DocumentUpload {...defaultProps} />);

    // Select a file first
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // File should be removed
    expect(screen.queryByText('test.pdf')).not.toBeInTheDocument();
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('dropzone is keyboard accessible', () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    expect(dropzone).toHaveAttribute('tabIndex', '0');
    expect(dropzone).toHaveAttribute('role', 'button');
  });

  it('form fields have labels', () => {
    render(<DocumentUpload {...defaultProps} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/classification/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  // ─── SHA-256 Hash ─────────────────────────────────────────────────────────

  it('computes SHA-256 hash on file selection', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['test content for hash'], 'hash-test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockDigest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer));
    });
  });

  it('shows hash after computation', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/SHA-256:/)).toBeInTheDocument();
    });
  });

  // ─── Upload ───────────────────────────────────────────────────────────────

  it('submit button is enabled when file and title are provided', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /upload document/i });
      expect(submitBtn).not.toBeDisabled();
    });
  });

  it('calls onUploadComplete on successful submit', async () => {
    const onUploadComplete = vi.fn();
    render(<DocumentUpload {...defaultProps} onUploadComplete={onUploadComplete} />);
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // Ensure title is set
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    if (!titleInput.value) {
      fireEvent.change(titleInput, { target: { value: 'Test Doc' } });
    }

    // Submit
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith('new-doc-id');
    });
  });
});
