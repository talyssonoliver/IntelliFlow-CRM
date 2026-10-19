/**
 * @vitest-environment jsdom
 *
 * PG-199 — one purpose card (AC-002, AC-003, AC-004 pick-time note, AC-016 badge):
 * model select with Default and retired options, temperature, max tokens,
 * fallbacks, ceiling with the below-spend warning, and the locked rag card.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import axe from 'axe-core';
import { MODEL_CONFIG_LIMITS } from '@intelliflow/domain';
import { PurposeCard } from '../PurposeCard';
import { toDraft, type DraftErrors, type PurposeRow } from '../model-config-model';
import { CATALOG, purposeRow } from '../../__tests__/model-config-fixtures';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

function Harness({
  row,
  canManage = true,
  errors,
}: {
  row: PurposeRow;
  canManage?: boolean;
  errors?: DraftErrors;
}) {
  const [draft, setDraft] = React.useState(() => toDraft(row));
  return (
    <>
      <PurposeCard
        row={row}
        draft={draft}
        catalog={CATALOG}
        limits={MODEL_CONFIG_LIMITS}
        canManage={canManage}
        errors={errors}
        onChange={setDraft}
      />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  );
}

const draft = () => JSON.parse(screen.getByTestId('draft').textContent ?? '{}');

describe('PurposeCard — model', () => {
  it('is a labelled region with the purpose title', () => {
    render(<Harness row={purposeRow('scoring')} />);
    expect(screen.getByRole('region', { name: 'Scoring' })).toBeInTheDocument();
  });

  it('offers Default and the purpose models with prices, marking LiteLLM-only ones', () => {
    render(<Harness row={purposeRow('scoring')} />);
    const select = screen.getByLabelText('Scoring model') as HTMLSelectElement;
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels[0]).toBe('Default (varies by feature)');
    expect(labels).toContain('llama-3.1-8b-instant — $0.13 / 1M tokens');
    expect(labels).toContain('mistral-small — $0.80 / 1M tokens (not on OpenRouter)');
    expect(
      screen.getByText(/llama-3\.1-8b-instant or mistral-small, depending on the feature/i)
    ).toBeInTheDocument();
  });

  it('pins a model and returns to Default (null)', () => {
    render(<Harness row={purposeRow('scoring')} />);
    const select = screen.getByLabelText('Scoring model');
    fireEvent.change(select, { target: { value: 'gpt-4o-mini' } });
    expect(draft().modelId).toBe('gpt-4o-mini');
    fireEvent.change(select, { target: { value: '__default__' } });
    expect(draft().modelId).toBeNull();
  });

  it('drops a fallback that becomes the primary', () => {
    render(
      <Harness
        row={purposeRow('scoring', { modelId: 'mistral-small', fallbackModelIds: ['gpt-4o-mini'] })}
      />
    );
    fireEvent.change(screen.getByLabelText('Scoring model'), { target: { value: 'gpt-4o-mini' } });
    expect(draft()).toMatchObject({ modelId: 'gpt-4o-mini', fallbackModelIds: [] });
  });

  it('shows a retired pin as a disabled "(retired)" option', () => {
    render(<Harness row={purposeRow('scoring', { modelId: 'old-model', retired: true })} />);
    const option = screen.getByRole('option', { name: 'old-model (retired)' }) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    expect((screen.getByLabelText('Scoring model') as HTMLSelectElement).value).toBe('old-model');
    expect(screen.getByText(/no longer offered/i)).toBeInTheDocument();
  });

  it('notes a cheaper pick without a modal; the confirm comes at save', () => {
    render(<Harness row={purposeRow('scoring', { modelId: 'gpt-4o-mini' })} />);
    expect(screen.queryByRole('note', { name: /cheaper model/i })).toBeNull();
    fireEvent.change(screen.getByLabelText('Scoring model'), {
      target: { value: 'llama-3.1-8b-instant' },
    });
    const note = screen.getByRole('note', { name: /cheaper model/i });
    expect(note).toHaveTextContent(/costs less per token/i);
    expect(note).toHaveTextContent(/confirm when you save/i);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('PurposeCard — parameters', () => {
  it('keeps the default temperature until a custom one is switched on', () => {
    render(<Harness row={purposeRow('email')} />);
    const slider = screen.getByLabelText('Email temperature') as HTMLInputElement;
    expect(slider.disabled).toBe(true);
    expect(screen.getByTestId('email-temperature-value')).toHaveTextContent('Default');

    fireEvent.click(screen.getByLabelText('Custom temperature'));
    expect(draft().temperature).toBe(0.7);
    expect(slider.disabled).toBe(false);
    fireEvent.change(slider, { target: { value: '1.2' } });
    expect(draft().temperature).toBe(1.2);
    expect(screen.getByTestId('email-temperature-value')).toHaveTextContent('1.2');

    fireEvent.click(screen.getByLabelText('Custom temperature'));
    expect(draft().temperature).toBeNull();
  });

  it('edits max tokens as text and shows a field error with aria-invalid', () => {
    render(<Harness row={purposeRow('email')} errors={{ maxTokens: 'Too big' }} />);
    const input = screen.getByLabelText('Max tokens');
    fireEvent.change(input, { target: { value: '900' } });
    expect(draft().maxTokens).toBe('900');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    // Error and help are both read, so the constraint is not lost.
    expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual([
      'email-max-tokens-help',
      screen.getByText('Too big').id,
    ]);
  });

  it('edits the fallback chain', () => {
    render(<Harness row={purposeRow('qualification')} />);
    fireEvent.change(screen.getByLabelText('Add a qualification fallback model'), {
      target: { value: 'gpt-4o' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add fallback' }));
    expect(draft().fallbackModelIds).toEqual(['gpt-4o']);
  });

  it('never offers the effective primary as a fallback', () => {
    render(<Harness row={purposeRow('scoring')} />);
    const add = screen.getByLabelText('Add a scoring fallback model');
    const values = within(add)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['gpt-4o-mini']);
  });
});

describe('PurposeCard — ceiling and spend', () => {
  it('explains empty and zero and shows month-to-date spend', () => {
    render(<Harness row={purposeRow('scoring', { spentCents: 75 })} />);
    expect(screen.getByText(/leave empty for no ceiling/i)).toHaveTextContent(/\$0 blocks AI/);
    expect(screen.getByText('Spent this month: $0.75')).toBeInTheDocument();
  });

  it('says when spend is unavailable', () => {
    render(<Harness row={purposeRow('scoring', { spentCents: null })} />);
    expect(screen.getByText('Spent this month: unavailable')).toBeInTheDocument();
  });

  it('warns that email drafts stop on save when the ceiling is already reached', () => {
    render(<Harness row={purposeRow('email', { spentCents: 75 })} />);
    fireEvent.change(screen.getByLabelText('Monthly ceiling (USD)'), {
      target: { value: '0.50' },
    });
    expect(draft().ceilingUsd).toBe('0.50');
    expect(screen.getByRole('note', { name: /ceiling already reached/i })).toHaveTextContent(
      /email drafts stop when you save/i
    );
  });

  it('warns other purposes that AI stops on save', () => {
    render(<Harness row={purposeRow('scoring', { spentCents: 75 })} />);
    fireEvent.change(screen.getByLabelText('Monthly ceiling (USD)'), { target: { value: '0' } });
    expect(screen.getByRole('note', { name: /ceiling already reached/i })).toHaveTextContent(
      /AI for scoring stops when you save/i
    );
  });

  it('shows the blocked badge when the ceiling is reached', () => {
    render(<Harness row={purposeRow('email', { blocked: true, monthlyCostCeilingCents: 0 })} />);
    expect(screen.getByText('Monthly AI ceiling reached for email')).toBeInTheDocument();
  });
});

describe('PurposeCard — rag and view-only', () => {
  it('locks the rag model and leaves only its ceiling editable', () => {
    render(<Harness row={purposeRow('rag')} />);
    expect(screen.queryByLabelText('Rag model')).toBeNull();
    expect(screen.queryByLabelText('Rag temperature')).toBeNull();
    expect(screen.queryByLabelText('Max tokens')).toBeNull();
    expect(screen.getByText(/platform-managed embedding model/i)).toBeInTheDocument();
    expect(screen.getByText('nomic-embed-text')).toBeInTheDocument();
    expect(screen.getByText(/768 dimensions/)).toBeInTheDocument();
    expect(screen.getByText(/embedding spend is estimated/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Monthly ceiling (USD)'), { target: { value: '5' } });
    expect(draft().ceilingUsd).toBe('5');
  });

  it('ties model and temperature errors to their controls and voices the default value', () => {
    render(
      <Harness
        row={purposeRow('scoring')}
        errors={{ modelId: 'Not available', temperature: 'Too hot' }}
      />
    );
    const select = screen.getByLabelText('Scoring model');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select.getAttribute('aria-describedby')).toContain(screen.getByText('Not available').id);
    const range = screen.getByLabelText('Scoring temperature');
    expect(range).toHaveAttribute('aria-invalid', 'true');
    expect(range).toHaveAttribute('aria-describedby', screen.getByText('Too hot').id);
    expect(range).toHaveAttribute('aria-valuetext', 'Default');
  });

  it('announces notes that appear after a pick through a mounted live region', () => {
    render(<Harness row={purposeRow('scoring', { modelId: 'gpt-4o-mini' })} />);
    fireEvent.change(screen.getByLabelText('Scoring model'), {
      target: { value: 'llama-3.1-8b-instant' },
    });
    expect(screen.getByRole('note', { name: /cheaper model/i }).closest('output')).not.toBeNull();
  });

  it('disables every control for a reader', () => {
    render(<Harness row={purposeRow('scoring')} canManage={false} />);
    expect((screen.getByLabelText('Scoring model') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText('Max tokens') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Monthly ceiling (USD)') as HTMLInputElement).disabled).toBe(
      true
    );
    expect((screen.getByLabelText('Custom temperature') as HTMLInputElement).disabled).toBe(true);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Harness row={purposeRow('scoring', { modelId: 'gpt-4o-mini', temperature: 0.3 })} />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
