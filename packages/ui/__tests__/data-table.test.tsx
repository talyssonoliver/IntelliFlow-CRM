// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataTable } from '../src/components/data-table';
import { ColumnDef } from '@tanstack/react-table';
import userEvent from '@testing-library/user-event';

type TestData = {
  id: string;
  name: string;
  email: string;
  role: string;
};

// Helper to create test data
const createTestData = (count: number): TestData[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `${i + 1}`,
    name: `User ${i + 1}`,
    email: `user${i + 1}@example.com`,
    role: i % 2 === 0 ? 'Admin' : 'User',
  }));
};

// Basic columns without sorting or selection
const basicColumns: ColumnDef<TestData>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
];

// Columns with custom rendering
const columnsWithCustomRender: ColumnDef<TestData>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span data-testid="custom-id">{row.getValue('id')}</span>,
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
];

// Columns with sorting
const sortableColumns: ColumnDef<TestData>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
  },
  {
    accessorKey: 'name',
    header: ({ column }) => {
      return (
        <button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          data-testid="sort-name"
        >
          Name
        </button>
      );
    },
  },
];

// Columns with row selection
const selectableColumns: ColumnDef<TestData>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all"
        data-testid="select-all"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        aria-label={`Select row ${row.id}`}
        data-testid={`select-row-${row.id}`}
      />
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
];

