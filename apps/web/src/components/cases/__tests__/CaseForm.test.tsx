/**
 * @vitest-environment jsdom
 *
 * CaseForm — PG-204: case type picker (replaces the unpersisted category list),
 * "Use default" priority, defaults hint, required-field markers, account picker.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { CaseTypeOptionDto } from '@intelliflow/validators';
import axe from 'axe-core';

const h = vi.hoisted(() => ({
  accountQueryInput: null as null | Record<string, unknown>,
  accounts: [] as Array<{ id: string; name: string; industry: string | null }>,
}));

vi.mock('@/lib/api', () => ({
  api: {
    cases: {
      assignees: { useQuery: () => ({ data: [], isLoading: false }) },
    },
    account: {
      list: {
        useQuery: (input: Record<string, unknown>) => {
          h.accountQueryInput = input;
          return { data: { accounts: h.accounts }, isLoading: false };
        },
      },
    },
  },
}));
vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));
vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: () => <select aria-label="Deadline timezone" />,
}));

import { CaseForm } from '../CaseForm';

const LITIGATION: CaseTypeOptionDto = {
  id: 'ct-lit',
  name: 'Litigation',
  category: 'Disputes',
  colorToken: 'blue',
  defaultPriority: 'HIGH',
  defaultSlaDays: 14,
  requiredFields: ['jurisdiction'],
  isDefault: true,
};
const ADVISORY: CaseTypeOptionDto = {
  id: 'ct-adv',
  name: 'Advisory',
  category: null,
  colorToken: 'teal',
  defaultPriority: null,
  defaultSlaDays: null,
  requiredFields: ['deadline'],
  isDefault: false,
};

function renderForm(props: Partial<React.ComponentProps<typeof CaseForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <CaseForm
      mode="create"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      isSubmitting={false}
      caseTypes={[LITIGATION, ADVISORY]}
      moduleRequiredFields={['description']}
      {...props}
    />
  );
  return { onSubmit };
}

async function pickClient() {
  fireEvent.change(screen.getByLabelText(/Link to Client\/Account/), {
    target: { value: 'Ac' },
  });
  const option = await screen.findByRole('button', { name: /Acme Ltd/ });
  fireEvent.click(option);
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create Case' }));
  });
}

beforeEach(() => {
  h.accounts = [{ id: 'acc-1', name: 'Acme Ltd', industry: 'Retail' }];
});

describe('CaseForm — case types (PG-204)', () => {
  it('replaces the category list with a case type picker and preselects the default type', () => {
    renderForm();
    expect(screen.queryByLabelText('Category')).toBeNull();
    expect(screen.queryByText('Technical Issue')).toBeNull();
    const picker = screen.getByLabelText('Case type') as HTMLSelectElement;
    expect(picker.value).toBe('ct-lit');
    expect([...picker.options].map((o) => o.textContent)).toEqual([
      'None',
      'Litigation (Disputes)',
      'Advisory',
    ]);
    expect(picker.getAttribute('aria-describedby')).toBe('case-type-hint');
  });

  it('describes the type defaults in a status hint linked to both selects', () => {
    renderForm();
    const hint = screen.getByRole('status');
    expect(hint.id).toBe('case-type-hint');
    expect(hint.textContent).toBe('Type default: High priority · due in 14 days');
    expect(screen.getByLabelText('Priority').getAttribute('aria-describedby')).toBe(
      'case-type-hint'
    );
    expect((screen.getByLabelText('Priority') as HTMLSelectElement).options[0].textContent).toBe(
      'Use default (High)'
    );
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: '' } });
    expect(hint.textContent).toMatch(/No case type/);
  });

  it('does not override a type the user chose before the list loaded', () => {
    const { rerender } = render(
      <CaseForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} isSubmitting={false} />
    );
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: '' } });
    rerender(
      <CaseForm
        mode="create"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
        caseTypes={[LITIGATION]}
      />
    );
    expect((screen.getByLabelText('Case type') as HTMLSelectElement).value).toBe('');
  });

  it("marks the type's required fields (type set wins over the module's)", () => {
    renderForm();
    const jurisdiction = screen.getByLabelText(/Jurisdiction/);
    expect(jurisdiction.getAttribute('aria-required')).toBe('true');
    expect(screen.getByLabelText(/Description/).getAttribute('aria-required')).toBeNull();
    // Advisory requires a deadline and has no SLA.
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ct-adv' } });
    expect(screen.getByLabelText(/Deadline \/ Due Date/).getAttribute('aria-required')).toBe(
      'true'
    );
    // No type → the module's required description.
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: '' } });
    expect(screen.getByLabelText(/Description/).getAttribute('aria-required')).toBe('true');
  });

  it('blocks submit until required fields are filled, with alerts', async () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 'Smith v Jones' } });
    await pickClient();
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Jurisdiction is required for this case').getAttribute('role')).toBe(
      'alert'
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(screen.getByLabelText(/Jurisdiction/));

    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: 'ct-adv' } });
    await submit();
    expect(screen.getByText('A deadline is required for this case')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: '' } });
    await submit();
    expect(screen.getByText('Description is required for this case')).toBeDefined();
  });

  it('submits the type and omits a blank priority so the server default applies', async () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 'Smith v Jones' } });
    await pickClient();
    fireEvent.change(screen.getByLabelText(/Jurisdiction/), { target: { value: 'UK-England' } });
    await submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0];
    expect(data).toMatchObject({
      title: 'Smith v Jones',
      clientId: 'acc-1',
      caseTypeId: 'ct-lit',
      jurisdiction: 'UK-England',
    });
    expect(data).not.toHaveProperty('priority');
    expect(data).not.toHaveProperty('category');
  });

  it('submits an explicit priority and no type when None is picked', async () => {
    const { onSubmit } = renderForm({ moduleRequiredFields: [] });
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 'Smith v Jones' } });
    await pickClient();
    fireEvent.change(screen.getByLabelText('Case type'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'URGENT' } });
    await submit();
    const data = onSubmit.mock.calls[0][0];
    expect(data.priority).toBe('URGENT');
    expect(data).not.toHaveProperty('caseTypeId');
  });

  // codex deadline-timezone-mismatch: new Date('2026-12-01') is UTC midnight, the evening
  // before in New York. The form keeps the calendar date; the API places it in the zone.
  it.each(['America/New_York', 'Asia/Tokyo'])(
    'submits a typed deadline as the calendar date with its timezone (%s)',
    async (timezone) => {
      const { onSubmit } = renderForm({
        moduleRequiredFields: [],
        initialData: { timezone },
      });
      fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 'Smith v Jones' } });
      await pickClient();
      fireEvent.change(screen.getByLabelText('Case type'), { target: { value: '' } });
      fireEvent.change(screen.getByLabelText(/Deadline \/ Due Date/), {
        target: { value: '2026-12-01' },
      });
      await submit();
      const data = onSubmit.mock.calls[0][0];
      expect(data.deadlineDate).toBe('2026-12-01');
      expect(data.timezone).toBe(timezone);
      expect(data).not.toHaveProperty('deadline');
    }
  );

  it('searches accounts (a case client is an Account) and links to the new account form', async () => {
    renderForm();
    await pickClient();
    expect(h.accountQueryInput).toEqual({ search: 'Ac', limit: 5, page: 1 });
    expect(screen.getByText('Acme Ltd')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear client selection' }));
    expect(screen.getByRole('link', { name: 'create a new one' }).getAttribute('href')).toBe(
      '/accounts/new'
    );
  });

  it('marks Subject and Client as required without a read-aloud asterisk', () => {
    renderForm();
    for (const id of ['subject', 'clientSearch']) {
      const input = document.getElementById(id) as HTMLInputElement;
      expect(input.getAttribute('aria-required')).toBe('true');
      const label = document.querySelector(`label[for="${id}"]`) as HTMLLabelElement;
      expect(label.querySelector('.sr-only')?.textContent).toBe(' (required)');
      for (const star of Array.from(label.querySelectorAll('span')).filter((el) =>
        el.textContent?.includes('*')
      )) {
        expect(star.getAttribute('aria-hidden')).toBe('true');
      }
    }
  });

  it('announces a missing client as an alert', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: 'Smith v Jones' } });
    await submit();
    expect(screen.getByText('Please search and select a client').getAttribute('role')).toBe(
      'alert'
    );
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <CaseForm
        mode="create"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
        caseTypes={[LITIGATION, ADVISORY]}
        moduleRequiredFields={['description']}
      />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('works without any case types', () => {
    render(<CaseForm mode="create" onSubmit={vi.fn()} onCancel={vi.fn()} isSubmitting={false} />);
    const picker = screen.getByLabelText('Case type') as HTMLSelectElement;
    expect(picker.options).toHaveLength(1);
    expect((screen.getByLabelText('Priority') as HTMLSelectElement).options[0].textContent).toBe(
      'Use default'
    );
  });
});
