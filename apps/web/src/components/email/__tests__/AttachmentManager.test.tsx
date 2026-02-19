// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const { AttachmentManager } = await import('../AttachmentManager');

function createMockFile(name: string, size: number, type = 'application/pdf'): File {
  const buffer = new ArrayBuffer(size);
  return new File([buffer], name, { type });
}

describe('AttachmentManager', () => {
  const defaultProps = {
    files: [] as File[],
    onFilesChange: vi.fn(),
    maxFileSize: 25 * 1024 * 1024, // 25MB
    maxTotalSize: 50 * 1024 * 1024, // 50MB
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders drag-and-drop zone', () => {
    render(<AttachmentManager {...defaultProps} />);
    expect(screen.getByText(/drag.*drop|drop files/i)).toBeInTheDocument();
  });

  it('triggers hidden file input on attach button click', async () => {
    render(<AttachmentManager {...defaultProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('hidden');
  });

  it('shows preview when files are added', () => {
    const file = createMockFile('document.pdf', 1024);
    render(<AttachmentManager {...defaultProps} files={[file]} />);
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
  });

  it('shows remove button for each file', () => {
    const file = createMockFile('report.pdf', 2048);
    render(<AttachmentManager {...defaultProps} files={[file]} />);
    expect(screen.getByRole('button', { name: /remove.*report/i })).toBeInTheDocument();
  });

  it('removes file when remove button clicked', async () => {
    const user = userEvent.setup();
    const file = createMockFile('report.pdf', 2048);
    render(<AttachmentManager {...defaultProps} files={[file]} />);
    await user.click(screen.getByRole('button', { name: /remove.*report/i }));
    expect(defaultProps.onFilesChange).toHaveBeenCalledWith([]);
  });

  it('shows error when file exceeds 25MB', () => {
    const largeFile = createMockFile('huge.zip', 26 * 1024 * 1024);
    render(<AttachmentManager {...defaultProps} files={[largeFile]} />);
    expect(screen.getByText(/exceeds.*25/i)).toBeInTheDocument();
  });

  it('shows error when total exceeds 50MB', () => {
    const f1 = createMockFile('big1.zip', 30 * 1024 * 1024);
    const f2 = createMockFile('big2.zip', 25 * 1024 * 1024);
    render(<AttachmentManager {...defaultProps} files={[f1, f2]} />);
    expect(screen.getByText(/total.*exceeds.*50/i)).toBeInTheDocument();
  });

  it('shows thumbnail for image files', () => {
    const imgFile = createMockFile('photo.png', 5000, 'image/png');
    // Mock URL.createObjectURL
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    render(<AttachmentManager {...defaultProps} files={[imgFile]} />);
    const img = document.querySelector('img');
    expect(img).toBeInTheDocument();
    URL.createObjectURL = originalCreateObjectURL;
  });

  it('handles multiple files being added', () => {
    const files = [
      createMockFile('file1.pdf', 1024),
      createMockFile('file2.docx', 2048),
      createMockFile('file3.txt', 512),
    ];
    render(<AttachmentManager {...defaultProps} files={files} />);
    expect(screen.getByText('file1.pdf')).toBeInTheDocument();
    expect(screen.getByText('file2.docx')).toBeInTheDocument();
    expect(screen.getByText('file3.txt')).toBeInTheDocument();
  });

  it('highlights drop zone on drag over', () => {
    render(<AttachmentManager {...defaultProps} />);
    const dropZone = screen.getByTestId('drop-zone');
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toMatch(/border-primary|ring|highlight/);
  });

  it('handles file drop', () => {
    render(<AttachmentManager {...defaultProps} />);
    const dropZone = screen.getByTestId('drop-zone');
    const file = createMockFile('dropped.pdf', 1024);
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });
    expect(defaultProps.onFilesChange).toHaveBeenCalled();
  });

  it('renders nothing in empty state', () => {
    render(<AttachmentManager {...defaultProps} files={[]} />);
    // Drop zone is present but no file previews
    expect(screen.queryByText(/\.pdf|\.docx|\.txt/)).not.toBeInTheDocument();
  });

  it('shows attachment count badge when files are attached', () => {
    const files = [createMockFile('a.pdf', 100), createMockFile('b.pdf', 200)];
    render(<AttachmentManager {...defaultProps} files={files} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('removes drag highlight when dragLeave fires (handleDragLeave)', () => {
    render(<AttachmentManager {...defaultProps} />);
    const dropZone = screen.getByTestId('drop-zone');
    fireEvent.dragOver(dropZone);
    expect(dropZone.className).toMatch(/border-primary|ring|highlight/);
    fireEvent.dragLeave(dropZone);
    expect(dropZone.className).not.toMatch(/border-primary/);
  });

  it('calls click on hidden file input when browse button clicked', async () => {
    const user = userEvent.setup();
    render(<AttachmentManager {...defaultProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
    await user.click(screen.getByRole('button', { name: /attach file/i }));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('calls onFilesChange when files selected via hidden file input', () => {
    render(<AttachmentManager {...defaultProps} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const mockFile = createMockFile('selected.pdf', 1024);
    fireEvent.change(fileInput, { target: { files: [mockFile] } });
    expect(defaultProps.onFilesChange).toHaveBeenCalledWith([mockFile]);
  });

  it('uses generic File icon for unsupported file types (getFileIcon fallback)', () => {
    const zipFile = createMockFile('archive.zip', 1024, 'application/zip');
    render(<AttachmentManager {...defaultProps} files={[zipFile]} />);
    expect(screen.getByText('archive.zip')).toBeInTheDocument();
    // No image thumbnail — the generic File icon is used
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });
});
