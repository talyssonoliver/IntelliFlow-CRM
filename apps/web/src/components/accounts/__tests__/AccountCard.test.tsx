import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { createAccountColumns, type AccountRow, type AccountRowHandlers } from '../AccountCard';

// PG-196: tier colours/labels come from the tenant configuration via
// useAccountTiers; here it resolves through the built-in default tiers.
vi.mock('@/hooks/useAccountTiers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAccountTiers')>();
  return {
    ...actual,
    useAccountTiers: () =>
      actual.buildAccountTiersResult(undefined, { isLoading: false, isError: false }),
  };
});

const noop: AccountRowHandlers = {
  onView: () => {},
  onEdit: () => {},
  onCreateDeal: () => {},
  onDelete: () => {},
};

/** Render the name and revenue cells through a real table, as the list page does. */
function ColumnsHarness({ row }: Readonly<{ row: AccountRow }>) {
  const table = useReactTable({
    data: [row],
    columns: createAccountColumns(noop),
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <>
      {table
        .getRowModel()
        .rows[0].getVisibleCells()
        .filter((cell) => cell.column.id === 'name' || cell.column.id === 'revenue')
        .map((cell) => (
          <div key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
        ))}
    </>
  );
}

function renderCell(_column: 'name' | 'revenue', revenue: AccountRow['revenue']) {
  const row: AccountRow = {
    id: 'acc-1',
    name: 'Acme Corp',
    industry: null,
    revenue,
    employees: null,
    website: null,
    description: null,
    createdAt: new Date(),
  };
  return render(<ColumnsHarness row={row} />);
}

describe('tier display in account columns (PG-196 default tiers)', () => {
  it.each([
    [10_000_000, 'Enterprise', 'bg-purple-500'],
    [9_999_999, 'Mid-Market', 'bg-blue-500'],
    [1_000_000, 'Mid-Market', 'bg-blue-500'],
    [100_000, 'SMB', 'bg-green-500'],
    [99_999, 'Startup', 'bg-yellow-500'],
    [0, 'Startup', 'bg-yellow-500'],
    ['250000.00', 'SMB', 'bg-green-500'],
    [null, 'Unknown', 'bg-slate-400'],
  ])('revenue %s shows the %s tier dot', (revenue, label, dotClass) => {
    renderCell('revenue', revenue);
    expect(screen.getByText(`${label} tier`)).toBeInTheDocument();
    expect(screen.getByTestId('tier-dot').className).toContain(dotClass);
  });

  it('tints the name avatar with the tier colour', () => {
    renderCell('name', 20_000_000);
    expect(screen.getByText('AC').className).toContain('bg-purple-100');
  });
});

describe('createAccountColumns', () => {
  const handlers: AccountRowHandlers = noop;

  it('should return an array of column definitions', () => {
    const columns = createAccountColumns(handlers);
    expect(Array.isArray(columns)).toBe(true);
    expect(columns.length).toBeGreaterThan(0);
  });

  it('should include name, industry, revenue, employees, owner, createdAt, and actions columns', () => {
    const columns = createAccountColumns(handlers);
    const ids = columns.map((c) => (c as any).accessorKey || (c as any).id);

    expect(ids).toContain('name');
    expect(ids).toContain('industry');
    expect(ids).toContain('revenue');
    expect(ids).toContain('employees');
    expect(ids).toContain('owner');
    expect(ids).toContain('createdAt');
    expect(ids).toContain('actions');
  });

  it('should have 7 columns total', () => {
    const columns = createAccountColumns(handlers);
    expect(columns).toHaveLength(7);
  });
});
