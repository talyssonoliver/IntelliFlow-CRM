import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionHistory } from '../VersionHistory';
import { createVersionFactory, resetFactories } from './document-test-utils';
import type { DocumentVersion } from '../types';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, variant, _size, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

// =============================================================================
// Tests
// =============================================================================

describe('VersionHistory', () => {
  const createVersions = (): DocumentVersion[] => [
    createVersionFactory({
      id: 'ver-1',
      versionNumber: '1.0.0',
      changeType: 'major',
      createdAt: '2026-01-01T10:00:00Z',
      createdBy: 'Alice',
      sizeBytes: 1048576,
      changelog: 'Initial version',
    }),
    createVersionFactory({
      id: 'ver-2',
      versionNumber: '1.1.0',
      changeType: 'minor',
      createdAt: '2026-01-10T10:00:00Z',
      createdBy: 'Bob',
      sizeBytes: 1100000,
      changelog: 'Added section 2',
    }),
    createVersionFactory({
      id: 'ver-3',
      versionNumber: '1.1.1',
      changeType: 'patch',
      createdAt: '2026-01-15T10:00:00Z',
      createdBy: 'Alice',
      sizeBytes: 1100500,
    }),
  ];

  const defaultProps = {
    documentId: 'doc-1',
    versions: createVersions(),
    currentVersionId: 'ver-3',
  };

  beforeEach(() => {
    resetFactories();
    vi.clearAllMocks();
  });

  // ─── Rendering ────────────────────────────────────────────────────────────

  it('renders version history component', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getByTestId('version-history')).toBeInTheDocument();
  });

  it('renders all version items', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getByTestId('version-item-ver-1')).toBeInTheDocument();
    expect(screen.getByTestId('version-item-ver-2')).toBeInTheDocument();
    expect(screen.getByTestId('version-item-ver-3')).toBeInTheDocument();
  });

  it('shows semantic version numbers', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v1.1.0')).toBeInTheDocument();
    expect(screen.getByText('v1.1.1')).toBeInTheDocument();
  });

  it('shows change type badges', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getByText('major')).toBeInTheDocument();
    expect(screen.getByText('minor')).toBeInTheDocument();
    expect(screen.getByText('patch')).toBeInTheDocument();
  });

  it('shows author names', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getAllByText('Alice')).toHaveLength(2);
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows changelog when available', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getByText('Initial version')).toBeInTheDocument();
    expect(screen.getByText('Added section 2')).toBeInTheDocument();
  });

  it('highlights current version', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('shows file sizes', () => {
    render(<VersionHistory {...defaultProps} />);
    // formatFileSize(1048576) = "1.0 MB" - versions may show multiple sizes
    expect(screen.getAllByText('1.0 MB').length).toBeGreaterThanOrEqual(1);
  });

  // ─── Interaction ──────────────────────────────────────────────────────────

  it('calls onVersionSelect when version item clicked', () => {
    const onVersionSelect = vi.fn();
    render(<VersionHistory {...defaultProps} onVersionSelect={onVersionSelect} />);

    fireEvent.click(screen.getByTestId('version-item-ver-1').querySelector('[role="button"]')!);
    expect(onVersionSelect).toHaveBeenCalledWith('ver-1');
  });

  it('shows restore button for non-current versions', () => {
    const onRestoreVersion = vi.fn();
    render(<VersionHistory {...defaultProps} onRestoreVersion={onRestoreVersion} />);

    expect(screen.getByLabelText('Restore version 1.0.0')).toBeInTheDocument();
    expect(screen.getByLabelText('Restore version 1.1.0')).toBeInTheDocument();
  });

  it('hides restore button for current version', () => {
    const onRestoreVersion = vi.fn();
    render(<VersionHistory {...defaultProps} onRestoreVersion={onRestoreVersion} />);

    expect(screen.queryByLabelText('Restore version 1.1.1')).not.toBeInTheDocument();
  });

  it('shows confirmation dialog when restore clicked', () => {
    const onRestoreVersion = vi.fn();
    render(<VersionHistory {...defaultProps} onRestoreVersion={onRestoreVersion} />);

    fireEvent.click(screen.getByLabelText('Restore version 1.0.0'));
    // Dialog heading is visible in the DOM (aria-hidden on backdrop, not dialog content)
    expect(screen.getByText('Restore version?')).toBeInTheDocument();
    // Dialog div is present in the DOM (queryByText finds DOM text regardless of aria-hidden)
    expect(document.querySelector('[role="dialog"]')).toBeInTheDocument();
  });

  it('calls onRestoreVersion after confirmation', () => {
    const onRestoreVersion = vi.fn();
    render(<VersionHistory {...defaultProps} onRestoreVersion={onRestoreVersion} />);

    fireEvent.click(screen.getByLabelText('Restore version 1.0.0'));
    // The dialog is rendered first in DOM (before the timeline ol), so its
    // "Restore" button is the first occurrence in getAllByText('Restore')
    const restoreButtons = screen.getAllByText('Restore');
    const dialogRestoreBtn = restoreButtons[0];
    fireEvent.click(dialogRestoreBtn);
    expect(onRestoreVersion).toHaveBeenCalledWith('ver-1');
  });

  it('does not call onRestoreVersion on cancel', () => {
    const onRestoreVersion = vi.fn();
    render(<VersionHistory {...defaultProps} onRestoreVersion={onRestoreVersion} />);

    fireEvent.click(screen.getByLabelText('Restore version 1.0.0'));
    // Cancel button is only in the dialog
    fireEvent.click(screen.getByText('Cancel'));
    expect(onRestoreVersion).not.toHaveBeenCalled();
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────────

  it('renders empty state when no versions', () => {
    render(<VersionHistory {...defaultProps} versions={[]} />);
    expect(screen.getByTestId('version-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No version history')).toBeInTheDocument();
  });

  it('handles single version (no delta)', () => {
    const singleVersion = [createVersions()[0]];
    render(<VersionHistory {...defaultProps} versions={singleVersion} currentVersionId="ver-1" />);
    expect(screen.getByTestId('version-item-ver-1')).toBeInTheDocument();
  });

  it('handles versions with no changelog', () => {
    const versions = [
      createVersionFactory({
        id: 'ver-no-changelog',
        versionNumber: '2.0.0',
        changeType: 'major',
        createdAt: '2026-02-01T10:00:00Z',
        createdBy: 'Carol',
        sizeBytes: 2048000,
      }),
    ];
    render(
      <VersionHistory documentId="doc-1" versions={versions} currentVersionId="ver-no-changelog" />
    );
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('timeline has list semantics', () => {
    render(<VersionHistory {...defaultProps} />);
    expect(screen.getByRole('list', { name: /version history/i })).toBeInTheDocument();
  });

  it('version items have listitem role', () => {
    render(<VersionHistory {...defaultProps} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
  });

  it('restore buttons have aria-label with version number', () => {
    const onRestoreVersion = vi.fn();
    render(<VersionHistory {...defaultProps} onRestoreVersion={onRestoreVersion} />);
    expect(screen.getByLabelText('Restore version 1.0.0')).toBeInTheDocument();
    expect(screen.getByLabelText('Restore version 1.1.0')).toBeInTheDocument();
  });

  it('version items are keyboard navigable', () => {
    const onVersionSelect = vi.fn();
    render(<VersionHistory {...defaultProps} onVersionSelect={onVersionSelect} />);

    const buttons = screen.getAllByRole('button', { name: /version/i });
    const firstVersionButton = buttons[0];
    fireEvent.keyDown(firstVersionButton, { key: 'Enter' });
    expect(onVersionSelect).toHaveBeenCalled();
  });
});
