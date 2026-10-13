/**
 * @vitest-environment jsdom
 *
 * /cases/new — PG-204: loads the active case types and the Case Settings
 * required fields, and forwards caseTypeId / an optional priority.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  mutateAsync: vi.fn(),
  mutationOpts: null as null | {
    onSuccess: (data: { id: string }) => void;
    onError: (error: { message: string }) => void;
  },
  formProps: null as null | Record<string, any>,
  typesState: { isSuccess: true, isError: false } as { isSuccess: boolean; isError: boolean },
  fieldsState: { isSuccess: true, isError: false } as { isSuccess: boolean; isError: boolean },
  refetchTypes: vi.fn(),
  refetchFields: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: h.toast,
}));
vi.mock('@/components/shared', () => ({
  PageHeader: (props: { title: string }) => <h1>{props.title}</h1>,
}));
vi.mock('@/components/cases', () => ({
  CaseForm: (props: Record<string, any>) => {
    h.formProps = props;
    return <form aria-label="case form" />;
  },
}));
vi.mock('@/lib/api', () => ({
  api: {
    caseTypes: {
      listActive: {
        useQuery: () => ({
          ...h.typesState,
          refetch: h.refetchTypes,
          data: h.typesState.isSuccess
            ? [{ id: 'ct-lit', name: 'Litigation', isDefault: true }]
            : undefined,
        }),
      },
    },
    caseSettings: {
      requiredFields: {
        list: {
          useQuery: () => ({
            ...h.fieldsState,
            refetch: h.refetchFields,
            data: h.fieldsState.isSuccess
              ? [
                  { fieldKey: 'description', isRequired: true },
                  { fieldKey: 'jurisdiction', isRequired: false },
                ]
              : undefined,
          }),
        },
      },
    },
    cases: {
      create: {
        useMutation: (opts: NonNullable<typeof h.mutationOpts>) => {
          h.mutationOpts = opts;
          return { mutateAsync: h.mutateAsync, isPending: false };
        },
      },
    },
  },
}));

import NewCasePage from '../page';

beforeEach(() => {
  vi.clearAllMocks();
  h.formProps = null;
  h.typesState = { isSuccess: true, isError: false };
  h.fieldsState = { isSuccess: true, isError: false };
});

describe('/cases/new', () => {
  it('passes the active case types and the module required fields to the form', () => {
    render(<NewCasePage />);
    expect(screen.getByRole('heading', { name: 'Create New Case' })).toBeDefined();
    expect(h.formProps?.caseTypes).toEqual([{ id: 'ct-lit', name: 'Litigation', isDefault: true }]);
    expect(h.formProps?.moduleRequiredFields).toEqual(['description']);
  });

  it('forwards caseTypeId and leaves a blank priority out', async () => {
    render(<NewCasePage />);
    await act(async () => {
      await h.formProps!.onSubmit({
        title: 'Smith v Jones',
        clientId: 'acc-1',
        caseTypeId: 'ct-lit',
      });
    });
    expect(h.mutateAsync).toHaveBeenCalledWith({
      title: 'Smith v Jones',
      clientId: 'acc-1',
      description: undefined,
      priority: undefined,
      deadline: undefined,
      assignedTo: undefined,
      timezone: undefined,
      jurisdiction: undefined,
      caseTypeId: 'ct-lit',
    });
  });

  it('forwards jurisdiction and timezone (required-field check and SLA deadline need them)', async () => {
    render(<NewCasePage />);
    const deadline = new Date('2026-12-01T00:00:00Z');
    await act(async () => {
      await h.formProps!.onSubmit({
        title: 'Smith v Jones',
        clientId: 'acc-1',
        caseTypeId: 'ct-lit',
        priority: 'HIGH',
        description: 'Contract dispute',
        deadline,
        assignedTo: 'user-2',
        timezone: 'America/New_York',
        jurisdiction: 'US-NY',
      });
    });
    expect(h.mutateAsync).toHaveBeenCalledWith({
      title: 'Smith v Jones',
      clientId: 'acc-1',
      description: 'Contract dispute',
      priority: 'HIGH',
      deadline,
      assignedTo: 'user-2',
      timezone: 'America/New_York',
      jurisdiction: 'US-NY',
      caseTypeId: 'ct-lit',
    });
  });

  it('rejects a form without a title or client', async () => {
    render(<NewCasePage />);
    await act(async () => {
      await h.formProps!.onSubmit({ title: 'Untitled' });
    });
    expect(h.mutateAsync).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Validation Error' }));
  });

  it('navigates to the case on success and toasts server errors', () => {
    render(<NewCasePage />);
    act(() => h.mutationOpts!.onSuccess({ id: 'case-1' }));
    expect(h.push).toHaveBeenCalledWith('/cases/case-1');
    act(() => h.mutationOpts!.onError({ message: 'Required fields missing: Jurisdiction' }));
    expect(h.toast).toHaveBeenLastCalledWith(
      expect.objectContaining({ description: 'Required fields missing: Jurisdiction' })
    );
  });

  it('cancels back to the case list', () => {
    render(<NewCasePage />);
    act(() => h.formProps!.onCancel());
    expect(h.push).toHaveBeenCalledWith('/cases');
  });

  it('does not show the form until the case types have loaded (no silent bypass of the default type)', () => {
    h.typesState = { isSuccess: false, isError: false };
    render(<NewCasePage />);
    expect(h.formProps).toBeNull();
    expect(screen.getByText('Loading case types and required fields…')).toBeDefined();
  });

  it('waits for the Case Settings required fields too', () => {
    h.fieldsState = { isSuccess: false, isError: false };
    render(<NewCasePage />);
    expect(h.formProps).toBeNull();
  });

  it('offers a retry instead of the form when loading fails', () => {
    h.typesState = { isSuccess: false, isError: true };
    h.fieldsState = { isSuccess: false, isError: true };
    render(<NewCasePage />);
    expect(h.formProps).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Could not load case types');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetchTypes).toHaveBeenCalled();
    expect(h.refetchFields).toHaveBeenCalled();
  });

  it('retries only the list that failed', () => {
    h.typesState = { isSuccess: false, isError: true };
    render(<NewCasePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetchTypes).toHaveBeenCalled();
    expect(h.refetchFields).not.toHaveBeenCalled();
  });

  it('retries only the required fields when only they failed', () => {
    h.fieldsState = { isSuccess: false, isError: true };
    render(<NewCasePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetchFields).toHaveBeenCalled();
    expect(h.refetchTypes).not.toHaveBeenCalled();
  });
});
