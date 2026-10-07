'use client';

/**
 * AccountForm — create/edit form for an account (PG-197).
 *
 * Presentational: option lists and their load state come from the route
 * component (NewAccountForm / EditAccountForm). The owner select is shown on
 * create only; owner changes on existing accounts go through reassign.
 * Payload builders are exported so the "omit on create / null on clear" rules
 * are unit-tested once.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@intelliflow/ui';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '@intelliflow/domain';
import { CountrySelect } from '@/components/shared/country-select';

export interface AccountFormValues {
  name: string;
  website: string;
  industry: string;
  employees: string;
  revenue: string;
  description: string;
  country: string;
  region: string;
  postalCode: string;
  /** '' = assign automatically (omitted from the create payload). */
  ownerId: string;
}

export const EMPTY_ACCOUNT_FORM_VALUES: AccountFormValues = {
  name: '',
  website: '',
  industry: '',
  employees: '',
  revenue: '',
  description: '',
  country: '',
  region: '',
  postalCode: '',
  ownerId: '',
};

export type OptionsStatus = 'loading' | 'error' | 'ready';

/** Map a tRPC query's state to the form's option-list status. */
export function toOptionsStatus(query: { isLoading: boolean; error: unknown }): OptionsStatus {
  if (query.isLoading) return 'loading';
  return query.error ? 'error' : 'ready';
}

export interface AccountFormOwnerOption {
  id: string;
  name: string;
  title?: string | null;
}

