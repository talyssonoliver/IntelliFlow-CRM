/**
 * @vitest-environment jsdom
 *
 * /cases/new — PG-204: loads the active case types and the Case Settings
 * required fields, and forwards caseTypeId / an optional priority.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  mutateAsync: vi.fn(),
  mutationOpts: null as null | {
    onSuccess: (data: { id: string }) => void;
    onError: (error: { message: string }) => void;
  },
  formProps: null as null | Record<string, any>,
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
        useQuery: () => ({ data: [{ id: 'ct-lit', name: 'Litigation', isDefault: true }] }),
      },
    },
    caseSettings: {
      requiredFields: {
        list: {
          useQuery: () => ({
            data: [
              { fieldKey: 'description', isRequired: true },
              { fieldKey: 'jurisdiction', isRequired: false },
            ],
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
});
