import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DocumentViewer } from '../DocumentViewer';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, variant, size, asChild, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {asChild ? children : children}
    </button>
  ),
}));

// Mock fetch for text/plain content
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock fullscreen API
const mockRequestFullscreen = vi.fn().mockResolvedValue(undefined);
const mockExitFullscreen = vi.fn().mockResolvedValue(undefined);

// =============================================================================
// Tests
// =============================================================================

describe('DocumentViewer', () => {
  const defaultProps = {
    documentId: 'doc-1',
    storageUrl: 'https://storage.example.com/doc-1.pdf',
    mimeType: 'application/pdf',
    fileName: 'test-document.pdf',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      text: () => Promise.resolve('Sample text content'),
    });
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
    });
  });

  // ─── PDF Rendering ────────────────────────────────────────────────────────

  it('renders iframe for PDF files', () => {
    render(<DocumentViewer {...defaultProps} />);
    const iframe = screen.getByTestId('pdf-viewer');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', defaultProps.storageUrl);
  });

  it('PDF iframe has sandbox attribute', () => {
    render(<DocumentViewer {...defaultProps} />);
    const iframe = screen.getByTestId('pdf-viewer');
    expect(iframe).toHaveAttribute('sandbox', 'allow-same-origin');
  });

  it('PDF iframe has title attribute', () => {
    render(<DocumentViewer {...defaultProps} />);
    const iframe = screen.getByTestId('pdf-viewer');
    expect(iframe).toHaveAttribute('title', 'test-document.pdf');
  });

  // ─── Image Rendering ─────────────────────────────────────────────────────

  it('renders img for PNG files', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/png"
        storageUrl="https://storage.example.com/image.png"
        fileName="photo.png"
      />
    );
    const img = screen.getByTestId('image-viewer');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'photo.png');
  });

  it('renders img for JPEG files', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/jpeg"
        fileName="photo.jpg"
      />
    );
    const img = screen.getByTestId('image-viewer');
    expect(img).toBeInTheDocument();
  });

  it('image has alt text with filename', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/png"
        fileName="screenshot.png"
      />
    );
    expect(screen.getByAltText('screenshot.png')).toBeInTheDocument();
  });

  // ─── Text/Plain Rendering ────────────────────────────────────────────────

  it('renders pre for text/plain files', async () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="text/plain"
        storageUrl="https://storage.example.com/readme.txt"
        fileName="readme.txt"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('text-viewer')).toBeInTheDocument();
    });
  });

  // ─── HTML Rendering ──────────────────────────────────────────────────────

  it('renders iframe for text/html with strict sandbox', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="text/html"
        fileName="page.html"
      />
    );
    const iframe = screen.getByTestId('html-viewer');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('sandbox', '');
  });

  it('HTML iframe is more restrictive than PDF iframe', () => {
    const { rerender } = render(
      <DocumentViewer {...defaultProps} mimeType="text/html" fileName="page.html" />
    );
    const htmlSandbox = screen.getByTestId('html-viewer').getAttribute('sandbox');

    rerender(<DocumentViewer {...defaultProps} />);
    const pdfSandbox = screen.getByTestId('pdf-viewer').getAttribute('sandbox');

    // HTML sandbox should be empty (most restrictive), PDF allows same-origin
    expect(htmlSandbox).toBe('');
    expect(pdfSandbox).toBe('allow-same-origin');
  });

  // ─── Download Fallback ────────────────────────────────────────────────────

  it('renders download fallback for DOCX', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fileName="report.docx"
      />
    );
    expect(screen.getByTestId('download-fallback')).toBeInTheDocument();
    // "report.docx" appears in toolbar and fallback
    expect(screen.getAllByText('report.docx').length).toBeGreaterThanOrEqual(1);
  });

  it('renders download fallback for unknown MIME types', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="application/octet-stream"
        fileName="unknown.bin"
      />
    );
    expect(screen.getByTestId('download-fallback')).toBeInTheDocument();
  });

  it('download fallback has download link', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="application/octet-stream"
        fileName="data.bin"
      />
    );
    const fallback = screen.getByTestId('download-fallback');
    const link = within(fallback).getByRole('link');
    expect(link).toHaveAttribute('href', defaultProps.storageUrl);
    expect(link).toHaveAttribute('download', 'data.bin');
  });

  // ─── Controls ─────────────────────────────────────────────────────────────

  it('renders download button in toolbar', () => {
    render(<DocumentViewer {...defaultProps} />);
    expect(screen.getByLabelText(/download/i)).toBeInTheDocument();
  });

  it('renders fullscreen toggle button', () => {
    render(<DocumentViewer {...defaultProps} />);
    expect(screen.getByLabelText(/fullscreen/i)).toBeInTheDocument();
  });

  it('renders print button for PDF', () => {
    render(<DocumentViewer {...defaultProps} />);
    expect(screen.getByLabelText(/print/i)).toBeInTheDocument();
  });

  it('does not render print button for non-PDF', () => {
    render(
      <DocumentViewer {...defaultProps} mimeType="image/png" fileName="photo.png" />
    );
    expect(screen.queryByLabelText(/print/i)).not.toBeInTheDocument();
  });

  it('renders close button when onClose provided', () => {
    const onClose = vi.fn();
    render(<DocumentViewer {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByLabelText(/close/i);
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render close button when onClose not provided', () => {
    render(<DocumentViewer {...defaultProps} />);
    expect(screen.queryByLabelText(/close viewer/i)).not.toBeInTheDocument();
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  it('shows loading state initially for PDF', () => {
    render(<DocumentViewer {...defaultProps} />);
    expect(screen.getByText(/loading document/i)).toBeInTheDocument();
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('close button has autoFocus', () => {
    const onClose = vi.fn();
    render(<DocumentViewer {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByLabelText(/close viewer/i);
    // React renders autoFocus as lowercase attribute in DOM
    expect(closeBtn.hasAttribute('autofocus') || closeBtn === document.activeElement).toBe(true);
  });

  it('control buttons have aria-labels', () => {
    const onClose = vi.fn();
    render(<DocumentViewer {...defaultProps} onClose={onClose} />);
    expect(screen.getByLabelText(/print document/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/download/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fullscreen/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/close viewer/i)).toBeInTheDocument();
  });

  // ─── Filename Display ────────────────────────────────────────────────────

  it('displays filename in toolbar', () => {
    render(<DocumentViewer {...defaultProps} />);
    expect(screen.getByText('test-document.pdf')).toBeInTheDocument();
  });

  // ─── Custom className ────────────────────────────────────────────────────

  it('applies custom className', () => {
    render(<DocumentViewer {...defaultProps} className="custom-class" />);
    const container = screen.getByTestId('document-viewer');
    expect(container.className).toContain('custom-class');
  });
});
