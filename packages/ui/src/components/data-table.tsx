import * as React from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  getFilteredRowModel,
  VisibilityState,
  RowSelectionState,
  type Table as ReactTable,
  type Row,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Button } from './button';
import { EmptyState } from './empty-state';
import type { EmptyStateEntity, EmptyStateVariant } from './entity-empty-state-config';
import { Checkbox } from './checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';
export { ConfirmationDialog } from './confirmation-dialog';
export type { ConfirmationDialogProps } from './confirmation-dialog';
export { StatusSelectDialog } from './status-select-dialog';
export type { StatusOption, StatusSelectDialogProps } from './status-select-dialog';

// =============================================================================
// Types
// =============================================================================

export interface BulkAction<T> {
  id?: string;
  label: string;
  icon?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'danger';
  onExecute?: (selectedRows: T[]) => void | Promise<void>;
  onClick?: (selectedRows: T[]) => void | Promise<void>;
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  pageSize?: number;
  emptyMessage?: string;
  emptyIcon?: string;
  /**
   * `filtered` when the list is empty because of a search, filter or segment: the empty state says
   * nothing matched instead of "No deals yet" (owner 27/11 review).
   */
  emptyVariant?: EmptyStateVariant;
  /** CRM entity type — renders rich illustrated empty state automatically */
  entity?: EmptyStateEntity;
  onRowClick?: (row: TData) => void;
  enableRowSelection?: boolean;
  /** With row selection on: which rows get a checkbox (all when omitted). */
  canSelectRow?: (row: TData) => boolean;
  /**
   * A stable id per row. Without it a selection is kept by row index, so a row that leaves the
   * list (completed, deleted) hands its selection to the row that moves into its place.
   */
  getRowId?: (row: TData) => string;
  bulkActions?: BulkAction<TData>[];
  hidePagination?: boolean;
  columnSizing?: Record<string, number>;
}

// =============================================================================
// TableRowActions Component
// =============================================================================

export interface TableRowActionsProps<T> {
  row?: T;
  actions?: Array<{
    label: string;
    icon?: string;
    onClick: (row: T) => void;
    variant?: 'default' | 'destructive';
  }>;
  quickActions?: Array<{
    icon: string;
    label: string;
    variant?: string;
    onClick: () => void;
  }>;
  dropdownActions?: Array<{
    id?: string;
    icon: string;
    label: string;
    onClick: () => void;
    separator?: boolean;
    variant?: string;
  }>;
}

