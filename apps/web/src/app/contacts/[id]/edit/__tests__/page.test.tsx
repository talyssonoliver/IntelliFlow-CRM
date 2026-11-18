/**
 * @vitest-environment jsdom
 *
 * PG-205: the Edit Contact page renders the contact type picker (inside ContactForm)
 * and submits an unchanged stored key as is — even when that type is now inactive —
 * so the server's "unchanged key is accepted" rule applies (ADR-080).
 */
import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  record: null as Record<string, unknown> | null,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'c1' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));
vi.mock('@/hooks/useUnsavedChanges', () => ({ useFormUnsavedChanges: () => undefined }));
vi.mock('@/app/contacts/(list)/actions', () => ({
  invalidateContactsCache: vi.fn(async () => undefined),
}));

const client = vi.hoisted(() => {
  const contactTypes = {
    listActive: {
      useQuery: () => ({
        data: [
          {
            id: 't1',
            key: 'customer',
            name: 'Customer',
            colorToken: 'green',
            isActive: true,
            isDefault: false,
            isSystem: true,
            requiredFields: [],
          },
          {
            id: 't2',
            key: 'investor',
            name: 'Investor',
            colorToken: 'teal',
            isActive: false,
            isDefault: false,
            isSystem: true,
            requiredFields: [],
          },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      }),
    },
  };
  return {
    useUtils: () => ({
      contact: {
        getById: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
        stats: { invalidate: vi.fn() },
      },
    }),
    contactTypes,
    contact: {
      getById: { useQuery: () => ({ data: h.record, isLoading: false, error: null }) },
      update: { useMutation: () => ({ mutateAsync: h.mutateAsync, isPending: false }) },
    },
  };
});

// PG-205 (ruling 9): the shared account search is stubbed; it has its own tests.
vi.mock('@/components/tasks/EntitySearchField', () => ({
  EntitySearchField: (props: {
    entityType: string;
    value: string;
    valueName: string;
    onChange: (id: string, name: string) => void;
  }) => (
    <div data-testid={`entity-search-${props.entityType}`}>
      <span>{props.value ? `Selected: ${props.valueName}` : 'No account'}</span>
      <button type="button" onClick={() => props.onChange('acc-2', 'Globex')}>
        Pick Globex
      </button>
      <button type="button" onClick={() => props.onChange('', '')}>
        Clear account
      </button>
    </div>
  ),
}));

vi.mock('@/lib/api', () => ({ api: client }));
vi.mock('@/lib/trpc', () => ({ trpc: client }));

import EditContactPage from '../page';

function goToLastStep() {
  fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
  fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.mutateAsync.mockResolvedValue(undefined);
  h.record = {
    id: 'c1',
    email: 'ann@example.invalid',
    firstName: 'Ann',
    lastName: 'Lee',
    phone: null,
    streetAddress: null,
    city: null,
    zipCode: null,
    company: null,
    title: null,
    department: null,
    linkedInUrl: null,
    contactType: 'investor',
    accountId: 'acc-1',
    account: { id: 'acc-1', name: 'Acme' },
    status: 'ACTIVE',
    tags: [],
    contactNotes: null,
  };
});

