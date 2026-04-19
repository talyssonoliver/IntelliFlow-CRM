import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
// import userEvent from '@testing-library/user-event';
import { DocumentUpload } from '../DocumentUpload';

// =============================================================================
// Mocks
// =============================================================================

const mockToast = vi.fn();

// Mock tRPC — the component calls trpc.documents.create.useMutation()
const mockMutateAsync = vi.fn().mockResolvedValue({ id: 'doc-123' });

vi.mock('@/lib/trpc', () => ({
  trpc: {
    documents: {
      create: {
        useMutation: () => ({
          mutateAsync: mockMutateAsync,
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, type, variant, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} type={type} data-variant={variant} {...props}>
      {children}
    </button>
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Badge: ({ children, variant, ...props }: any) => (
    <span data-variant={variant} {...props}>
      {children}
    </span>
  ),
  toast: (...args: any[]) => mockToast(...args),
}));

// Mock crypto.subtle for SHA-256 and crypto.randomUUID for upload ID
const mockDigest = vi.fn().mockResolvedValue(new ArrayBuffer(32));
let uuidCounter = 0;
Object.defineProperty(globalThis, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
    randomUUID: () => `test-uuid-${++uuidCounter}`,
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
    mockMutateAsync.mockResolvedValue({ id: 'doc-123' });
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
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });

  it('rejects file exceeding size limit', async () => {
    render(<DocumentUpload {...defaultProps} maxFileSizeMB={1} />);
    const file = new File(['large content'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 }); // 2MB

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
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
    // Source changed from a div with role="button" to a native <button>
    // (DocumentUpload.tsx:253). Native buttons have implicit role="button"
    // (no attribute) + tabIndex=0 by default.
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    expect(dropzone.tagName).toBe('BUTTON');
    expect(dropzone).toHaveAttribute('tabIndex', '0');
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
      expect(onUploadComplete).toHaveBeenCalledWith(expect.any(String));
    });
  });

  // ─── Drag and Drop (extended) ─────────────────────────────────────────────

  it('clears drag-over state on dragLeave', () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');

    // Dragging adds both border-primary and bg-primary/5
    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.className).toContain('bg-primary/5');

    // After dragLeave the drag-only background should be gone
    fireEvent.dragLeave(dropzone, {});
    expect(dropzone.className).not.toContain('bg-primary/5');
  });

  it('ignores drop with no files', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');

    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });

    // No file should be displayed and no toast fired
    expect(screen.queryByRole('button', { name: /remove selected file/i })).not.toBeInTheDocument();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('rejects invalid file type dropped on dropzone', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    const file = new File(['exe content'], 'bad.exe', { type: 'application/x-msdownload' });

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
    expect(screen.queryByText('bad.exe')).not.toBeInTheDocument();
  });

  it('rejects oversized file dropped on dropzone', async () => {
    render(<DocumentUpload {...defaultProps} maxFileSizeMB={1} />);
    const dropzone = screen.getByTestId('dropzone');
    const file = new File(['large'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 }); // 5 MB

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });

  it('clears isDragging on drop regardless of file validity', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');

    fireEvent.dragOver(dropzone, { dataTransfer: { files: [] } });
    expect(dropzone.className).toContain('border-primary');

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    // After drop isDragging should be false (border-primary removed from drag state)
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
    // The file selected class replaces the drag class
    expect(dropzone.className).not.toContain('bg-primary/5');
  });

  // ─── Keyboard accessibility (dropzone) ────────────────────────────────────

  it('opens file picker on Enter key press in dropzone', () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    // Spy on the hidden input's click
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    fireEvent.keyDown(dropzone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('opens file picker on Space key press in dropzone', () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    fireEvent.keyDown(dropzone, { key: ' ' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('does not open file picker on other key press', () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    fireEvent.keyDown(dropzone, { key: 'Tab' });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  // ─── Upload progress & submit states ─────────────────────────────────────

  it('hides progress bar when not uploading', () => {
    render(<DocumentUpload {...defaultProps} />);
    // The progressbar role is only rendered when isUploading=true
    expect(document.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('cancel button is enabled before upload starts', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    // Cancel should not be disabled in the idle state
    expect(cancelBtn).not.toBeDisabled();
  });

  it('shows Upload Document label on submit button when not uploading', () => {
    render(<DocumentUpload {...defaultProps} />);
    // The label is "Upload Document" when isUploading is false
    expect(screen.getByRole('button', { name: /upload document/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /uploading\.\.\./i })).not.toBeInTheDocument();
  });

  it('shows success toast after upload completes', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'success.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Document uploaded successfully' })
      );
    });
  });

  it('shows destructive toast when submitting without file', async () => {
    render(<DocumentUpload {...defaultProps} />);

    // Manually force title so we enter handleSubmit but no file
    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    });
  });

  // ─── Tags & metadata form interactions ────────────────────────────────────

  it('parses comma-separated tags and submits with file', async () => {
    const onUploadComplete = vi.fn();
    render(<DocumentUpload {...defaultProps} onUploadComplete={onUploadComplete} />);
    const file = new File(['content'], 'tagged.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const tagsInput = screen.getByLabelText(/tags/i);
    fireEvent.change(tagsInput, { target: { value: 'Legal, Contract, NDA' } });

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(onUploadComplete).toHaveBeenCalledWith(expect.any(String));
    });
  });

  it('updates classification when dropdown changes', () => {
    render(<DocumentUpload {...defaultProps} />);
    const select = screen.getByLabelText(/classification/i);

    fireEvent.change(select, { target: { value: 'CONFIDENTIAL' } });
    expect((select as HTMLSelectElement).value).toBe('CONFIDENTIAL');
  });

  it('updates description when textarea changes', () => {
    render(<DocumentUpload {...defaultProps} />);
    const textarea = screen.getByLabelText(/description/i);

    fireEvent.change(textarea, { target: { value: 'This is a test description.' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('This is a test description.');
  });

  it('allows manually overriding the auto-filled title', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'auto-title.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      expect(titleInput.value).toBeTruthy();
    });

    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Custom Title Override' } });
    expect(titleInput.value).toBe('Custom Title Override');
  });

  // ─── Cancel resets all fields ─────────────────────────────────────────────

  it('resets classification to INTERNAL on cancel', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const select = screen.getByLabelText(/classification/i);
    fireEvent.change(select, { target: { value: 'PRIVILEGED' } });
    expect((select as HTMLSelectElement).value).toBe('PRIVILEGED');

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect((select as HTMLSelectElement).value).toBe('INTERNAL');
  });

  it('resets tags field on cancel', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const tagsInput = screen.getByLabelText(/tags/i) as HTMLInputElement;
    fireEvent.change(tagsInput, { target: { value: 'Legal, NDA' } });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(tagsInput.value).toBe('');
  });

  it('resets description on cancel', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const textarea = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Some description' } });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(textarea.value).toBe('');
  });

  it('resets title on cancel', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My Document' } });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(titleInput.value).toBe('');
  });

  // ─── Hash computation failure (non-fatal) ─────────────────────────────────

  it('handles hash computation failure gracefully — file still selected', async () => {
    // Make digest reject to exercise the catch branch (lines 89-91)
    mockDigest.mockRejectedValueOnce(new Error('crypto unavailable'));

    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'no-hash.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // File is still selected despite hash failure
    await waitFor(() => {
      expect(screen.getByText('no-hash.pdf')).toBeInTheDocument();
    });

    // Hash line should NOT be rendered (fileHash stays null)
    expect(screen.queryByText(/SHA-256:/)).not.toBeInTheDocument();
  });

  // ─── Dropzone click handler ───────────────────────────────────────────────

  it('clicking the dropzone triggers the hidden file input', () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    fireEvent.click(dropzone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  // ─── Upload error handling (catch branch) ─────────────────────────────────

  it('shows upload failed toast when onUploadComplete callback throws', async () => {
    const onUploadComplete = vi.fn().mockImplementation(() => {
      throw new Error('Server error');
    });
    render(<DocumentUpload {...defaultProps} onUploadComplete={onUploadComplete} />);
    const file = new File(['content'], 'error.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const form = document.querySelector('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Upload failed',
          variant: 'destructive',
        })
      );
    });
  });

  // ─── Upload progress interval (line 149) ──────────────────────────────────

  it('progress interval increments upload progress before completion', async () => {
    // Spy on setInterval so we can capture and invoke the callback ourselves
    const intervalCallbacks: (() => void)[] = [];
    const originalSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((cb: any, _delay?: any) => {
      intervalCallbacks.push(cb);
      return originalSetInterval(() => {}, 9999999) as any;
    });

    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'progress.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const form = document.querySelector('form') as HTMLFormElement;
    // Invoke the interval callback before the submit completes
    // by calling it synchronously (exercising the (p) => Math.min(p + 10, 90) updater)
    await act(async () => {
      fireEvent.submit(form);
      // Call the captured interval callback at least once to cover line 149
      if (intervalCallbacks[0]) {
        intervalCallbacks[0]();
      }
    });

    vi.restoreAllMocks();

    // Upload should still complete and call toast
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Document uploaded successfully' })
      );
    });
  });

  // ─── Drop zone visual states ──────────────────────────────────────────────

  it('shows emerald border when file is selected', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const dropzone = screen.getByTestId('dropzone');
    const file = new File(['content'], 'selected.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 512 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(dropzone.className).toContain('border-emerald-300');
    });
  });

  it('accepts docx file via input', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['docx content'], 'report.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    Object.defineProperty(file, 'size', { value: 2048 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('report.docx')).toBeInTheDocument();
    });
  });

  it('accepts png image file via input', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['image data'], 'screenshot.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 4096 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('screenshot.png')).toBeInTheDocument();
    });
  });

  it('shows max file size in the hint text', () => {
    render(<DocumentUpload {...defaultProps} maxFileSizeMB={25} />);
    expect(screen.getByText(/25MB/)).toBeInTheDocument();
  });

  it('renders all classification options in dropdown', () => {
    render(<DocumentUpload {...defaultProps} />);
    const select = screen.getByLabelText(/classification/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PRIVILEGED']);
  });

  it('submit button remains disabled if file selected but title cleared', async () => {
    render(<DocumentUpload {...defaultProps} />);
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: 1024 });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload document/i })).not.toBeDisabled();
    });

    // Clear the auto-filled title
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: '' } });

    expect(screen.getByRole('button', { name: /upload document/i })).toBeDisabled();
  });
});
