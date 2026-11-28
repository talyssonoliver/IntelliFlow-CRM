'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  ToastAction,
  toast,
} from '@intelliflow/ui';
import { contactNameFromLead } from '@intelliflow/domain';
import { api } from '@/lib/api';
import { useTenantCurrency } from '@/lib/format/useTenantCurrency';
import { currencySymbol, formatMoney } from '@/lib/format/money';
import { UNDONE_TOAST, undoConversion } from '@/components/deals/UndoConversion';
import { revalidateLeadConversionCaches } from '@/app/leads/actions';
import { leadDisplayName } from '@/lib/leads/lead-format';
import {
  DEAL_NAME_MAX,
  buildConvertToDealPayload,
  getConvertErrorDescription,
  validateDealValue,
} from '@/lib/leads/lead-conversion';

const INPUT_CLASS =
  'w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2a78f6] focus:border-transparent';
const LABEL_CLASS = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1';

type ConvertMode = 'contact' | 'deal';

function reportCacheRevalidationError(error: unknown) {
  console.error('Failed to revalidate lead caches:', error);
}

interface ConvertLeadDialogLead {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  /** The lead's own estimate in pence (Lead.estimatedValue); pre-fills the deal value. */
  estimatedValue?: number | null;
}

export interface ConvertLeadDialogProps {
  lead: ConvertLeadDialogLead;
  userId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The mode the dialog opens (and reopens) in; "Convert to deal" opens it on "deal". */
  initialMode?: ConvertMode;
}

