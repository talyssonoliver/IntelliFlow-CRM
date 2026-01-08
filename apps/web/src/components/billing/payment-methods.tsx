'use client';

/**
 * Payment Methods Component
 *
 * Full payment methods management UI with:
 * - List all payment methods with default indicator
 * - Set default payment method
 * - Remove payment method (with confirmation)
 * - Add new card (dialog with form)
 * - Expiring card warnings
 *
 * @implements PG-029 (Payment Methods)
 */

import * as React from 'react';
import { useState, useCallback, useId } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Skeleton,
  cn,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import {
  getCardDisplayInfo,
  sortPaymentMethods,
  canRemoveCard,
  formatCardDisplayString,
  formatMaskedCardNumber,
} from '@/lib/billing/card-manager';
import {
  formatCardNumber,
  formatExpiry,
  detectCardBrand,
  validateCardDetails,
  type CardDetails,
} from '@/lib/billing/payment-processor';
import type { BillingPaymentMethod } from '@/lib/billing/stripe-portal';

// ============================================
// Types
// ============================================

interface PaymentMethodsProps {
  className?: string;
}

interface CardFormState {
  cardNumber: string;
  expiry: string;
  cvc: string;
  name: string;
}

// ============================================
// Sub-Components
// ============================================

/**
 * Individual Payment Method Card
 */
interface PaymentMethodCardProps {
  paymentMethod: BillingPaymentMethod;
  onSetDefault: (id: string) => void;
  onRemove: (id: string) => void;
  isSettingDefault: boolean;
  isRemoving: boolean;
}

function PaymentMethodCard({
  paymentMethod,
  onSetDefault,
  onRemove,
  isSettingDefault,
  isRemoving,
}: PaymentMethodCardProps) {
  const displayInfo = getCardDisplayInfo(paymentMethod);

  if (!displayInfo) {
    return null;
  }

  const { brandName, last4, expiry, status, isDefault } = displayInfo;
  const isActionInProgress = isSettingDefault || isRemoving;

  return (
    <div
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border transition-colors',
        isDefault
          ? 'bg-primary/5 border-primary/20 dark:bg-primary/10'
          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
        status.isExpired && 'border-destructive/30 bg-destructive/5'
      )}
    >
      {/* Card Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-12 h-8 rounded flex items-center justify-center',
          'bg-slate-100 dark:bg-slate-700'
        )}
      >
        <span
          className={cn(
            'material-symbols-outlined text-2xl',
            isDefault ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
          )}
          aria-hidden="true"
        >
          credit_card
        </span>
      </div>

      {/* Card Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {brandName} {formatMaskedCardNumber(last4).slice(-9)}
          </span>
          {isDefault && (
            <Badge variant="secondary" className="text-xs">
              Default
            </Badge>
          )}
          {status.isExpired && (
            <Badge variant="destructive" className="text-xs">
              Expired
            </Badge>
          )}
          {status.isExpiringSoon && !status.isExpired && (
            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
              Expiring Soon
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Expires {expiry}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Set Default */}
        {!isDefault && !status.isExpired && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSetDefault(paymentMethod.id)}
            disabled={isActionInProgress}
            title="Set as default"
            className="h-8 w-8 p-0"
          >
            {isSettingDefault ? (
              <span className="material-symbols-outlined animate-spin text-lg" aria-hidden="true">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-lg text-amber-500" aria-hidden="true">
                star
              </span>
            )}
            <span className="sr-only">Set as default</span>
          </Button>
        )}

        {/* Remove */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(paymentMethod.id)}
          disabled={isActionInProgress}
          title="Remove card"
          className="h-8 w-8 p-0 hover:text-destructive hover:bg-destructive/10"
        >
          {isRemoving ? (
            <span className="material-symbols-outlined animate-spin text-lg" aria-hidden="true">
              progress_activity
            </span>
          ) : (
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              delete
            </span>
          )}
          <span className="sr-only">Remove card</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Empty State Component
 */