describe('Edit Contact page — contact type (PG-205)', () => {
  it('shows the stored inactive type as selected "(inactive)"', () => {
    render(<EditContactPage />);
    goToLastStep();
    const select = screen.getByLabelText('Contact type') as HTMLSelectElement;
    expect(select.value).toBe('investor');
    expect(screen.getByRole('option', { name: 'Investor (inactive)' })).toBeInTheDocument();
  });

  it('an unchanged stored key (even inactive) is not resent', async () => {
    render(<EditContactPage />);
    goToLastStep();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0]).toMatchObject({ id: 'c1' });
    expect(h.mutateAsync.mock.calls[0][0]).not.toHaveProperty('contactType');
  });

  it('submits a newly chosen type', async () => {
    render(<EditContactPage />);
    goToLastStep();
    fireEvent.change(screen.getByLabelText('Contact type'), { target: { value: 'customer' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0].contactType).toBe('customer');
  });

  it('"No type" clears the stored type: sends null, not undefined (codex 1f2a3c92)', async () => {
    render(<EditContactPage />);
    goToLastStep();
    fireEvent.change(screen.getByLabelText('Contact type'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0].contactType).toBeNull();
  });

  it('an untyped contact saved without a type change sends no contactType key (deploy skew)', async () => {
    h.record = { ...h.record, contactType: null };
    render(<EditContactPage />);
    goToLastStep();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0]).not.toHaveProperty('contactType');
  });

  it('an untyped contact given a type sends that key', async () => {
    h.record = { ...h.record, contactType: null };
    render(<EditContactPage />);
    goToLastStep();
    fireEvent.change(screen.getByLabelText('Contact type'), { target: { value: 'customer' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0].contactType).toBe('customer');
  });

  it('shows the linked account and does not resend it when unchanged (ruling 9)', async () => {
    render(<EditContactPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    expect(screen.getByText('Selected: Acme')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0]).not.toHaveProperty('accountId');
  });

  it('sends a newly linked account, and null when the account is cleared (ruling 9)', async () => {
    const { unmount } = render(<EditContactPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Globex' }));
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0].accountId).toBe('acc-2');
    unmount();

    render(<EditContactPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear account' }));
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(2));
    expect(h.mutateAsync.mock.calls[1][0].accountId).toBeNull();
  });
});

describe('Edit Contact page — clearing the last name (MVP-003, #28)', () => {
  it('sends "" when the last name is cleared, so the API saves it empty', async () => {
    h.record = { ...h.record, firstName: 'Unknown', lastName: 'Unknown' };
    render(<EditContactPage />);
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Pilates Living' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: '' } });
    goToLastStep();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    const sent = h.mutateAsync.mock.calls[0][0];
    expect(sent).toHaveProperty('lastName', '');
    expect(sent.firstName).toBe('Pilates Living');
  });

  it('treats a last name of only spaces as cleared', async () => {
    render(<EditContactPage />);
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: '   ' } });
    goToLastStep();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0].lastName).toBe('');
  });

  it('sends "" for every kind of optional field cleared, and leaves untouched ones out', async () => {
    h.record = {
      ...h.record,
      phone: '+447700900123',
      company: 'Pilates Living',
      title: 'Owner',
      department: 'Studio',
      linkedInUrl: 'https://www.linkedin.com/in/example-invalid',
      contactNotes: 'Prefers mornings',
    };
    render(<EditContactPage />);
    // Step 1: the phone. Step 2: plain text, a name-type field and the URL. Step 3: notes.
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Job Title/i), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText(/LinkedIn Profile/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.change(screen.getByLabelText(/^Notes/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    const sent = h.mutateAsync.mock.calls[0][0];
    expect(sent).toMatchObject({
      phone: '',
      company: '',
      title: '',
      linkedInUrl: '',
      contactNotes: '',
    });
    // Department was left as it was: not part of the update.
    expect(sent.department).toBeUndefined();
  });

  it('sends a changed optional field trimmed, and nothing for one left as it was', async () => {
    h.record = { ...h.record, company: 'Acme' };
    render(<EditContactPage />);
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.change(screen.getByLabelText(/Company Name/i), { target: { value: ' Globex ' } });
    fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    const sent = h.mutateAsync.mock.calls[0][0];
    expect(sent.company).toBe('Globex');
    for (const field of ['phone', 'title', 'department', 'linkedInUrl', 'contactNotes']) {
      expect(sent[field]).toBeUndefined();
    }
  });

  it('still sends a last name that is kept, trimmed', async () => {
    render(<EditContactPage />);
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: ' Lima ' } });
    goToLastStep();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.mutateAsync.mock.calls[0][0].lastName).toBe('Lima');
  });
});