export interface AccountFormProps {
  mode: 'create' | 'edit';
  initialValues?: Partial<AccountFormValues>;
  industryOptions: string[];
  industryStatus: OptionsStatus;
  ownerOptions?: AccountFormOwnerOption[];
  ownerStatus?: OptionsStatus;
  /** Current user; role undefined (hydrating) → non-admin view. */
  currentUser?: { id: string; role?: string } | null;
  onSubmit: (values: AccountFormValues) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

const AUTO_OWNER = '__auto__';
const NO_INDUSTRY = '__none__';
const ADMIN_ROLES: ReadonlySet<string> = new Set(ACCOUNT_OWNER_ADMIN_ROLES);

const trimmed = (value: string): string | undefined => value.trim() || undefined;

function toNumber(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** account.create payload: empty fields and "assign automatically" are omitted. */
export function buildCreateAccountPayload(values: AccountFormValues) {
  return {
    name: values.name.trim(),
    website: trimmed(values.website),
    industry: trimmed(values.industry),
    employees: toNumber(values.employees),
    revenue: toNumber(values.revenue),
    description: trimmed(values.description),
    country: trimmed(values.country),
    region: trimmed(values.region),
    postalCode: trimmed(values.postalCode),
    ownerId: trimmed(values.ownerId),
  };
}

const GEOGRAPHY_FIELDS = ['country', 'region', 'postalCode'] as const;
const TEXT_FIELDS = ['name', 'website', 'industry', 'description'] as const;
const NUMBER_FIELDS = ['employees', 'revenue'] as const;

/**
 * account.update payload: only changed fields plus the id. Cleared geography is
 * sent as null; other cleared optional fields cannot be cleared by update and
 * are left out.
 */
export function buildUpdateAccountPayload(
  id: string,
  initial: AccountFormValues,
  values: AccountFormValues
) {
  const payload: {
    id: string;
    name?: string;
    website?: string;
    industry?: string;
    description?: string;
    employees?: number;
    revenue?: number;
    country?: string | null;
    region?: string | null;
    postalCode?: string | null;
  } = { id };
  const changed = (field: keyof AccountFormValues) =>
    values[field].trim() !== initial[field].trim();

  for (const field of TEXT_FIELDS) {
    const value = trimmed(values[field]);
    if (changed(field) && value !== undefined) payload[field] = value;
  }
  for (const field of NUMBER_FIELDS) {
    const value = toNumber(values[field]);
    if (changed(field) && value !== undefined) payload[field] = value;
  }
  for (const field of GEOGRAPHY_FIELDS) {
    if (changed(field)) payload[field] = trimmed(values[field]) ?? null;
  }
  return payload;
}

function isSameValues(a: AccountFormValues, b: AccountFormValues): boolean {
  return (Object.keys(a) as (keyof AccountFormValues)[]).every((key) => a[key] === b[key]);
}

function optionsMessage(status: OptionsStatus | undefined, what: string): string | null {
  if (status === 'loading') return `Loading ${what}…`;
  if (status === 'error') return `Could not load ${what}. You can still save without it.`;
  return null;
}

export function AccountForm({
  mode,
  initialValues,
  industryOptions,
  industryStatus,
  ownerOptions = [],
  ownerStatus = 'ready',
  currentUser,
  onSubmit,
  onCancel,
  isSubmitting = false,
  onDirtyChange,
}: Readonly<AccountFormProps>) {
  const initial = useMemo(
    () => ({ ...EMPTY_ACCOUNT_FORM_VALUES, ...initialValues }),
    [initialValues]
  );
  const [values, setValues] = useState<AccountFormValues>(initial);
  const [nameError, setNameError] = useState<string | null>(null);

  const isDirty = !isSameValues(values, initial);
  const lastDirty = useRef(false);
  useEffect(() => {
    if (lastDirty.current === isDirty) return;
    lastDirty.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const set = (field: keyof AccountFormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const isAdmin = ADMIN_ROLES.has(currentUser?.role ?? '');
  const visibleOwners = isAdmin
    ? ownerOptions
    : ownerOptions.filter((option) => option.id === currentUser?.id);

  const optionsLoading =
    industryStatus === 'loading' || (mode === 'create' && ownerStatus === 'loading');
  const submitDisabled = isSubmitting || optionsLoading || (mode === 'edit' && !isDirty);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!values.name.trim()) {
      setNameError('Account name is required.');
      return;
    }
    setNameError(null);
    await onSubmit(values);
  };

  const submitLabel = mode === 'create' ? 'Create Account' : 'Save Changes';
  const industryMessage = optionsMessage(industryStatus, 'industries');
  const ownerMessage = optionsMessage(ownerStatus, 'users');
  const industryChoices =
    values.industry && !industryOptions.includes(values.industry)
      ? [values.industry, ...industryOptions]
      : industryOptions;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={mode === 'create' ? 'New account' : 'Edit account'}
    >
      <Card className="p-4 sm:p-6 space-y-6">
        <fieldset className="space-y-4">
          <legend className="text-base font-semibold text-foreground mb-2">Company</legend>
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Account name</Label>
            <Input
              id="account-name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              required
              aria-required="true"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'account-name-error' : undefined}
              maxLength={200}
            />
            {nameError && (
              <p id="account-name-error" className="text-sm text-destructive">
                {nameError}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="account-website">Website</Label>
              <Input
                id="account-website"
                type="url"
                inputMode="url"
                placeholder="https://example.com"
                value={values.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-industry">Industry</Label>
              <Select
                value={values.industry || NO_INDUSTRY}
                onValueChange={(next) => set('industry', next === NO_INDUSTRY ? '' : next)}
                disabled={industryStatus === 'loading'}
              >
                <SelectTrigger
                  id="account-industry"
                  aria-describedby={industryMessage ? 'account-industry-status' : undefined}
                >
                  <SelectValue placeholder="Select an industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_INDUSTRY}>No industry</SelectItem>
                  {industryChoices.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {industryMessage && (
                <p id="account-industry-status" className="text-xs text-muted-foreground">
                  {industryMessage}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-employees">Employees</Label>
              <Input
                id="account-employees"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={values.employees}
                onChange={(e) => set('employees', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-revenue">Annual revenue</Label>
              <Input
                id="account-revenue"
                type="number"
                min={0}
                inputMode="decimal"
                value={values.revenue}
                onChange={(e) => set('revenue', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-description">Description</Label>
            <Textarea
              id="account-description"
              rows={3}
              maxLength={1000}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-base font-semibold text-foreground">Location</legend>
          <p className="text-sm text-muted-foreground">
            Optional. Used to assign new accounts to a territory.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="account-country">Country</Label>
              <CountrySelect
                id="account-country"
                value={values.country || null}
                onChange={(next) => set('country', next ?? '')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-region">Region</Label>
              <Input
                id="account-region"
                maxLength={100}
                placeholder="e.g. London"
                value={values.region}
                onChange={(e) => set('region', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-postal-code">Postal code</Label>
              <Input
                id="account-postal-code"
                maxLength={20}
                autoComplete="postal-code"
                value={values.postalCode}
                onChange={(e) => set('postalCode', e.target.value)}
              />
            </div>
          </div>
        </fieldset>

        {mode === 'create' && (
          <fieldset className="space-y-2">
            <legend className="text-base font-semibold text-foreground">Owner</legend>
            <Label htmlFor="account-owner">Account owner</Label>
            <Select
              value={values.ownerId || AUTO_OWNER}
              onValueChange={(next) => set('ownerId', next === AUTO_OWNER ? '' : next)}
              disabled={ownerStatus === 'loading'}
            >
              <SelectTrigger
                id="account-owner"
                aria-describedby="account-owner-help"
                className="sm:max-w-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_OWNER}>Assign automatically</SelectItem>
                {visibleOwners.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                    {option.title ? ` — ${option.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="account-owner-help" className="text-xs text-muted-foreground">
              {ownerMessage ??
                'Assign automatically uses your territories when auto-assign is on; otherwise you own the account.'}
            </p>
          </fieldset>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {isSubmitting ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </Card>
    </form>
  );
}