function EmptyState({ onAddCard }: { onAddCard: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <span
          className="material-symbols-outlined text-3xl text-slate-400"
          aria-hidden="true"
        >
          credit_card_off
        </span>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        No payment methods
      </h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
        Add a payment method to manage your subscription and make purchases.
      </p>
      <Button onClick={onAddCard}>
        <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
          add
        </span>
        Add Payment Method
      </Button>
    </div>
  );
}

/**
 * Loading Skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <Skeleton className="w-12 h-8 rounded" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * Add Card Dialog
 */
interface AddCardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (cardDetails: CardDetails) => Promise<void>;
  isAdding: boolean;
}

function AddCardDialog({ isOpen, onClose, onAdd, isAdding }: AddCardDialogProps) {
  const formId = useId();
  const [formState, setFormState] = useState<CardFormState>({
    cardNumber: '',
    expiry: '',
    cvc: '',
    name: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CardFormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const cardBrand = detectCardBrand(formState.cardNumber);

  const handleInputChange = useCallback(
    (field: keyof CardFormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value;

      if (field === 'cardNumber') {
        value = formatCardNumber(value);
      } else if (field === 'expiry') {
        value = formatExpiry(value);
      } else if (field === 'cvc') {
        value = value.replace(/\D/g, '').slice(0, cardBrand === 'amex' ? 4 : 3);
      }

      setFormState((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [cardBrand, errors]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cardDetails: CardDetails = {
      number: formState.cardNumber,
      expiry: formState.expiry,
      cvc: formState.cvc,
      name: formState.name,
    };

    const validation = validateCardDetails(cardDetails);
    if (!validation.valid) {
      setErrors({
        cardNumber: validation.errors.number,
        expiry: validation.errors.expiry,
        cvc: validation.errors.cvc,
        name: validation.errors.name,
      });
      return;
    }

    try {
      await onAdd(cardDetails);
      // Reset form on success
      setFormState({ cardNumber: '', expiry: '', cvc: '', name: '' });
      setErrors({});
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to add card');
    }
  };

  const handleClose = () => {
    if (!isAdding) {
      setFormState({ cardNumber: '', expiry: '', cvc: '', name: '' });
      setErrors({});
      setFormError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-card-title"
        className="relative bg-background rounded-xl shadow-xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 id="add-card-title" className="text-lg font-semibold">
            Add Payment Method
          </h2>
          <button
            onClick={handleClose}
            disabled={isAdding}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Form Error */}
          {formError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  error
                </span>
                {formError}
              </div>
            </div>
          )}

          {/* Card Number */}
          <div className="space-y-1.5">
            <label htmlFor={`${formId}-number`} className="text-sm font-medium">
              Card Number
            </label>
            <div className="relative">
              <input
                id={`${formId}-number`}
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                value={formState.cardNumber}
                onChange={handleInputChange('cardNumber')}
                disabled={isAdding}
                className={cn(
                  'flex h-10 w-full rounded-md border bg-background px-3 py-2 pr-12 text-sm',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  errors.cardNumber ? 'border-destructive' : 'border-input'
                )}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <span className="material-symbols-outlined text-xl" aria-hidden="true">
                  credit_card
                </span>
              </div>
            </div>
            {errors.cardNumber && (
              <p className="text-sm text-destructive">{errors.cardNumber}</p>
            )}
          </div>

          {/* Expiry and CVC */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-expiry`} className="text-sm font-medium">
                Expiry Date
              </label>
              <input
                id={`${formId}-expiry`}
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={formState.expiry}
                onChange={handleInputChange('expiry')}
                disabled={isAdding}
                className={cn(
                  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  errors.expiry ? 'border-destructive' : 'border-input'
                )}
              />
              {errors.expiry && (
                <p className="text-sm text-destructive">{errors.expiry}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${formId}-cvc`} className="text-sm font-medium">
                CVC
              </label>
              <input
                id={`${formId}-cvc`}
                type="password"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder={cardBrand === 'amex' ? '1234' : '123'}
                value={formState.cvc}
                onChange={handleInputChange('cvc')}
                disabled={isAdding}
                className={cn(
                  'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  errors.cvc ? 'border-destructive' : 'border-input'
                )}
              />
              {errors.cvc && (
                <p className="text-sm text-destructive">{errors.cvc}</p>
              )}
            </div>
          </div>

          {/* Cardholder Name */}
          <div className="space-y-1.5">
            <label htmlFor={`${formId}-name`} className="text-sm font-medium">
              Cardholder Name
            </label>
            <input
              id={`${formId}-name`}
              type="text"
              autoComplete="cc-name"
              placeholder="John Doe"
              value={formState.name}
              onChange={handleInputChange('name')}
              disabled={isAdding}
              className={cn(
                'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm',
                'placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                errors.name ? 'border-destructive' : 'border-input'
              )}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/50">
          <Button variant="outline" onClick={handleClose} disabled={isAdding}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isAdding}>
            {isAdding ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg mr-2" aria-hidden="true">
                  progress_activity
                </span>
                Adding...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
                  add
                </span>
                Add Card
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Remove Card Confirmation Dialog
 */
interface RemoveCardDialogProps {
  isOpen: boolean;
  card: BillingPaymentMethod | null;
  onClose: () => void;
  onConfirm: () => void;
  isRemoving: boolean;
  warningMessage?: string;
}

function RemoveCardDialog({
  isOpen,
  card,
  onClose,
  onConfirm,
  isRemoving,
  warningMessage,
}: RemoveCardDialogProps) {
  if (!isOpen || !card?.card) return null;

  const displayString = formatCardDisplayString(card.card.brand, card.card.last4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isRemoving && onClose()}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-card-title"
        aria-describedby="remove-card-description"
        className="relative bg-background rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
      >
        <div className="px-6 py-6 text-center">
          {/* Icon */}
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <span
              className="material-symbols-outlined text-2xl text-destructive"
              aria-hidden="true"
            >
              delete
            </span>
          </div>

          {/* Title */}
          <h2 id="remove-card-title" className="text-lg font-semibold mb-2">
            Remove Payment Method?
          </h2>

          {/* Description */}
          <p id="remove-card-description" className="text-muted-foreground text-sm mb-4">
            Are you sure you want to remove <strong>{displayString}</strong>?
          </p>

          {/* Warning */}
          {warningMessage && (
            <div className="p-3 mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-left">
              <div className="flex items-start gap-2">
                <span
                  className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg flex-shrink-0"
                  aria-hidden="true"
                >
                  warning
                </span>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {warningMessage}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={isRemoving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={onConfirm}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg mr-2" aria-hidden="true">
                    progress_activity
                  </span>
                  Removing...
                </>
              ) : (
                'Remove'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function PaymentMethods({ className }: PaymentMethodsProps) {
  const utils = trpc.useUtils();

  // State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [removeCard, setRemoveCard] = useState<BillingPaymentMethod | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // tRPC queries and mutations
  const { data: paymentMethods, isLoading, error } = trpc.billing.getPaymentMethods.useQuery();

  const updatePaymentMethodMutation = trpc.billing.updatePaymentMethod.useMutation({
    onSuccess: () => {
      utils.billing.getPaymentMethods.invalidate();
      showToast('success', 'Default payment method updated');
    },
    onError: (error) => {
      showToast('error', error.message || 'Failed to update payment method');
    },
  });

  const removePaymentMethodMutation = trpc.billing.removePaymentMethod.useMutation({
    onSuccess: () => {
      utils.billing.getPaymentMethods.invalidate();
      showToast('success', 'Payment method removed');
    },
    onError: (error) => {
      showToast('error', error.message || 'Failed to remove payment method');
    },
  });

  // Toast helper
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Handlers
  const handleSetDefault = useCallback(async (paymentMethodId: string) => {
    setSettingDefaultId(paymentMethodId);
    try {
      await updatePaymentMethodMutation.mutateAsync({ paymentMethodId });
    } finally {
      setSettingDefaultId(null);
    }
  }, [updatePaymentMethodMutation]);

  const handleRemoveClick = useCallback((paymentMethodId: string) => {
    const card = paymentMethods?.find((pm) => pm.id === paymentMethodId);
    if (card) {
      setRemoveCard(card);
    }
  }, [paymentMethods]);

  const handleRemoveConfirm = useCallback(async () => {
    if (!removeCard) return;

    setRemovingId(removeCard.id);
    try {
      await removePaymentMethodMutation.mutateAsync({ paymentMethodId: removeCard.id });
      setRemoveCard(null);
    } finally {
      setRemovingId(null);
    }
  }, [removeCard, removePaymentMethodMutation]);

  const handleAddCard = useCallback(async (_cardDetails: CardDetails) => {
    // In real implementation, this would:
    // 1. Create payment method via Stripe.js
    // 2. Call tRPC endpoint with payment method ID
    // For now, simulate with mock payment method ID
    const mockPaymentMethodId = `pm_${Date.now()}`;

    await updatePaymentMethodMutation.mutateAsync({ paymentMethodId: mockPaymentMethodId });
    setIsAddDialogOpen(false);
  }, [updatePaymentMethodMutation]);

  // Get sorted payment methods
  const sortedPaymentMethods = paymentMethods ? sortPaymentMethods(paymentMethods) : [];

  // Get remove warning message
  const removeWarning = removeCard && paymentMethods
    ? canRemoveCard(removeCard.id, paymentMethods).reason
    : undefined;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Toast Notification */}
      {toast && (
        <div
          role="alert"
          className={cn(
            'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2',
            'animate-in slide-in-from-top-2 fade-in',
            toast.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          )}
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription className="mt-1">
                Manage your saved payment methods
              </CardDescription>
            </div>
            {!isLoading && paymentMethods && paymentMethods.length > 0 && (
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
                  add
                </span>
                Add Card
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Loading State */}
          {isLoading && <LoadingSkeleton />}

          {/* Error State */}
          {error && (
            <div className="text-center py-8">
              <span
                className="material-symbols-outlined text-4xl text-destructive mb-2 block"
                aria-hidden="true"
              >
                error
              </span>
              <p className="text-destructive mb-4">Failed to load payment methods</p>
              <Button variant="outline" onClick={() => utils.billing.getPaymentMethods.invalidate()}>
                Try Again
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && sortedPaymentMethods.length === 0 && (
            <EmptyState onAddCard={() => setIsAddDialogOpen(true)} />
          )}

          {/* Payment Methods List */}
          {!isLoading && !error && sortedPaymentMethods.length > 0 && (
            <div className="space-y-3">
              {sortedPaymentMethods.map((pm) => (
                <PaymentMethodCard
                  key={pm.id}
                  paymentMethod={pm}
                  onSetDefault={handleSetDefault}
                  onRemove={handleRemoveClick}
                  isSettingDefault={settingDefaultId === pm.id}
                  isRemoving={removingId === pm.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Note */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          lock
        </span>
        <span>Your payment information is encrypted and secure</span>
      </div>

      {/* Add Card Dialog */}
      <AddCardDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onAdd={handleAddCard}
        isAdding={updatePaymentMethodMutation.isPending}
      />

      {/* Remove Card Dialog */}
      <RemoveCardDialog
        isOpen={!!removeCard}
        card={removeCard}
        onClose={() => setRemoveCard(null)}
        onConfirm={handleRemoveConfirm}
        isRemoving={!!removingId}
        warningMessage={removeWarning}
      />
    </div>
  );
}

export default PaymentMethods;