function ModeChoice({
  mode,
  onChange,
}: Readonly<{ mode: ConvertMode; onChange: (m: ConvertMode) => void }>) {
  const options: Array<{ value: ConvertMode; label: string; hint: string }> = [
    { value: 'contact', label: 'Contact only', hint: 'Create a contact record.' },
    {
      value: 'deal',
      label: 'Contact and deal',
      hint: 'Also open a deal in the pipeline at Prospecting.',
    },
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        What should be created?
      </legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex items-start gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300"
        >
          <input
            type="radio"
            name="convert-mode"
            value={o.value}
            checked={mode === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 text-[#2a78f6] focus:ring-[#2a78f6]"
          />
          <span>
            {o.label}
            <span className="block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function ContactFields({
  createAccount,
  accountName,
  placeholder,
  onCreateAccount,
  onAccountName,
}: Readonly<{
  createAccount: boolean;
  accountName: string;
  placeholder: string;
  onCreateAccount: (v: boolean) => void;
  onAccountName: (v: string) => void;
}>) {
  return (
    <>
      <label
        htmlFor="convert-create-account"
        className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300"
      >
        <input
          type="checkbox"
          checked={createAccount}
          onChange={(e) => onCreateAccount(e.target.checked)}
          id="convert-create-account"
          className="rounded border-slate-300 dark:border-slate-600 text-[#2a78f6] focus:ring-[#2a78f6]"
        />{' '}
        Also create an Account record
      </label>
      {createAccount && (
        <div>
          <label htmlFor="convert-account-name" className={LABEL_CLASS}>
            Account name
          </label>
          <input
            id="convert-account-name"
            type="text"
            value={accountName}
            onChange={(e) => onAccountName(e.target.value)}
            placeholder={placeholder}
            maxLength={200}
            className={INPUT_CLASS}
          />
        </div>
      )}
    </>
  );
}

interface DealFormState {
  dealValue: string;
  dealName: string;
  accountName: string;
  expectedCloseDate: string;
}

function DealFields({
  form,
  valueError,
  placeholder,
  onChange,
}: Readonly<{
  form: DealFormState;
  valueError: string | null;
  placeholder: string;
  onChange: (patch: Partial<DealFormState>) => void;
}>) {
  const currency = useTenantCurrency();
  return (
    <>
      <div>
        <label htmlFor="convert-deal-value" className={LABEL_CLASS}>
          Deal value ({currencySymbol(currency).trim()}){' '}
          <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="convert-deal-value"
          type="text"
          inputMode="numeric"
          value={form.dealValue}
          onChange={(e) => onChange({ dealValue: e.target.value })}
          placeholder="e.g. 5000"
          aria-invalid={valueError ? true : undefined}
          className={INPUT_CLASS}
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Whole {currency} amounts, for example 5000 for {formatMoney(5000, currency)}. Without a
          value the deal shows &quot;No value set&quot; and counts as {formatMoney(0, currency)} in
          revenue totals. Leave it empty only if you don&apos;t know it yet; you can add it on the
          deal later.
        </p>
        {valueError && (
          <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">
            {valueError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="convert-deal-name" className={LABEL_CLASS}>
          Deal name <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="convert-deal-name"
          type="text"
          value={form.dealName}
          onChange={(e) => onChange({ dealName: e.target.value })}
          maxLength={DEAL_NAME_MAX}
          placeholder="Generated from the lead if left empty"
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="convert-deal-account" className={LABEL_CLASS}>
          Account name <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="convert-deal-account"
          type="text"
          value={form.accountName}
          onChange={(e) => onChange({ accountName: e.target.value })}
          maxLength={200}
          placeholder={placeholder}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label htmlFor="convert-deal-close" className={LABEL_CLASS}>
          Expected close date <span className="text-xs font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="convert-deal-close"
          type="date"
          value={form.expectedCloseDate}
          onChange={(e) => onChange({ expectedCloseDate: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>
    </>
  );
}

const EMPTY_DEAL_FORM: DealFormState = {
  dealValue: '',
  dealName: '',
  accountName: '',
  expectedCloseDate: '',
};

/** The deal form, with the lead's own estimate (pence) pre-filled as whole pounds when it has one. */
function initialDealForm(estimatedValue: number | null | undefined): DealFormState {
  const pounds = estimatedValue && estimatedValue > 0 ? Math.round(estimatedValue / 100) : 0;
  return pounds > 0 ? { ...EMPTY_DEAL_FORM, dealValue: String(pounds) } : EMPTY_DEAL_FORM;
}

/** Converts a qualified lead to a contact, or to a contact plus a deal in the pipeline. */
export function ConvertLeadDialog({
  lead,
  userId,
  open,
  onOpenChange,
  initialMode = 'contact',
}: ConvertLeadDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<ConvertMode>(initialMode);
  const [createAccount, setCreateAccount] = useState(true);
  const [accountName, setAccountName] = useState('');
  const [deal, setDeal] = useState<DealFormState>(() => initialDealForm(lead.estimatedValue));
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const afterConversion = () => {
    if (userId) revalidateLeadConversionCaches(userId).catch(reportCacheRevalidationError);
    onOpenChange(false);
  };
  const onFailure = (message: string) => {
    const description = getConvertErrorDescription(message);
    setErrorMessage(description);
    toast({ title: 'Conversion failed', description, variant: 'destructive' });
  };

  const convertMutation = api.lead.convert.useMutation({
    onSuccess: (data) => {
      afterConversion();
      toast({ title: 'Lead converted', description: 'Lead has been converted to a contact.' });
      router.push(`/contacts/${data.contactId}`);
    },
    onError: (err) => onFailure(err.message),
  });

  const utils = api.useUtils();
  // MVP-003: "Undo" right after converting. Uses the plain client, since this page has
  // navigated to the deal by the time it is pressed.
  const undoFromToast = (opportunityId: string) => {
    undoConversion(utils.client, opportunityId, userId)
      .then((leadId) => {
        toast(UNDONE_TOAST);
        router.push(`/leads/${leadId}`);
      })
      .catch((err: unknown) =>
        toast({
          title: 'Could not undo the conversion',
          description: err instanceof Error ? err.message : undefined,
          variant: 'destructive',
        })
      );
  };

  const dealMutation = api.lead.convertToDeal.useMutation({
    onSuccess: (data) => {
      afterConversion();
      toast({
        title: 'Lead converted to a deal',
        description: 'The deal is at Prospecting. Open it to move it through the pipeline.',
        action: (
          <ToastAction altText="Undo conversion" onClick={() => undoFromToast(data.opportunityId)}>
            Undo
          </ToastAction>
        ),
      });
      router.push(`/deals/${data.opportunityId}`);
    },
    onError: (err) => onFailure(err.message),
  });

  const isPending = convertMutation.isPending || dealMutation.isPending;
  const valueError = submitted && mode === 'deal' ? validateDealValue(deal.dealValue) : null;

  const reset = () => {
    setMode(initialMode);
    setCreateAccount(true);
    setAccountName('');
    setDeal(initialDealForm(lead.estimatedValue));
    setSubmitted(false);
    setErrorMessage(null);
  };

  const handleConfirm = (event: React.MouseEvent) => {
    // Keep the dialog open so an error can be shown inside it.
    event.preventDefault();
    setErrorMessage(null);
    if (mode === 'contact') {
      convertMutation.mutate({
        leadId: lead.id,
        createAccount,
        accountName: createAccount && accountName.trim() ? accountName.trim() : undefined,
      });
      return;
    }
    setSubmitted(true);
    const payload = buildConvertToDealPayload(lead.id, deal);
    if (payload) dealMutation.mutate(payload);
  };

  const placeholder = lead.company || 'Company name';
  const contactName = contactNameFromLead(lead);
  const isDeal = mode === 'deal';

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDeal ? 'Convert Lead to Deal' : 'Convert Lead to Contact'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isDeal
              ? `Convert ${leadDisplayName(lead)} to a contact and open a deal. The lead status will change to CONVERTED. You can undo this from the deal until anything happens to it (a stage change, a task, an email or a call).`
              : `Convert ${leadDisplayName(lead)} to a contact record? This action will change the lead status to CONVERTED and cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {/* MVP-003: the name the contact will get, the same one the server uses. */}
          <p className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-medium">Contact:</span> {contactName.display}
            {lead.email && lead.email !== contactName.display && (
              <span className="text-slate-500 dark:text-slate-400"> ({lead.email})</span>
            )}
          </p>
          <ModeChoice mode={mode} onChange={setMode} />
          {isDeal ? (
            <DealFields
              form={deal}
              valueError={valueError}
              placeholder={placeholder}
              onChange={(patch) => setDeal((prev) => ({ ...prev, ...patch }))}
            />
          ) : (
            <ContactFields
              createAccount={createAccount}
              accountName={accountName}
              placeholder={placeholder}
              onCreateAccount={setCreateAccount}
              onAccountName={setAccountName}
            />
          )}
          {errorMessage && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {confirmLabel(isPending, isDeal)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function confirmLabel(isPending: boolean, isDeal: boolean): string {
  if (isPending) return 'Converting...';
  return isDeal ? 'Convert and create deal' : 'Convert Lead';
}
