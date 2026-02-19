import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ACLManager } from '../ACLManager';
import { createACLEntryFactory, resetFactories } from './document-test-utils';
import type { AccessControlEntry, AccessLevel } from '../types';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, variant, size, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

// =============================================================================
// Tests
// =============================================================================

describe('ACLManager', () => {
  const createACL = (): AccessControlEntry[] => [
    createACLEntryFactory({
      userId: 'user-1',
      userName: 'Alice Smith',
      email: 'alice@example.com',
      accessLevel: 'ADMIN',
      grantedAt: '2026-01-10T10:00:00Z',
      grantedBy: 'system',
    }),
    createACLEntryFactory({
      userId: 'user-2',
      userName: 'Bob Jones',
      email: 'bob@example.com',
      accessLevel: 'EDIT',
      grantedAt: '2026-01-12T10:00:00Z',
      grantedBy: 'alice@example.com',
    }),
    createACLEntryFactory({
      userId: 'user-3',
      userName: 'Carol Davis',
      email: 'carol@example.com',
      accessLevel: 'VIEW',
      grantedAt: '2026-01-14T10:00:00Z',
      grantedBy: 'alice@example.com',
    }),
  ];

  const defaultProps = {
    documentId: 'doc-1',
    currentACL: createACL(),
    currentUserAccessLevel: 'ADMIN' as AccessLevel,
    onGrantAccess: vi.fn(),
    onRevokeAccess: vi.fn(),
  };

  beforeEach(() => {
    resetFactories();
    vi.clearAllMocks();
  });

  // ─── Rendering ────────────────────────────────────────────────────────────

  it('renders ACL manager component', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByTestId('acl-manager')).toBeInTheDocument();
  });

  it('renders ACL table with user entries', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.getByText('Carol Davis')).toBeInTheDocument();
  });

  it('shows email for each entry', () => {
    render(<ACLManager {...defaultProps} />);
    // alice@example.com also appears in grantedBy column, so use getAllByText
    expect(screen.getAllByText('alice@example.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('carol@example.com')).toBeInTheDocument();
  });

  it('shows access level badges', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    expect(screen.getByText('EDIT')).toBeInTheDocument();
    expect(screen.getByText('VIEW')).toBeInTheDocument();
  });

  it('shows grant access button for ADMIN users', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByTestId('grant-access-button')).toBeInTheDocument();
  });

  it('hides grant access button for non-ADMIN users', () => {
    render(<ACLManager {...defaultProps} currentUserAccessLevel="EDIT" />);
    expect(screen.queryByTestId('grant-access-button')).not.toBeInTheDocument();
  });

  it('shows revoke buttons for ADMIN users', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByTestId('revoke-user-1')).toBeInTheDocument();
    expect(screen.getByTestId('revoke-user-2')).toBeInTheDocument();
  });

  it('hides revoke buttons for non-ADMIN users', () => {
    render(<ACLManager {...defaultProps} currentUserAccessLevel="VIEW" />);
    expect(screen.queryByTestId('revoke-user-1')).not.toBeInTheDocument();
  });

  // ─── Grant Access ─────────────────────────────────────────────────────────

  it('opens grant form on button click', () => {
    render(<ACLManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('grant-access-button'));
    expect(screen.getByTestId('grant-access-form')).toBeInTheDocument();
  });

  it('grant form has user input', () => {
    render(<ACLManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('grant-access-button'));
    expect(screen.getByLabelText(/user id or email/i)).toBeInTheDocument();
  });

  it('grant form has access level dropdown', () => {
    render(<ACLManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('grant-access-button'));
    expect(screen.getByLabelText('Access Level')).toBeInTheDocument();
  });

  it('calls onGrantAccess with userId and level on submit', () => {
    const onGrantAccess = vi.fn();
    render(<ACLManager {...defaultProps} onGrantAccess={onGrantAccess} />);

    fireEvent.click(screen.getByTestId('grant-access-button'));

    const userInput = screen.getByLabelText('User ID or Email');
    fireEvent.change(userInput, { target: { value: 'new-user@example.com' } });

    const levelSelect = screen.getByLabelText('Access Level');
    fireEvent.change(levelSelect, { target: { value: 'EDIT' } });

    const form = screen.getByTestId('grant-access-form');
    fireEvent.submit(form);

    expect(onGrantAccess).toHaveBeenCalledWith('new-user@example.com', 'EDIT');
  });

  it('closes grant form after submit', () => {
    render(<ACLManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('grant-access-button'));

    const userInput = screen.getByLabelText(/user id or email/i);
    fireEvent.change(userInput, { target: { value: 'test@example.com' } });

    const form = screen.getByTestId('grant-access-form');
    fireEvent.submit(form);

    expect(screen.queryByTestId('grant-access-form')).not.toBeInTheDocument();
  });

  it('does not submit with empty user ID', () => {
    const onGrantAccess = vi.fn();
    render(<ACLManager {...defaultProps} onGrantAccess={onGrantAccess} />);

    fireEvent.click(screen.getByTestId('grant-access-button'));

    const form = screen.getByTestId('grant-access-form');
    fireEvent.submit(form);

    expect(onGrantAccess).not.toHaveBeenCalled();
  });

  // ─── Revoke Access ────────────────────────────────────────────────────────

  it('shows confirmation dialog on revoke click', () => {
    render(<ACLManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('revoke-user-2'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Revoke access?')).toBeInTheDocument();
  });

  it('calls onRevokeAccess with userId on confirm', () => {
    const onRevokeAccess = vi.fn();
    render(<ACLManager {...defaultProps} onRevokeAccess={onRevokeAccess} />);

    fireEvent.click(screen.getByTestId('revoke-user-2'));
    fireEvent.click(screen.getByRole('button', { name: /^revoke$/i }));

    expect(onRevokeAccess).toHaveBeenCalledWith('user-2');
  });

  it('does not call onRevokeAccess on cancel', () => {
    const onRevokeAccess = vi.fn();
    render(<ACLManager {...defaultProps} onRevokeAccess={onRevokeAccess} />);

    fireEvent.click(screen.getByTestId('revoke-user-2'));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onRevokeAccess).not.toHaveBeenCalled();
  });

  it('shows user name in revoke confirmation', () => {
    render(<ACLManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('revoke-user-2'));
    // Bob Jones appears in the table row and in the dialog
    expect(screen.getAllByText(/Bob Jones/).length).toBeGreaterThanOrEqual(2);
  });

  // ─── Legal Hold ───────────────────────────────────────────────────────────

  it('shows legal hold warning when isLegalHold is true', () => {
    render(<ACLManager {...defaultProps} isLegalHold />);
    expect(screen.getByTestId('legal-hold-warning')).toBeInTheDocument();
    expect(screen.getByText(/legal hold active/i)).toBeInTheDocument();
  });

  it('disables grant access button under legal hold', () => {
    render(<ACLManager {...defaultProps} isLegalHold />);
    const grantBtn = screen.getByTestId('grant-access-button');
    expect(grantBtn).toBeDisabled();
  });

  it('disables revoke buttons under legal hold', () => {
    render(<ACLManager {...defaultProps} isLegalHold />);
    expect(screen.getByTestId('revoke-user-1')).toBeDisabled();
    expect(screen.getByTestId('revoke-user-2')).toBeDisabled();
  });

  it('shows explanatory text about legal hold', () => {
    render(<ACLManager {...defaultProps} isLegalHold />);
    expect(screen.getByText(/access permissions cannot be modified/i)).toBeInTheDocument();
  });

  it('does not show legal hold warning when isLegalHold is false', () => {
    render(<ACLManager {...defaultProps} isLegalHold={false} />);
    expect(screen.queryByTestId('legal-hold-warning')).not.toBeInTheDocument();
  });

  // ─── Empty State ──────────────────────────────────────────────────────────

  it('renders empty state when ACL is empty and user is not admin', () => {
    render(
      <ACLManager
        {...defaultProps}
        currentACL={[]}
        currentUserAccessLevel="VIEW"
      />
    );
    expect(screen.getByTestId('acl-empty-state')).toBeInTheDocument();
    expect(screen.getByText(/no access entries/i)).toBeInTheDocument();
  });

  it('shows empty table message for admin with empty ACL', () => {
    render(
      <ACLManager
        {...defaultProps}
        currentACL={[]}
        currentUserAccessLevel="ADMIN"
      />
    );
    expect(screen.getByText(/no access entries.*grant access/i)).toBeInTheDocument();
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('table has proper role', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByRole('table', { name: /access control list/i })).toBeInTheDocument();
  });

  it('grant form fields have labels', () => {
    render(<ACLManager {...defaultProps} />);
    fireEvent.click(screen.getByTestId('grant-access-button'));
    expect(screen.getByLabelText('User ID or Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Access Level')).toBeInTheDocument();
  });

  it('access level badges have aria-label', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByLabelText(/access level: admin/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access level: edit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access level: view/i)).toBeInTheDocument();
  });

  it('revoke buttons have aria-label with user name', () => {
    render(<ACLManager {...defaultProps} />);
    expect(screen.getByLabelText(/revoke access for alice smith/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/revoke access for bob jones/i)).toBeInTheDocument();
  });

  it('legal hold alert has role="alert"', () => {
    render(<ACLManager {...defaultProps} isLegalHold />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
