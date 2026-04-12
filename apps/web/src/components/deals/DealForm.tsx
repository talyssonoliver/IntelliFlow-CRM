'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';
import { createOpportunitySchema } from '@intelliflow/validators/opportunity';
import {
  Card,
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@intelliflow/ui';
import { EntitySearchField } from '@/components/tasks/EntitySearchField';

// ── Types ──────────────────────────────────────────────────────────────────────

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface DealFormData {
  name: string;
  value: { amount: number; currency: string };
  stage: OpportunityStage;
  probability: number;
  expectedCloseDate: string;
  accountId: string;
  accountName: string;
  contactId: string;
  contactName: string;
  description: string;
}

export interface DealFormProps {
  readonly initialData?: Partial<DealFormData>;
  readonly onSubmit: (data: DealFormData) => void;
  readonly isSubmitting: boolean;
  readonly mode: 'create' | 'edit';
  readonly onDirtyChange?: (isDirty: boolean) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGE_PROBABILITIES: Record<string, number> = {
  PROSPECTING: 10,
  QUALIFICATION: 20,
  NEEDS_ANALYSIS: 40,
  PROPOSAL: 60,
  NEGOTIATION: 80,
};

/** Stages available for deal creation — exclude terminal stages */
const CREATE_STAGES = OPPORTUNITY_STAGES.filter((s) => s !== 'CLOSED_WON' && s !== 'CLOSED_LOST');

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  PROSPECTING: 'Prospecting',
  QUALIFICATION: 'Qualification',
  NEEDS_ANALYSIS: 'Needs Analysis',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

const DEFAULT_FORM_DATA: DealFormData = {
  name: '',
  value: { amount: 0, currency: 'USD' },
  stage: 'PROSPECTING',
  probability: 10,
  expectedCloseDate: '',
  accountId: '',
  accountName: '',
  contactId: '',
  contactName: '',
  description: '',
};

function buildCreateOpportunityInput(formData: DealFormData) {
  return {
    name: formData.name,
    value: formData.value,
    stage: formData.stage,
    probability: formData.probability,
    expectedCloseDate: formData.expectedCloseDate
      ? new Date(formData.expectedCloseDate)
      : undefined,
    accountId: formData.accountId,
    contactId: formData.contactId || undefined,
    description: formData.description.trim() || undefined,
  };
}

function applyZodIssuesToErrors(
  issues: Array<{ path: (string | number | symbol)[]; message: string }>,
  errors: Partial<Record<keyof DealFormData, string>>
): Partial<Record<keyof DealFormData, string>> {
  const result = { ...errors };
  for (const issue of issues) {
    const [field] = issue.path;
    if (field === 'probability' && !result.probability) {
      result.probability = 'Probability must be between 0 and 100';
    }
    if (field === 'expectedCloseDate' && !result.expectedCloseDate) {
      result.expectedCloseDate = 'Expected close date is invalid';
    }
    if (field === 'contactId' && !result.contactId) {
      result.contactId = 'Contact selection is invalid';
    }
    if (field === 'description' && !result.description) {
      result.description = issue.message;
    }
  }
  return result;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DealForm({
  initialData,
  onSubmit,
  isSubmitting,
  mode,
  onDirtyChange,
}: DealFormProps) {
  const initialFormData = useMemo<DealFormData>(
    () => ({
      ...DEFAULT_FORM_DATA,
      ...initialData,
    }),
    [initialData]
  );
  const [formData, setFormData] = useState<DealFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof DealFormData, string>>>({});

  useEffect(() => {
    setFormData(initialFormData);
    setErrors({});
  }, [initialFormData]);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(formData) !== JSON.stringify(initialFormData));
  }, [formData, initialFormData, onDirtyChange]);

  const validateForm = useCallback((): boolean => {
    let newErrors: Partial<Record<keyof DealFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Deal name is required';
    }
    if (!formData.value.amount || formData.value.amount <= 0) {
      newErrors.value = 'Deal value must be greater than 0';
    }
    if (!formData.accountId) {
      newErrors.accountId = 'Account is required';
    }

    const parsedInput = createOpportunitySchema.safeParse(buildCreateOpportunityInput(formData));
    if (!parsedInput.success) {
      newErrors = applyZodIssuesToErrors(parsedInput.error.issues, newErrors);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleStageChange = useCallback((stage: string) => {
    const typedStage = stage as OpportunityStage;
    setFormData((prev) => ({
      ...prev,
      stage: typedStage,
      probability: STAGE_PROBABILITIES[typedStage] ?? prev.probability,
    }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (validateForm()) {
        onSubmit(formData);
      }
    },
    [formData, validateForm, onSubmit]
  );

  const updateField = useCallback(
    <K extends keyof DealFormData>(key: K, value: DealFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
      // Clear error for this field
      setErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    []
  );

  const handleAccountChange = useCallback((id: string, name: string) => {
    setFormData((prev) => ({
      ...prev,
      accountId: id,
      accountName: name,
      contactId: prev.accountId === id ? prev.contactId : '',
      contactName: prev.accountId === id ? prev.contactName : '',
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.accountId;
      delete next.contactId;
      return next;
    });
  }, []);

  const handleContactChange = useCallback((id: string, name: string) => {
    setFormData((prev) => ({
      ...prev,
      contactId: id,
      contactName: name,
    }));
    setErrors((prev) => {
      if (!prev.contactId) return prev;
      const next = { ...prev };
      delete next.contactId;
      return next;
    });
  }, []);

  const submitLabel = mode === 'create' ? 'Create Deal' : 'Save Changes';

  return (
    <form onSubmit={handleSubmit}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* Deal Name */}
          <div>
            <Label htmlFor="deal-name">Deal Name *</Label>
            <Input
              id="deal-name"
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Acme Corp Software License"
              maxLength={200}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'deal-name-error' : undefined}
            />
            {errors.name && (
              <p id="deal-name-error" className="text-sm text-destructive mt-1" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          {/* Deal Value */}
          <div>
            <Label htmlFor="deal-value">Deal Value (USD) *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="deal-value"
                type="number"
                min={0}
                step="0.01"
                value={formData.value.amount || ''}
                onChange={(e) =>
                  updateField('value', {
                    amount: parseFloat(e.target.value) || 0,
                    currency: formData.value.currency,
                  })
                }
                placeholder="0.00"
                className="pl-7"
                aria-invalid={!!errors.value}
                aria-describedby={errors.value ? 'deal-value-error' : undefined}
              />
            </div>
            {errors.value && (
              <p id="deal-value-error" className="text-sm text-destructive mt-1" role="alert">
                {errors.value}
              </p>
            )}
          </div>

          {/* Stage + Probability row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="deal-stage">Stage</Label>
              <Select value={formData.stage} onValueChange={handleStageChange}>
                <SelectTrigger id="deal-stage" className="w-full">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {CREATE_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {STAGE_DISPLAY_NAMES[stage] ?? stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="deal-probability">Probability (%)</Label>
              <Input
                id="deal-probability"
                type="number"
                min={0}
                max={100}
                value={formData.probability}
                onChange={(e) => updateField('probability', parseInt(e.target.value, 10) || 0)}
                aria-invalid={!!errors.probability}
                aria-describedby={errors.probability ? 'deal-probability-error' : undefined}
              />
              {errors.probability && (
                <p
                  id="deal-probability-error"
                  className="text-sm text-destructive mt-1"
                  role="alert"
                >
                  {errors.probability}
                </p>
              )}
            </div>
          </div>

          {/* Expected Close Date */}
          <div>
            <Label htmlFor="deal-close-date">Expected Close Date</Label>
            <Input
              id="deal-close-date"
              type="date"
              value={formData.expectedCloseDate}
              onChange={(e) => updateField('expectedCloseDate', e.target.value)}
              aria-invalid={!!errors.expectedCloseDate}
              aria-describedby={errors.expectedCloseDate ? 'deal-close-date-error' : undefined}
            />
            {errors.expectedCloseDate && (
              <p id="deal-close-date-error" className="text-sm text-destructive mt-1" role="alert">
                {errors.expectedCloseDate}
              </p>
            )}
          </div>

          {/* Account Search */}
          <div>
            {errors.accountId && (
              <p id="deal-account-error" className="text-sm text-destructive mb-1" role="alert">
                {errors.accountId}
              </p>
            )}
            <EntitySearchField
              entityType="account"
              value={formData.accountId}
              valueName={formData.accountName}
              onChange={handleAccountChange}
            />
          </div>

          {/* Contact Search */}
          <div>
            {!formData.accountId && (
              <p className="text-xs text-muted-foreground mb-1">
                Select an account before linking a contact.
              </p>
            )}
            {errors.contactId && (
              <p id="deal-contact-error" className="text-sm text-destructive mb-1" role="alert">
                {errors.contactId}
              </p>
            )}
            <EntitySearchField
              entityType="contact"
              value={formData.contactId}
              valueName={formData.contactName}
              onChange={handleContactChange}
              accountId={formData.accountId || undefined}
              disabled={!formData.accountId}
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="deal-description">Description</Label>
            <Textarea
              id="deal-description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Add notes about this deal..."
              maxLength={1000}
              rows={3}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'deal-description-error' : undefined}
            />
            {errors.description && (
              <p id="deal-description-error" className="text-sm text-destructive mt-1" role="alert">
                {errors.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">{formData.description.length}/1000</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : submitLabel}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link href="/deals">Cancel</Link>
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
