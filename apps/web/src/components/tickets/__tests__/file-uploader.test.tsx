import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileUploader } from '../file-uploader';

function createMockFile(name: string, size: number, type: string): File {
  const file = new File(['x'.repeat(Math.min(size, 100))], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('FileUploader', () => {
  const defaultProps = {
    files: [] as File[],
    onChange: vi.fn(),
  };

  it('renders drop zone with role="region" and aria-label', () => {
    render(<FileUploader {...defaultProps} />);
    const dropZone = screen.getByRole('region', { name: 'File upload area' });
    expect(dropZone).toBeInTheDocument();
  });

  it('renders browse button that is keyboard-accessible', () => {
    render(<FileUploader {...defaultProps} />);
    const browseButton = screen.getByRole('button', { name: /browse/i });
    expect(browseButton).toBeInTheDocument();
    expect(browseButton.tagName).toBe('BUTTON');
  });

  it('click browse button triggers hidden file input', () => {
    render(<FileUploader {...defaultProps} />);
    const browseButton = screen.getByRole('button', { name: /browse/i });
    // The hidden input should exist
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    // Clicking browse should trigger the input click
    const clickSpy = vi.spyOn(fileInput as HTMLInputElement, 'click');
    fireEvent.click(browseButton);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('drag-and-drop adds files to the list', () => {
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} onChange={onChange} />);
    const dropZone = screen.getByRole('region', { name: 'File upload area' });

    const file = createMockFile('test.pdf', 1024, 'application/pdf');
    const dataTransfer = { files: [file] };

    fireEvent.dragOver(dropZone);
    fireEvent.drop(dropZone, { dataTransfer });

    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it('displays filename, human-readable size, and remove button per file', () => {
    const file = createMockFile('document.pdf', 1536, 'application/pdf');
    render(<FileUploader {...defaultProps} files={[file]} />);

    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove document.pdf' })).toBeInTheDocument();
  });

  it('remove button removes the file from the list', () => {
    const file = createMockFile('test.txt', 500, 'text/plain');
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} files={[file]} onChange={onChange} />);

    const removeBtn = screen.getByRole('button', { name: 'Remove test.txt' });
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('rejects files exceeding max size with error message', () => {
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} onChange={onChange} maxSizeMB={10} />);
    const dropZone = screen.getByRole('region', { name: 'File upload area' });

    const largeFile = createMockFile('huge.pdf', 11 * 1024 * 1024, 'application/pdf');
    fireEvent.drop(dropZone, { dataTransfer: { files: [largeFile] } });

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/exceeds 10MB/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects when adding more than max files', () => {
    const existingFiles = Array.from({ length: 5 }, (_, i) =>
      createMockFile(`file${i}.txt`, 100, 'text/plain'),
    );
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} files={existingFiles} onChange={onChange} maxFiles={5} />);
    const dropZone = screen.getByRole('region', { name: 'File upload area' });

    const newFile = createMockFile('extra.txt', 100, 'text/plain');
    fireEvent.drop(dropZone, { dataTransfer: { files: [newFile] } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Maximum 5 files/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects invalid file types', () => {
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} onChange={onChange} />);
    const dropZone = screen.getByRole('region', { name: 'File upload area' });

    const exeFile = createMockFile('virus.exe', 100, 'application/x-msdownload');
    fireEvent.drop(dropZone, { dataTransfer: { files: [exeFile] } });

    expect(screen.getByRole('alert')).toHaveTextContent(/unsupported file type/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts valid file types', () => {
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} onChange={onChange} />);
    const dropZone = screen.getByRole('region', { name: 'File upload area' });

    const pdfFile = createMockFile('doc.pdf', 1024, 'application/pdf');
    fireEvent.drop(dropZone, { dataTransfer: { files: [pdfFile] } });

    expect(onChange).toHaveBeenCalledWith([pdfFile]);
  });

  it('disabled state prevents file selection', () => {
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} onChange={onChange} disabled />);
    const dropZone = screen.getByRole('region', { name: 'File upload area' });

    const file = createMockFile('test.pdf', 1024, 'application/pdf');
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('fires onChange callback with updated file list via input', () => {
    const onChange = vi.fn();
    render(<FileUploader {...defaultProps} onChange={onChange} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    const file = createMockFile('selected.png', 2048, 'image/png');
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onChange).toHaveBeenCalledWith([file]);
  });
});