export function TableRowActions<T>({
  row,
  actions,
  quickActions,
  dropdownActions,
}: Readonly<TableRowActionsProps<T>>) {
  // Filter out separator items for the dropdown
  const menuItems = dropdownActions?.filter((a) => !a.separator) || [];
  const hasDropdown = menuItems.length > 0;

  return (
    <div
      role="toolbar"
      aria-label="Row actions"
      className="flex items-center justify-end gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {/* Quick action buttons (icon only) */}
      {quickActions?.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          aria-label={action.label}
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            {action.icon}
          </span>
        </button>
      ))}

      {/* Legacy actions */}
      {actions?.map((action) => (
        <Button
          key={action.label}
          variant={action.variant === 'destructive' ? 'destructive' : 'ghost'}
          size="sm"
          onClick={() => row && action.onClick(row)}
        >
          {action.label}
        </Button>
      ))}

      {/* Dropdown menu for more actions */}
      {hasDropdown && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              aria-label="More actions"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                more_vert
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {dropdownActions?.map((action, index) => {
              if (action.separator) {
                return <DropdownMenuSeparator key={action.id || `sep-${index}`} />;
              }
              return (
                <DropdownMenuItem
                  key={action.id || index}
                  onClick={action.onClick}
                  className={
                    action.variant === 'danger' ? 'text-destructive focus:text-destructive' : ''
                  }
                >
                  {action.icon && (
                    <span className="material-symbols-outlined text-[18px] mr-2">
                      {action.icon}
                    </span>
                  )}
                  {action.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// =============================================================================
// Bulk Actions Bar Component
// =============================================================================

interface BulkActionsBarProps<T> {
  selectedCount: number;
  bulkActions: BulkAction<T>[];
  selectedRows: T[];
  onClearSelection: () => void;
}

function BulkActionsBar<T>({
  selectedCount,
  bulkActions,
  selectedRows,
  onClearSelection,
}: Readonly<BulkActionsBarProps<T>>) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg mb-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-primary">
          {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
        </span>
        <button
          type="button"
          onClick={onClearSelection}
          className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Clear selection
        </button>
      </div>
      <div className="flex items-center gap-2">
        {bulkActions.map((action, index) => {
          const isDestructive = action.variant === 'danger' || action.variant === 'destructive';
          return (
            <Button
              key={action.id || index}
              variant={isDestructive ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => {
                const handler = action.onClick || action.onExecute;
                if (handler) {
                  // A done action clears the selection, so nothing stays selected for the next one.
                  Promise.resolve(handler(selectedRows))
                    .then(onClearSelection)
                    .catch((error: unknown) => {
                      console.error('[DataTable] Bulk action failed:', error);
                    });
                }
              }}
            >
              {action.icon && (
                <span className="material-symbols-outlined text-[16px] mr-1.5">{action.icon}</span>
              )}
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Selection Column Sub-Components (extracted to avoid S6478: inner component)
// =============================================================================

/**
 * Phone layout (below `md`), shared by every DataTable (owner 21/11: fix it once in the shared
 * component, never per table). Each row becomes a card like the Leads phone cards: the checkbox,
 * the main column (the first one that is not the checkbox or the actions) and the actions on one
 * line, every other column as a "Header ... value" line, and the actions last. CSS only, on the
 * same table markup, so nothing renders twice and the DOM order is the reading order. The header
 * row stays for screen readers (sr-only). Inline column widths are overridden with `!`.
 */
/**
 * Phone header: a compact toolbar above the cards that keeps only the header cells holding a
 * control (the select-all checkbox, a sort button); plain text headings are hidden because each
 * card already labels its values (codex 21/11: sorting and select-all must stay reachable).
 */
const PHONE_HEAD_ROW =
  'max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:border-0 max-md:bg-transparent max-md:px-1 max-md:pb-2';
const PHONE_HEAD_CELL =
  'max-md:h-auto max-md:w-auto! max-md:min-w-0! max-md:max-w-none! max-md:p-0 max-md:[&:not(:has(button,input,[role=checkbox]))]:hidden';

const PHONE_CELL = 'max-md:block max-md:w-auto! max-md:min-w-0! max-md:max-w-none! max-md:p-0';
const PHONE_CELL_ROLE = {
  select: 'max-md:pt-0.5 max-md:empty:hidden!',
  primary: 'max-md:flex-1',
  // Last in the DOM and last on the card (same reading and focus order), on the right.
  actions: 'max-md:flex! max-md:basis-full max-md:justify-end max-md:pt-1',
  // The label takes the free space, so a cell's parts stay together on the right.
  detail:
    'max-md:flex! max-md:basis-full max-md:items-center max-md:gap-3 max-md:text-sm max-md:[&>*]:min-w-0 max-md:[&>*]:max-w-full max-md:empty:hidden! max-md:before:mr-auto max-md:before:shrink-0 max-md:before:text-xs max-md:before:text-slate-500 max-md:before:content-[attr(data-label)] dark:max-md:before:text-slate-400',
} as const;

function phoneCellRole(
  columnId: string,
  primaryId: string | undefined
): keyof typeof PHONE_CELL_ROLE {
  if (columnId === 'select') return 'select';
  if (columnId === 'actions') return 'actions';
  return columnId === primaryId ? 'primary' : 'detail';
}

/** "N of M row(s) selected.", counting only rows that can be selected. */
function SelectionCount<TData>({ table }: Readonly<{ table: ReactTable<TData> }>) {
  const selected = table.getFilteredSelectedRowModel().rows.filter((r) => r.getCanSelect()).length;
  const selectable = table.getFilteredRowModel().rows.filter((r) => r.getCanSelect()).length;
  return (
    <>
      {selected} of {selectable} row(s) selected.
    </>
  );
}

/** Row selection on, off, or per row when `canSelectRow` is given. */
function rowSelectionRule<TData>(
  enabled: boolean | undefined,
  canSelectRow: ((row: TData) => boolean) | undefined
): boolean | ((row: Row<TData>) => boolean) {
  if (!enabled) return false;
  return canSelectRow ? (row) => canSelectRow(row.original) : true;
}

/** The phone card label of a column: its header when the header is plain text. */
function headerLabel(header: unknown): string | undefined {
  return typeof header === 'string' ? header : undefined;
}

function SelectAllHeader<TData>({ table }: Readonly<{ table: ReactTable<TData> }>) {
  return (
    <div className="px-1">
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    </div>
  );
}

function SelectRowCell<TData>({ row }: Readonly<{ row: Row<TData> }>) {
  // A row that cannot be selected gets no checkbox and no empty gutter.
  if (!row.getCanSelect()) return null;
  return (
    <div
      className="px-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    </div>
  );
}

// =============================================================================
// DataTable Component
// =============================================================================

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  pageSize = 10,
  emptyMessage = 'No results found.',
  emptyIcon = 'search_off',
  emptyVariant,
  entity,
  onRowClick,
  enableRowSelection,
  canSelectRow,
  getRowId,
  bulkActions,
  hidePagination,
  columnSizing,
}: Readonly<DataTableProps<TData, TValue>>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // Add selection column if row selection is enabled
  const allColumns = React.useMemo(() => {
    if (!enableRowSelection) return columns;

    const selectionColumn: ColumnDef<TData, TValue> = {
      id: 'select',
      header: SelectAllHeader as ColumnDef<TData, TValue>['header'],
      cell: SelectRowCell as ColumnDef<TData, TValue>['cell'],
      enableSorting: false,
      enableHiding: false,
      size: 40,
    };

    return [selectionColumn, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: rowSelectionRule(enableRowSelection, canSelectRow),
    ...(getRowId ? { getRowId: (row: TData) => getRowId(row) } : {}),
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  // `pageSize` is read once by TanStack (initialState); follow later changes too, so a caller
  // that grows its page (Tasks adds the follow-ups after they load) does not leave rows on page 2.
  React.useEffect(() => {
    table.setPageSize(pageSize);
  }, [table, pageSize]);

  // Get selected rows data
  const selectedRows = React.useMemo(() => {
    // A selection made before the data changed can point at a row that is not selectable now.
    return table
      .getSelectedRowModel()
      .rows.filter((row) => row.getCanSelect())
      .map((row) => row.original);
    // The selectable-rows rule is a dependency too: changing it must drop rows it now excludes.
  }, [table.getSelectedRowModel().rows, canSelectRow, enableRowSelection]);

  const clearSelection = React.useCallback(() => {
    setRowSelection({});
  }, []);

  // Column width styles - reads from column definition size property
  // The phone card's main line: the first visible column that is not the checkbox or the actions
  // (TanStack ids, so `accessorKey: 'metadata.title'` is matched as `metadata_title`).
  const primaryColumnId = table
    .getVisibleLeafColumns()
    .find((c) => c.id !== 'select' && c.id !== 'actions')?.id;

  const getColumnStyle = (
    columnId: string,
    columnDef?: ColumnDef<TData, TValue>
  ): React.CSSProperties => {
    if (columnId === 'select') return { width: 40, minWidth: 40, maxWidth: 40 };
    // Use size from column definition if available
    const size = (columnDef as { size?: number } | undefined)?.size; // NOSONAR
    if (size) return { width: size, minWidth: size * 0.8 };
    if (columnSizing?.[columnId]) return { width: columnSizing[columnId] };
    if (columnId === 'actions') return { width: 120, minWidth: 120 };
    return {};
  };

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {enableRowSelection && bulkActions && bulkActions.length > 0 ? (
        <BulkActionsBar
          selectedCount={selectedRows.length}
          bulkActions={bulkActions}
          selectedRows={selectedRows}
          onClearSelection={clearSelection}
        />
      ) : null}

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 max-md:overflow-visible max-md:border-0 max-md:bg-transparent dark:max-md:bg-transparent">
        <Table className="max-md:block max-md:w-full">
          <TableHeader className="max-md:block">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className={`bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50 ${PHONE_HEAD_ROW}`}
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={getColumnStyle(
                        header.id,
                        header.column.columnDef as ColumnDef<TData, TValue> // NOSONAR
                      )}
                      className={`font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 ${PHONE_HEAD_CELL}`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="max-md:flex max-md:flex-col max-md:gap-3">
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={() => onRowClick?.(row.original)}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? 'button' : undefined}
                  className={`bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 max-md:flex max-md:flex-wrap max-md:items-start max-md:gap-x-3 max-md:gap-y-1.5 max-md:rounded-lg max-md:border! max-md:border-slate-200 max-md:p-4 dark:max-md:border-slate-700 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset' : ''}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={getColumnStyle(
                        cell.column.id,
                        cell.column.columnDef as ColumnDef<TData, TValue> // NOSONAR
                      )}
                      className={`${PHONE_CELL} ${PHONE_CELL_ROLE[phoneCellRole(cell.column.id, primaryColumnId)]}`}
                      data-label={headerLabel(cell.column.columnDef.header)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="bg-white dark:bg-slate-900 hover:bg-white max-md:block max-md:rounded-lg max-md:border! max-md:border-slate-200 dark:max-md:border-slate-700">
                <TableCell colSpan={allColumns.length} className="h-48 max-md:block max-md:h-auto">
                  {entity ? (
                    <EmptyState
                      entity={entity}
                      variant={emptyVariant}
                      showCta={false}
                      description={emptyMessage !== 'No results found.' ? emptyMessage : undefined}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center">
                      <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3">
                        {emptyIcon}
                      </span>
                      <p className="text-slate-500 dark:text-slate-400">{emptyMessage}</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!hidePagination && (
        <div className="flex items-center justify-between py-2">
          <div className="text-sm text-muted-foreground">
            {enableRowSelection ? <SelectionCount table={table} /> : null}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
