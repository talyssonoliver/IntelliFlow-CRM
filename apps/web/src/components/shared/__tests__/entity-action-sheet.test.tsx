/**
 * EntityActionSheet: the "⋯" menu on the lead, contact, deal, account and ticket pages.
 * Share and Export used to close the sheet and do nothing (#1288, UI-012).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const toast = vi.fn();
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useToast: () => ({ toast }) };
});

vi.mock('@/hooks/use-entity-pin', () => ({
  useEntityPin: () => ({ isPinned: false, isLoading: false, togglePin: vi.fn() }),
}));

const exportToCSV = vi.fn();
vi.mock('@/lib/export/csv', () => ({
  exportToCSV: (...args: unknown[]) => exportToCSV(...args),
}));

import { EntityActionSheet, csvSafe, absoluteEntityUrl } from '../entity-action-sheet';

const entity = {
  type: 'lead' as const,
  id: 'lead-1',
  title: 'Ada Lovelace',
  subtitle: 'Analytical Engines',
  icon: 'person',
  url: '/leads/lead-1',
};

function renderSheet(props: Partial<React.ComponentProps<typeof EntityActionSheet>> = {}) {
  const onOpenChange = vi.fn();
  render(<EntityActionSheet open onOpenChange={onOpenChange} entity={entity} {...props} />);
  return { onOpenChange };
}

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setNavigator(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true, writable: true });
}

beforeEach(() => {
  toast.mockClear();
  exportToCSV.mockClear();
});

afterEach(() => {
  for (const [key, descriptor] of [
    ['share', originalShare],
    ['clipboard', originalClipboard],
  ] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else delete (navigator as unknown as Record<string, unknown>)[key];
  }
});

describe('EntityActionSheet · Share', () => {
  it('opens the device share sheet with the absolute link when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator('share', share);
    const { onOpenChange } = renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: 'Ada Lovelace',
        url: `${window.location.origin}/leads/lead-1`,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it('treats closing the share sheet as no error', async () => {
    setNavigator('share', vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')));
    const writeText = vi.fn();
    setNavigator('clipboard', { writeText });
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => expect(onlyCalls(writeText)).toBe(0));
    expect(toast).not.toHaveBeenCalled();
  });

  it('copies the link and says so when there is no share sheet', async () => {
    setNavigator('share', undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator('clipboard', { writeText });
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const url = `${window.location.origin}/leads/lead-1`;
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
    expect(toast).toHaveBeenCalledWith({ title: 'Link copied', description: url });
  });

  it('falls back to copying when the share sheet fails', async () => {
    setNavigator('share', vi.fn().mockRejectedValue(new Error('not allowed')));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator('clipboard', { writeText });
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });

  it('shows the link in an error toast when copying fails', async () => {
    setNavigator('share', undefined);
    setNavigator('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: "Couldn't copy the link",
        description: `${window.location.origin}/leads/lead-1`,
        variant: 'destructive',
      })
    );
  });
});

describe('EntityActionSheet · Export', () => {
  it('writes the given fields as one CSV row, formula-safe', () => {
    const { onOpenChange } = renderSheet({
      exportFields: { id: 'lead-1', company: '=HYPERLINK("x")', score: 42 },
    });

    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    expect(exportToCSV).toHaveBeenCalledWith(
      [{ id: 'lead-1', company: `'=HYPERLINK("x")`, score: 42 }],
      { filename: 'lead-lead-1' }
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("writes the record's own details when the page gives no fields", () => {
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    expect(exportToCSV).toHaveBeenCalledWith(
      [
        {
          type: 'lead',
          id: 'lead-1',
          name: 'Ada Lovelace',
          subtitle: 'Analytical Engines',
          url: `${window.location.origin}/leads/lead-1`,
        },
      ],
      { filename: 'lead-lead-1' }
    );
  });
});

describe('entity-action-sheet helpers', () => {
  it('csvSafe quotes only values a spreadsheet would run as a formula', () => {
    expect(csvSafe('=1+1')).toBe("'=1+1");
    expect(csvSafe('+44 20')).toBe("'+44 20");
    expect(csvSafe('-5')).toBe("'-5");
    expect(csvSafe('@sum')).toBe("'@sum");
    expect(csvSafe('Acme')).toBe('Acme');
    expect(csvSafe(-5)).toBe(-5);
    expect(csvSafe(null)).toBeNull();
  });

  it('absoluteEntityUrl resolves a path against the current origin', () => {
    expect(absoluteEntityUrl('/deals/d1')).toBe(`${window.location.origin}/deals/d1`);
    expect(absoluteEntityUrl('https://other.example.invalid/x')).toBe(
      'https://other.example.invalid/x'
    );
  });
});

function onlyCalls(fn: ReturnType<typeof vi.fn>): number {
  return fn.mock.calls.length;
}
