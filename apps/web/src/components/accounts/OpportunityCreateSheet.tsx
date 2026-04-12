'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  Button,
  Input,
  Label,
  toast,
} from '@intelliflow/ui';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';
import { api } from '@/lib/api';

export interface OpportunityCreateSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly accountId: string;
  readonly accountName?: string;
  readonly onSuccess?: () => void;
}

interface FormState {
  name: string;
  value: string;
  stage: string;
  expectedCloseDate: string;
  description: string;
}

const DEFAULT_FORM: FormState = {
  name: '',
  value: '',
  stage: 'PROSPECTING',
  expectedCloseDate: '',
  description: '',
};

export function OpportunityCreateSheet({
  open,
  onOpenChange,
  accountId,
  accountName,
  onSuccess,
}: Readonly<OpportunityCreateSheetProps>) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = api.useUtils();
  const createMutation = api.opportunity.create.useMutation({
    onSuccess: () => {
      utils.account.getOpportunities.invalidate({ accountId });
      utils.account.getById.invalidate({ id: accountId });
      toast({ title: 'Deal created', description: `Deal "${form.name}" has been created.` });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      const desc =
        error.message.includes('not found') || error.message.includes('foreign key')
          ? 'Account may have been deleted. Please refresh.'
          : error.message;
      toast({ title: 'Failed to create deal', description: desc, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_FORM);
      setErrors({});
    }
  }, [open]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }
    const parsedValue = parseFloat(form.value);
    if (!form.value.trim() || isNaN(parsedValue) || parsedValue < 0) {
      newErrors.value = 'Value must be a non-negative number';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!validate()) return;

    createMutation.mutate({
      name: form.name.trim(),
      value: { amount: parseFloat(form.value), currency: 'USD' },
      stage: form.stage as (typeof OPPORTUNITY_STAGES)[number],
      probability: 10,
      accountId,
      ...(form.expectedCloseDate ? { expectedCloseDate: new Date(form.expectedCloseDate) } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>New Deal</SheetTitle>
        <SheetDescription>
          Create a new deal{accountName ? ` linked to ${accountName}` : ''}.
        </SheetDescription>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="opp-name">Name *</Label>
            <Input
              id="opp-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'opp-name-error' : undefined}
              placeholder="Deal name"
            />
            {errors.name && (
              <p id="opp-name-error" className="text-sm text-destructive mt-1">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="opp-value">Value (USD) *</Label>
            <Input
              id="opp-value"
              type="number"
              min="0"
              step="0.01"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              aria-invalid={!!errors.value}
              aria-describedby={errors.value ? 'opp-value-error' : undefined}
              placeholder="0.00"
            />
            {errors.value && (
              <p id="opp-value-error" className="text-sm text-destructive mt-1">
                {errors.value}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="opp-stage">Stage</Label>
            <select
              id="opp-stage"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.stage}
              onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
            >
              {OPPORTUNITY_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="opp-close-date">Expected Close Date</Label>
            <Input
              id="opp-close-date"
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))}
            />
          </div>

          <div>
            <Label htmlFor="opp-description">Description</Label>
            <textarea
              id="opp-description"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description (optional)"
              maxLength={1000}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Deal'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
