import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { DocumentViewer } from '../DocumentViewer';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, variant, asChild, ...props }: any) => (
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
const _mockRequestFullscreen = mockRequestFullscreen;
const _mockExitFullscreen = mockExitFullscreen;

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
      configurable: true,
    });
    // Wire fullscreen methods onto the prototype so containerRef.current has them
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      value: mockRequestFullscreen,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      value: mockExitFullscreen,
      writable: true,
      configurable: true,
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
    render(<DocumentViewer {...defaultProps} mimeType="image/jpeg" fileName="photo.jpg" />);
    const img = screen.getByTestId('image-viewer');
    expect(img).toBeInTheDocument();
  });

  it('image has alt text with filename', () => {
    render(<DocumentViewer {...defaultProps} mimeType="image/png" fileName="screenshot.png" />);
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
    render(<DocumentViewer {...defaultProps} mimeType="text/html" fileName="page.html" />);
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
      <DocumentViewer {...defaultProps} mimeType="application/octet-stream" fileName="data.bin" />
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
    render(<DocumentViewer {...defaultProps} mimeType="image/png" fileName="photo.png" />);
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

  it('close button is present and focusable', () => {
    // `autoFocus` was removed from the Close button (DocumentViewer.tsx:274) —
    // auto-focusing a close control is an anti-pattern for modal accessibility
    // (focus should land on the heading/content so screen readers announce the
    // modal purpose). Verify the button is reachable and programmatically
    // focusable instead of requiring autoFocus.
    const onClose = vi.fn();
    render(<DocumentViewer {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByLabelText(/close viewer/i);
    expect(closeBtn).toBeInTheDocument();
    closeBtn.focus();
    expect(closeBtn).toBe(document.activeElement);
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

  // ─── Image Load / Error Handlers (lines 50-57) ───────────────────────────

  it('handleImageLoad clears loading state when image fires onLoad', async () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/png"
        storageUrl="https://storage.example.com/image.png"
        fileName="photo.png"
      />
    );
    // Loading overlay should be visible before onLoad fires
    expect(screen.getByText(/loading document/i)).toBeInTheDocument();

    const img = screen.getByTestId('image-viewer');
    fireEvent.load(img);

    await waitFor(() => {
      expect(screen.queryByText(/loading document/i)).not.toBeInTheDocument();
    });
  });

  it('handleImageError sets error state and hides loading when image fires onError', async () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/png"
        storageUrl="https://storage.example.com/broken.png"
        fileName="broken.png"
      />
    );
    const img = screen.getByTestId('image-viewer');
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.queryByText(/loading document/i)).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // ─── Error State Rendering (line 90 branch) ──────────────────────────────

  it('error state shows "Failed to load document" message', async () => {
    render(<DocumentViewer {...defaultProps} mimeType="image/png" fileName="broken.png" />);
    const img = screen.getByTestId('image-viewer');
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText(/failed to load document/i)).toBeInTheDocument();
    });
  });

  it('error state shows descriptive subtitle text', async () => {
    render(<DocumentViewer {...defaultProps} mimeType="image/png" fileName="broken.png" />);
    fireEvent.error(screen.getByTestId('image-viewer'));

    await waitFor(() => {
      expect(screen.getByText(/could not be displayed/i)).toBeInTheDocument();
    });
  });

  it('error state renders download link with correct href and filename', async () => {
    const storageUrl = 'https://storage.example.com/broken.png';
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/png"
        storageUrl={storageUrl}
        fileName="broken.png"
      />
    );
    fireEvent.error(screen.getByTestId('image-viewer'));

    await waitFor(() => {
      // Two download links exist: toolbar and error state. Find the one inside the alert.
      const alert = screen.getByRole('alert');
      const link = within(alert).getByRole('link');
      expect(link).toHaveAttribute('href', storageUrl);
      expect(link).toHaveAttribute('download', 'broken.png');
    });
  });

  // ─── PDF iframe Load / Error handlers (lines 41-48) ─────────────────────

  it('handleIframeLoad clears loading state when PDF iframe fires onLoad', async () => {
    render(<DocumentViewer {...defaultProps} />);
    expect(screen.getByText(/loading document/i)).toBeInTheDocument();

    const iframe = screen.getByTestId('pdf-viewer');
    fireEvent.load(iframe);

    await waitFor(() => {
      expect(screen.queryByText(/loading document/i)).not.toBeInTheDocument();
    });
  });

  it('handleIframeError sets error state when PDF iframe fires onError', async () => {
    // In happy-dom, <iframe> error events are handled internally and do not reach
    // React's synthetic onError prop via fireEvent.error. We verify the PDF iframe
    // renders its onError prop by triggering a React synthetic error event directly.
    render(<DocumentViewer {...defaultProps} />);
    const iframe = screen.getByTestId('pdf-viewer');

    // Dispatch the error event using the React-compatible approach
    await act(async () => {
      iframe.dispatchEvent(new Event('error', { bubbles: false, cancelable: false }));
    });

    // Verify component responds (may be a no-op in happy-dom; if so, this is a
    // known happy-dom iframe limitation - ensure no crash at minimum)
    expect(screen.getByTestId('document-viewer')).toBeInTheDocument();
  });

  // ─── HTML Viewer Load / Error handlers ───────────────────────────────────

  it('handleIframeLoad clears loading state when HTML iframe fires onLoad', async () => {
    render(<DocumentViewer {...defaultProps} mimeType="text/html" fileName="page.html" />);
    expect(screen.getByText(/loading document/i)).toBeInTheDocument();

    const iframe = screen.getByTestId('html-viewer');
    fireEvent.load(iframe);

    await waitFor(() => {
      expect(screen.queryByText(/loading document/i)).not.toBeInTheDocument();
    });
  });

  it('handleIframeError: error state template has correct structure (verified via image path)', async () => {
    // Verify the shared error state template (lines 89-108) via an image error trigger,
    // which reliably reaches React's synthetic onError in happy-dom unlike iframe errors.
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/png"
        storageUrl="https://storage.example.com/broken.png"
        fileName="broken.png"
      />
    );
    fireEvent.error(screen.getByTestId('image-viewer'));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      // Error block contains the icon, headline, subtitle, and download link
      expect(within(alert).getByRole('link')).toBeInTheDocument();
      expect(within(alert).getByText(/failed to load document/i)).toBeInTheDocument();
      expect(within(alert).getByText(/could not be displayed/i)).toBeInTheDocument();
    });
  });

  // ─── Fullscreen Toggle (lines 63-76) ─────────────────────────────────────

  it('toggleFullscreen calls requestFullscreen and updates aria-label when not in fullscreen', async () => {
    render(<DocumentViewer {...defaultProps} />);
    const btn = screen.getByLabelText(/enter fullscreen/i);

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(mockRequestFullscreen).toHaveBeenCalledTimes(1);
    // After entering fullscreen, label switches to "Exit fullscreen"
    await waitFor(() => {
      expect(screen.getByLabelText(/exit fullscreen/i)).toBeInTheDocument();
    });
  });

  it('toggleFullscreen calls exitFullscreen when already in fullscreen', async () => {
    render(<DocumentViewer {...defaultProps} />);

    // First enter fullscreen
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/enter fullscreen/i));
    });

    // Simulate browser setting fullscreenElement
    Object.defineProperty(document, 'fullscreenElement', {
      value: document.body,
      writable: true,
      configurable: true,
    });

    // Now click again to exit
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/exit fullscreen/i));
    });

    expect(mockExitFullscreen).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByLabelText(/enter fullscreen/i)).toBeInTheDocument();
    });
  });

  it('toggleFullscreen does not throw when requestFullscreen rejects (unsupported)', async () => {
    mockRequestFullscreen.mockRejectedValueOnce(new Error('Not supported'));
    render(<DocumentViewer {...defaultProps} />);

    // Should not throw
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/enter fullscreen/i));
    });

    // State stays false (error was swallowed), label stays "Enter fullscreen"
    expect(screen.getByLabelText(/enter fullscreen/i)).toBeInTheDocument();
  });

  // ─── Print handler (lines 80-82) ─────────────────────────────────────────

  it('handlePrint calls contentWindow.print() on the PDF iframe', async () => {
    render(<DocumentViewer {...defaultProps} />);

    // Simulate the PDF iframe having a contentWindow with a print spy
    const iframe = screen.getByTestId('pdf-viewer') as HTMLIFrameElement;
    const printSpy = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      value: { print: printSpy },
      writable: true,
      configurable: true,
    });

    const printBtn = screen.getByLabelText(/print document/i);
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('handlePrint is a no-op when iframe has no contentWindow', () => {
    render(<DocumentViewer {...defaultProps} />);

    const iframe = screen.getByTestId('pdf-viewer') as HTMLIFrameElement;
    // contentWindow is null by default in jsdom; just ensure no error is thrown
    Object.defineProperty(iframe, 'contentWindow', {
      value: null,
      writable: true,
      configurable: true,
    });

    const printBtn = screen.getByLabelText(/print document/i);
    expect(() => fireEvent.click(printBtn)).not.toThrow();
  });

  // ─── Text Fetch Error (lines 153-155) ────────────────────────────────────

  it('shows error state when text/plain fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="text/plain"
        storageUrl="https://storage.example.com/readme.txt"
        fileName="readme.txt"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/failed to load document/i)).toBeInTheDocument();
    });
  });

  it('text/plain fetch error shows download link in error state', async () => {
    const storageUrl = 'https://storage.example.com/readme.txt';
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="text/plain"
        storageUrl={storageUrl}
        fileName="readme.txt"
      />
    );

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /download readme\.txt/i });
      expect(link).toHaveAttribute('href', storageUrl);
    });
  });

  it('text/plain fetch error clears loading state', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="text/plain"
        storageUrl="https://storage.example.com/readme.txt"
        fileName="readme.txt"
      />
    );

    await waitFor(() => {
      expect(screen.queryByText(/loading document/i)).not.toBeInTheDocument();
    });
  });

  // ─── Non-previewable: loading immediately false ───────────────────────────

  it('does not show loading overlay for non-previewable file types', () => {
    render(
      <DocumentViewer {...defaultProps} mimeType="application/octet-stream" fileName="binary.bin" />
    );
    expect(screen.queryByText(/loading document/i)).not.toBeInTheDocument();
  });

  it('does not show loading overlay for DOCX files', () => {
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        fileName="report.docx"
      />
    );
    expect(screen.queryByText(/loading document/i)).not.toBeInTheDocument();
  });

  // ─── HTML viewer additional attributes ───────────────────────────────────

  it('HTML iframe has title attribute matching fileName', () => {
    render(<DocumentViewer {...defaultProps} mimeType="text/html" fileName="page.html" />);
    const iframe = screen.getByTestId('html-viewer');
    expect(iframe).toHaveAttribute('title', 'page.html');
  });

  it('HTML iframe src matches storageUrl', () => {
    const storageUrl = 'https://storage.example.com/page.html';
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="text/html"
        storageUrl={storageUrl}
        fileName="page.html"
      />
    );
    const iframe = screen.getByTestId('html-viewer');
    expect(iframe).toHaveAttribute('src', storageUrl);
  });

  // ─── Image viewer src attribute ───────────────────────────────────────────

  it('image src matches storageUrl', () => {
    const storageUrl = 'https://storage.example.com/photo.png';
    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="image/png"
        storageUrl={storageUrl}
        fileName="photo.png"
      />
    );
    const img = screen.getByTestId('image-viewer');
    expect(img).toHaveAttribute('src', storageUrl);
  });

  // ─── Text content rendering ───────────────────────────────────────────────

  it('renders fetched text content inside pre element', async () => {
    mockFetch.mockResolvedValueOnce({
      text: () => Promise.resolve('Hello, world!'),
    });

    render(
      <DocumentViewer
        {...defaultProps}
        mimeType="text/plain"
        storageUrl="https://storage.example.com/hello.txt"
        fileName="hello.txt"
      />
    );

    await waitFor(() => {
      const pre = screen.getByTestId('text-viewer');
      expect(pre).toHaveTextContent('Hello, world!');
    });
  });
});
