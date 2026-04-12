'use client';

import { useState, useCallback } from 'react';
import {
  Card,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ConfirmationDialog,
  EmptyState,
} from '@intelliflow/ui';

export interface CustomField {
  id: string;
  fieldName: string;
  fieldKey: string;
  dataType: string;
  options?: { values: string[] } | null;
  isRequired: boolean;
  sortOrder: number;
}

export interface CreateFieldData {
  fieldName: string;
  dataType: string;
  options?: { values: string[] };
  isRequired?: boolean;
}

export interface UpdateFieldData extends CreateFieldData {
  id: string;
}

interface CustomFieldsTabProps {
  fields: CustomField[];
  onCreate: (data: CreateFieldData) => void;
  onUpdate: (data: UpdateFieldData) => void;
  onDelete: (id: string) => void;
}

const DATA_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
];

interface FieldFormState {
  id?: string;
  fieldName: string;
  dataType: string;
  isRequired: boolean;
}

export function CustomFieldsTab({
  fields,
  onCreate,
  onUpdate,
  onDelete,
}: Readonly<CustomFieldsTabProps>) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FieldFormState>({
    fieldName: '',
    dataType: 'text',
    isRequired: false,
  });

  const openCreateDialog = useCallback(() => {
    setFormState({ fieldName: '', dataType: 'text', isRequired: false });
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((field: CustomField) => {
    setFormState({
      id: field.id,
      fieldName: field.fieldName,
      dataType: field.dataType,
      isRequired: field.isRequired,
    });
    setDialogOpen(true);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!formState.fieldName.trim()) return;
    if (formState.id) {
      onUpdate({
        id: formState.id,
        fieldName: formState.fieldName,
        dataType: formState.dataType,
        isRequired: formState.isRequired,
      });
    } else {
      onCreate({
        fieldName: formState.fieldName,
        dataType: formState.dataType,
        isRequired: formState.isRequired,
      });
    }
    setDialogOpen(false);
  }, [formState, onCreate, onUpdate]);

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTargetId) {
      onDelete(deleteTargetId);
      setDeleteTargetId(null);
      setDeleteDialogOpen(false);
    }
  }, [deleteTargetId, onDelete]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Custom Fields</h3>
          <p className="text-sm text-muted-foreground">
            Add custom data fields to capture lead-specific information.
          </p>
        </div>
        <Button onClick={openCreateDialog} size="sm">
          <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
            add
          </span>{' '}
          Add Field
        </Button>
      </div>

      {fields.length === 0 ? (
        <EmptyState entity="rules" phase="passive" />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Field Name
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Data Type
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground p-3">
                  Required
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground p-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-t">
                  <td className="p-3 text-sm font-medium">{field.fieldName}</td>
                  <td className="p-3 text-sm text-muted-foreground capitalize">{field.dataType}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {field.isRequired ? 'Yes' : 'No'}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(field)}
                        aria-label={`Edit ${field.fieldName}`}
                      >
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">
                          edit
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteTargetId(field.id);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${field.fieldName}`}
                      >
                        <span className="material-symbols-outlined text-sm" aria-hidden="true">
                          delete
                        </span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formState.id ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="field-name" className="text-sm font-medium block mb-1">
                Field Name
              </label>
              <Input
                id="field-name"
                value={formState.fieldName}
                onChange={(e) => setFormState((s) => ({ ...s, fieldName: e.target.value }))}
                placeholder="e.g., Company Size"
              />
            </div>
            <div>
              <label htmlFor="field-type" className="text-sm font-medium block mb-1">
                Data Type
              </label>
              <Select
                value={formState.dataType}
                onValueChange={(value) => setFormState((s) => ({ ...s, dataType: value }))}
              >
                <SelectTrigger id="field-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!formState.fieldName.trim()}>
              {formState.id ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Custom Field"
        description="This will remove the custom field. Existing data using this field will be preserved but the field will no longer be visible."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
      />
    </Card>
  );
}
