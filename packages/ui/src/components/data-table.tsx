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
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Button } from './button';
import { Checkbox } from './checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

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

export interface StatusOption {
  value: string;
  label: string;
  color?: string;
  icon?: string;
  description?: string;
}

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  pageSize?: number;
  emptyMessage?: string;
  emptyIcon?: string;
  onRowClick?: (row: TData) => void;
  enableRowSelection?: boolean;
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

export function TableRowActions<T>({ row, actions, quickActions, dropdownActions }: TableRowActionsProps<T>) {
  // Filter out separator items for the dropdown
  const menuItems = dropdownActions?.filter(a => !a.separator) || [];
  const hasDropdown = menuItems.length > 0;

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {/* Quick action buttons (icon only) */}
      {quickActions?.map((action, index) => (
        <button
          key={index}
          onClick={action.onClick}
          className="p-1.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
          title={action.label}
        >
          <span className="material-symbols-outlined text-[18px]">{action.icon}</span>
        </button>
      ))}

      {/* Legacy actions */}
      {actions?.map((action, index) => (
        <Button
          key={index}
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
              title="More actions"
            >
              <span className="material-symbols-outlined text-[18px]">more_vert</span>
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
                  className={action.variant === 'danger' ? 'text-destructive focus:text-destructive' : ''}
                >
                  {action.icon && (
                    <span className="material-symbols-outlined text-[18px] mr-2">{action.icon}</span>
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
// Dialog Components
// =============================================================================

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void | Promise<void>;
  isLoading?: boolean;
  icon?: string;
  children?: React.ReactNode;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  isLoading,
  icon,
}: ConfirmationDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-start gap-4">
          {icon && (
            <div className={`p-2 rounded-full ${variant === 'destructive' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-primary/10 text-primary'}`}>
              <span className="material-symbols-outlined text-xl">{icon}</span>
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-2 text-slate-600 dark:text-slate-400 text-sm">{description}</p>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={async () => {
              await onConfirm();
            }}
            disabled={isLoading}
          >
            {isLoading && <span className="material-symbols-outlined text-sm mr-2 animate-spin">progress_activity</span>}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface StatusSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  options: StatusOption[];
  currentValue?: string;
  onSelect?: (value: string) => void | Promise<void>;
  onConfirm?: (value: string) => void | Promise<void>;
  isLoading?: boolean;
}

export function StatusSelectDialog({
  open,
  onOpenChange,
  title,
  description,
  options,
  currentValue,
  onSelect,
  onConfirm,
}: StatusSelectDialogProps) {
  const [selectedValue, setSelectedValue] = React.useState(currentValue || '');

  if (!open) return null;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm(selectedValue);
    } else if (onSelect) {
      onSelect(selectedValue);
    }
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-2 text-slate-600 dark:text-slate-400">{description}</p>}
        <div className="mt-4 space-y-2">
          {options.map((option) => (
            <button
              key={option.value}
              className={`w-full text-left px-4 py-2 rounded ${
                selectedValue === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              onClick={() => setSelectedValue(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Confirm
          </Button>
        </div>
      </div>
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

function BulkActionsBar<T>({ selectedCount, bulkActions, selectedRows, onClearSelection }: BulkActionsBarProps<T>) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg mb-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-primary">
          {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
        </span>
        <button
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
                if (handler) handler(selectedRows);
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
// DataTable Component
// =============================================================================

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  pageSize = 10,
  emptyMessage = 'No results found.',
  emptyIcon = 'search_off',
  onRowClick,
  enableRowSelection,
  bulkActions,
  hidePagination,
  columnSizing,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // Add selection column if row selection is enabled
  const allColumns = React.useMemo(() => {
    if (!enableRowSelection) return columns;

    const selectionColumn: ColumnDef<TData, TValue> = {
      id: 'select',
      header: ({ table }) => (
        <div className="px-1">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
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
    enableRowSelection: enableRowSelection,
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

  // Get selected rows data
  const selectedRows = React.useMemo(() => {
    return table.getSelectedRowModel().rows.map(row => row.original);
  }, [table.getSelectedRowModel().rows]);

  const clearSelection = React.useCallback(() => {
    setRowSelection({});
  }, []);

  // Column width styles - reads from column definition size property
  const getColumnStyle = (columnId: string, columnDef?: ColumnDef<TData, TValue>): React.CSSProperties => {
    if (columnId === 'select') return { width: 40, minWidth: 40, maxWidth: 40 };
    // Use size from column definition if available
    const size = (columnDef as { size?: number })?.size;
    if (size) return { width: size, minWidth: size * 0.8 };
    if (columnSizing?.[columnId]) return { width: columnSizing[columnId] };
    if (columnId === 'actions') return { width: 120, minWidth: 120 };
    return {};
  };

  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {enableRowSelection && bulkActions && bulkActions.length > 0 && (
        <BulkActionsBar
          selectedCount={selectedRows.length}
          bulkActions={bulkActions}
          selectedRows={selectedRows}
          onClearSelection={clearSelection}
        />
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50/50">
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={getColumnStyle(header.id, header.column.columnDef as ColumnDef<TData, TValue>)}
                      className="font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400"
                    >
                      {header.isPlaceholder
                        ? null
                        : (flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          ) as React.ReactNode)}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={() => onRowClick?.(row.original)}
                  className={`bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={getColumnStyle(cell.column.id, cell.column.columnDef as ColumnDef<TData, TValue>)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext()) as React.ReactNode}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="bg-white dark:bg-slate-900 hover:bg-white">
                <TableCell colSpan={allColumns.length} className="h-48">
                  <div className="flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-3">
                      {emptyIcon}
                    </span>
                    <p className="text-slate-500 dark:text-slate-400">{emptyMessage}</p>
                  </div>
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
            {enableRowSelection && (
              <>
                {table.getFilteredSelectedRowModel().rows.length} of{' '}
                {table.getFilteredRowModel().rows.length} row(s) selected.
              </>
            )}
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