describe('DataTable', () => {
  describe('Rendering', () => {
    it('should render table with columns and data', () => {
      const testData = createTestData(3);
      render(<DataTable columns={basicColumns} data={testData} />);

      // Check headers are rendered
      expect(screen.getByText('ID')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();

      // Check data rows are rendered
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      expect(screen.getByText('User 2')).toBeInTheDocument();
      expect(screen.getByText('user2@example.com')).toBeInTheDocument();
      expect(screen.getByText('User 3')).toBeInTheDocument();
      expect(screen.getByText('user3@example.com')).toBeInTheDocument();
    });

    it('should render all columns in header', () => {
      const testData = createTestData(1);
      render(<DataTable columns={basicColumns} data={testData} />);

      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(4);
      expect(headers[0]).toHaveTextContent('ID');
      expect(headers[1]).toHaveTextContent('Name');
      expect(headers[2]).toHaveTextContent('Email');
      expect(headers[3]).toHaveTextContent('Role');
    });

    it('should render correct number of rows', () => {
      const testData = createTestData(5);
      render(<DataTable columns={basicColumns} data={testData} />);

      const rows = screen.getAllByRole('row');
      // +1 for header row
      expect(rows).toHaveLength(6);
    });

    it('should render custom cell components', () => {
      const testData = createTestData(2);
      render(<DataTable columns={columnsWithCustomRender} data={testData} />);

      const customCells = screen.getAllByTestId('custom-id');
      expect(customCells).toHaveLength(2);
      expect(customCells[0]).toHaveTextContent('1');
      expect(customCells[1]).toHaveTextContent('2');
    });
  });

  describe('Empty State', () => {
    it('should show "No results" when data is empty', () => {
      render(<DataTable columns={basicColumns} data={[]} />);

      expect(screen.getByText('No results.')).toBeInTheDocument();
    });

    it('should show empty state with correct column span', () => {
      render(<DataTable columns={basicColumns} data={[]} />);

      const emptyCell = screen.getByText('No results.').closest('td');
      expect(emptyCell).toHaveAttribute('colspan', '4');
    });

    it('should not show data rows when empty', () => {
      render(<DataTable columns={basicColumns} data={[]} />);

      const rows = screen.getAllByRole('row');
      // Only header row + empty state row
      expect(rows).toHaveLength(2);
    });
  });

  describe('Pagination', () => {
    it('should render pagination controls', () => {
      const testData = createTestData(15);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    });

    it('should disable Previous button on first page', () => {
      const testData = createTestData(15);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const previousButton = screen.getByRole('button', { name: 'Previous' });
      expect(previousButton).toBeDisabled();
    });

    it('should enable Next button when more pages available', () => {
      const testData = createTestData(15);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const nextButton = screen.getByRole('button', { name: 'Next' });
      expect(nextButton).not.toBeDisabled();
    });

    it('should disable Next button on last page', () => {
      const testData = createTestData(5);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const nextButton = screen.getByRole('button', { name: 'Next' });
      expect(nextButton).toBeDisabled();
    });

    it('should navigate to next page when Next clicked', async () => {
      const testData = createTestData(15);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      // First page should show User 1-10
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('User 10')).toBeInTheDocument();
      expect(screen.queryByText('User 11')).not.toBeInTheDocument();

      // Click Next
      const nextButton = screen.getByRole('button', { name: 'Next' });
      await userEvent.click(nextButton);

      // Second page should show User 11-15
      expect(screen.queryByText('User 1')).not.toBeInTheDocument();
      expect(screen.getByText('User 11')).toBeInTheDocument();
      expect(screen.getByText('User 15')).toBeInTheDocument();
    });

    it('should navigate to previous page when Previous clicked', async () => {
      const testData = createTestData(15);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      // Go to second page
      const nextButton = screen.getByRole('button', { name: 'Next' });
      await userEvent.click(nextButton);

      expect(screen.getByText('User 11')).toBeInTheDocument();

      // Go back to first page
      const previousButton = screen.getByRole('button', { name: 'Previous' });
      await userEvent.click(previousButton);

      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.queryByText('User 11')).not.toBeInTheDocument();
    });

    it('should show correct number of rows per page', () => {
      const testData = createTestData(25);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const rows = screen.getAllByRole('row');
      // 10 data rows + 1 header row
      expect(rows).toHaveLength(11);
    });

    it('should respect custom pageSize prop', () => {
      const testData = createTestData(25);
      render(<DataTable columns={basicColumns} data={testData} pageSize={5} />);

      const rows = screen.getAllByRole('row');
      // 5 data rows + 1 header row
      expect(rows).toHaveLength(6);
    });

    it('should show all rows when total is less than pageSize', () => {
      const testData = createTestData(3);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const rows = screen.getAllByRole('row');
      // 3 data rows + 1 header row
      expect(rows).toHaveLength(4);
    });

    it('should update pagination controls after navigating', async () => {
      const testData = createTestData(25);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const previousButton = screen.getByRole('button', { name: 'Previous' });
      const nextButton = screen.getByRole('button', { name: 'Next' });

      // Initially on first page
      expect(previousButton).toBeDisabled();
      expect(nextButton).not.toBeDisabled();

      // Navigate to second page
      await userEvent.click(nextButton);
      expect(previousButton).not.toBeDisabled();
      expect(nextButton).not.toBeDisabled();

      // Navigate to third (last) page
      await userEvent.click(nextButton);
      expect(previousButton).not.toBeDisabled();
      expect(nextButton).toBeDisabled();
    });
  });

  describe('Row Selection', () => {
    it('should display row selection count', () => {
      const testData = createTestData(5);
      render(<DataTable columns={selectableColumns} data={testData} />);

      expect(screen.getByText('0 of 5 row(s) selected.')).toBeInTheDocument();
    });

    it('should update selection count when row selected', async () => {
      const testData = createTestData(5);
      render(<DataTable columns={selectableColumns} data={testData} />);

      const firstRowCheckbox = screen.getByTestId('select-row-0');
      await userEvent.click(firstRowCheckbox);

      expect(screen.getByText('1 of 5 row(s) selected.')).toBeInTheDocument();
    });

    it('should select multiple rows', async () => {
      const testData = createTestData(5);
      render(<DataTable columns={selectableColumns} data={testData} />);

      const row1Checkbox = screen.getByTestId('select-row-0');
      const row2Checkbox = screen.getByTestId('select-row-1');

      await userEvent.click(row1Checkbox);
      await userEvent.click(row2Checkbox);

      expect(screen.getByText('2 of 5 row(s) selected.')).toBeInTheDocument();
    });

    it('should deselect row when clicked again', async () => {
      const testData = createTestData(5);
      render(<DataTable columns={selectableColumns} data={testData} />);

      const firstRowCheckbox = screen.getByTestId('select-row-0');

      await userEvent.click(firstRowCheckbox);
      expect(screen.getByText('1 of 5 row(s) selected.')).toBeInTheDocument();

      await userEvent.click(firstRowCheckbox);
      expect(screen.getByText('0 of 5 row(s) selected.')).toBeInTheDocument();
    });

    it('should select all page rows when select all clicked', async () => {
      const testData = createTestData(5);
      render(<DataTable columns={selectableColumns} data={testData} />);

      const selectAllCheckbox = screen.getByTestId('select-all');
      await userEvent.click(selectAllCheckbox);

      expect(screen.getByText('5 of 5 row(s) selected.')).toBeInTheDocument();
    });

    it('should deselect all rows when select all clicked again', async () => {
      const testData = createTestData(5);
      render(<DataTable columns={selectableColumns} data={testData} />);

      const selectAllCheckbox = screen.getByTestId('select-all');

      await userEvent.click(selectAllCheckbox);
      expect(screen.getByText('5 of 5 row(s) selected.')).toBeInTheDocument();

      await userEvent.click(selectAllCheckbox);
      expect(screen.getByText('0 of 5 row(s) selected.')).toBeInTheDocument();
    });

    it('should apply selected data-state to selected rows', async () => {
      const testData = createTestData(3);
      render(<DataTable columns={selectableColumns} data={testData} />);

      const firstRowCheckbox = screen.getByTestId('select-row-0');
      await userEvent.click(firstRowCheckbox);

      const rows = screen.getAllByRole('row');
      // First data row (index 1, since header is index 0)
      expect(rows[1]).toHaveAttribute('data-state', 'selected');
    });

    it('should show correct selection count with pagination', async () => {
      const testData = createTestData(15);
      render(<DataTable columns={selectableColumns} data={testData} pageSize={10} />);

      // Select first row on page 1
      const firstRowCheckbox = screen.getByTestId('select-row-0');
      await userEvent.click(firstRowCheckbox);

      expect(screen.getByText('1 of 15 row(s) selected.')).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort data when sort button clicked', async () => {
      const testData = [
        { id: '1', name: 'Charlie', email: 'c@example.com', role: 'User' },
        { id: '2', name: 'Alice', email: 'a@example.com', role: 'Admin' },
        { id: '3', name: 'Bob', email: 'b@example.com', role: 'User' },
      ];

      render(<DataTable columns={sortableColumns} data={testData} />);

      // Initially unsorted (original order)
      const rowsBefore = screen.getAllByRole('row');
      expect(within(rowsBefore[1]).getByText('Charlie')).toBeInTheDocument();
      expect(within(rowsBefore[2]).getByText('Alice')).toBeInTheDocument();
      expect(within(rowsBefore[3]).getByText('Bob')).toBeInTheDocument();

      // Click sort button
      const sortButton = screen.getByTestId('sort-name');
      await userEvent.click(sortButton);

      // Should be sorted ascending (Alice, Bob, Charlie)
      const rowsAfterAsc = screen.getAllByRole('row');
      expect(within(rowsAfterAsc[1]).getByText('Alice')).toBeInTheDocument();
      expect(within(rowsAfterAsc[2]).getByText('Bob')).toBeInTheDocument();
      expect(within(rowsAfterAsc[3]).getByText('Charlie')).toBeInTheDocument();

      // Click sort button again
      await userEvent.click(sortButton);

      // Should be sorted descending (Charlie, Bob, Alice)
      const rowsAfterDesc = screen.getAllByRole('row');
      expect(within(rowsAfterDesc[1]).getByText('Charlie')).toBeInTheDocument();
      expect(within(rowsAfterDesc[2]).getByText('Bob')).toBeInTheDocument();
      expect(within(rowsAfterDesc[3]).getByText('Alice')).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('should use default pageSize of 10', () => {
      const testData = createTestData(25);
      render(<DataTable columns={basicColumns} data={testData} />);

      const rows = screen.getAllByRole('row');
      // 10 data rows + 1 header
      expect(rows).toHaveLength(11);
    });

    it('should accept custom pageSize', () => {
      const testData = createTestData(25);
      render(<DataTable columns={basicColumns} data={testData} pageSize={15} />);

      const rows = screen.getAllByRole('row');
      // 15 data rows + 1 header
      expect(rows).toHaveLength(16);
    });

    it('should handle dynamic data updates', () => {
      const testData = createTestData(3);
      const { rerender } = render(<DataTable columns={basicColumns} data={testData} />);

      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.queryByText('User 4')).not.toBeInTheDocument();

      // Update data
      const newData = createTestData(5);
      rerender(<DataTable columns={basicColumns} data={newData} />);

      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('User 4')).toBeInTheDocument();
      expect(screen.getByText('User 5')).toBeInTheDocument();
    });

    it('should handle dynamic column updates', () => {
      const testData = createTestData(2);
      const initialColumns: ColumnDef<TestData>[] = [
        { accessorKey: 'name', header: 'Name' },
      ];

      const { rerender } = render(<DataTable columns={initialColumns} data={testData} />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.queryByText('Email')).not.toBeInTheDocument();

      // Update columns
      const newColumns: ColumnDef<TestData>[] = [
        { accessorKey: 'name', header: 'Name' },
        { accessorKey: 'email', header: 'Email' },
      ];

      rerender(<DataTable columns={newColumns} data={testData} />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should maintain selection when navigating pages', async () => {
      const testData = createTestData(15);
      render(<DataTable columns={selectableColumns} data={testData} pageSize={10} />);

      // Select first row on page 1
      const firstRowCheckbox = screen.getByTestId('select-row-0');
      await userEvent.click(firstRowCheckbox);

      expect(screen.getByText('1 of 15 row(s) selected.')).toBeInTheDocument();

      // Navigate to page 2
      const nextButton = screen.getByRole('button', { name: 'Next' });
      await userEvent.click(nextButton);

      // Selection count should still show 1
      expect(screen.getByText('1 of 15 row(s) selected.')).toBeInTheDocument();

      // Navigate back to page 1
      const previousButton = screen.getByRole('button', { name: 'Previous' });
      await userEvent.click(previousButton);

      // First row should still be selected
      const firstRowCheckboxAgain = screen.getByTestId('select-row-0');
      expect(firstRowCheckboxAgain).toBeChecked();
    });

    it('should show correct selection count across pages', async () => {
      const testData = createTestData(25);
      render(<DataTable columns={selectableColumns} data={testData} pageSize={10} />);

      // Select all on page 1
      const selectAll = screen.getByTestId('select-all');
      await userEvent.click(selectAll);

      expect(screen.getByText('10 of 25 row(s) selected.')).toBeInTheDocument();

      // Navigate to page 2
      const nextButton = screen.getByRole('button', { name: 'Next' });
      await userEvent.click(nextButton);

      // Selection count should still show 10
      expect(screen.getByText('10 of 25 row(s) selected.')).toBeInTheDocument();
    });

    it('should handle empty data with pagination controls', () => {
      render(<DataTable columns={basicColumns} data={[]} />);

      expect(screen.getByText('No results.')).toBeInTheDocument();
      expect(screen.getByText('0 of 0 row(s) selected.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper table structure', () => {
      const testData = createTestData(3);
      render(<DataTable columns={basicColumns} data={testData} />);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('columnheader')).toHaveLength(4);
      expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 data rows
    });

    it('should have accessible pagination buttons', () => {
      const testData = createTestData(15);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const previousButton = screen.getByRole('button', { name: 'Previous' });
      const nextButton = screen.getByRole('button', { name: 'Next' });

      expect(previousButton).toBeInTheDocument();
      expect(nextButton).toBeInTheDocument();
    });

    it('should have accessible selection checkboxes', () => {
      const testData = createTestData(3);
      render(<DataTable columns={selectableColumns} data={testData} />);

      expect(screen.getByLabelText('Select all')).toBeInTheDocument();
      expect(screen.getByLabelText('Select row 0')).toBeInTheDocument();
      expect(screen.getByLabelText('Select row 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Select row 2')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle single row of data', () => {
      const testData = createTestData(1);
      render(<DataTable columns={basicColumns} data={testData} />);

      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    });

    it('should handle exact pageSize amount of data', () => {
      const testData = createTestData(10);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(11); // 10 data + 1 header

      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    });

    it('should handle data with missing values', () => {
      const testData: TestData[] = [
        { id: '1', name: 'User 1', email: 'user1@example.com', role: 'Admin' },
        { id: '2', name: '', email: '', role: '' },
      ];

      render(<DataTable columns={basicColumns} data={testData} />);

      expect(screen.getByText('User 1')).toBeInTheDocument();
      // Empty strings should still render (just as empty cells)
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(3); // header + 2 data rows
    });

    it('should handle very large datasets efficiently', () => {
      const testData = createTestData(1000);
      render(<DataTable columns={basicColumns} data={testData} pageSize={10} />);

      // Should only render 10 rows (not all 1000)
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(11); // 10 data + 1 header

      expect(screen.getByText('0 of 1000 row(s) selected.')).toBeInTheDocument();
    });

    it('should handle columns with no header', () => {
      const columnsWithoutHeaders: ColumnDef<TestData>[] = [
        { accessorKey: 'name' },
        { accessorKey: 'email' },
      ];

      const testData = createTestData(2);
      render(<DataTable columns={columnsWithoutHeaders} data={testData} />);

      // Data should still render
      expect(screen.getByText('User 1')).toBeInTheDocument();
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    });
  });
});
