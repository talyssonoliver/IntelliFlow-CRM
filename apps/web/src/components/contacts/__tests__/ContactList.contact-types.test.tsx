// @vitest-environment jsdom
/**
 * PG-205: the contacts table shows each contact's type as a text badge.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ContactTypeOptionDto } from '@intelliflow/validators';
import { ContactList } from '../ContactList';

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  DataTable: ({
    columns,
    data,
  }: Readonly<{
    columns: Array<{
      id?: string;
      accessorKey?: string;
      header?: unknown;
      cell?: (ctx: unknown) => React.ReactNode;
    }>;
    data: Array<{ id: string }>;
  }>) => (
    <table>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.id ?? col.accessorKey}>
              {typeof col.header === 'string' ? col.header : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.id} data-testid={`row-${row.id}`}>
            {columns.map((col) => (
              <td key={col.id ?? col.accessorKey}>{col.cell?.({ row: { original: row } })}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

const TYPES: ContactTypeOptionDto[] = [
  {
    id: 't1',
    key: 'partner',
    name: 'Partner',
    colorToken: 'violet',
    isActive: true,
    isDefault: false,
    isSystem: true,
    requiredFields: [],
  },
];

function contact(id: string, contactType: string | null) {
  return {
    id,
    email: `${id}@example.invalid`,
    firstName: 'Ann',
    lastName: id,
    title: null,
    phone: null,
    department: null,
    accountId: null,
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    contactType,
  };
}

function renderList() {
  render(
    <ContactList
      contacts={[contact('c1', 'partner'), contact('c2', 'legacy_key'), contact('c3', null)]}
      contactTypes={TYPES}
      total={3}
      isLoading={false}
      onRowClick={vi.fn()}
      onDelete={vi.fn()}
      onBulkDelete={vi.fn()}
      onBulkEmail={vi.fn()}
      onBulkExport={vi.fn()}
    />
  );
}

describe('ContactList contact type column (PG-205)', () => {
  it('adds a Type column', () => {
    renderList();
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeInTheDocument();
  });

  it('shows the type name from the tenant types', () => {
    renderList();
    expect(
      within(screen.getByTestId('row-c1')).getByTestId('contact-type-badge')
    ).toHaveTextContent('Partner');
  });

  it('shows a key with no type row as a neutral label', () => {
    renderList();
    const badge = within(screen.getByTestId('row-c2')).getByTestId('contact-type-badge');
    expect(badge).toHaveTextContent('legacy_key');
    expect(badge.className).toContain('bg-slate-200');
  });

  it('shows nothing for a contact without a type', () => {
    renderList();
    expect(within(screen.getByTestId('row-c3')).queryByTestId('contact-type-badge')).toBeNull();
  });
});
