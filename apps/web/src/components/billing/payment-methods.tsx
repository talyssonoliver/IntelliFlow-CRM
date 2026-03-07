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
import { useState, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Input,
  cn,
} from '@intelliflow/ui';
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  Elements,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/lib/auth/AuthContext';
import { stripePromise } from '@/lib/billing/stripe-client';
import {
  getCardDisplayInfo,
  sortPaymentMethods,
  canRemoveCard,
  formatCardDisplayString,
  formatMaskedCardNumber,
} from '@/lib/billing/card-manager';
import type { BillingPaymentMethod } from '@/lib/billing/stripe-portal';

// ============================================
// Types
// ============================================

interface PaymentMethodsProps {
  className?: string;
}

/** Stripe Elements styling to match shadcn input look */
const stripeElementStyle = {
  style: {
    base: {
      fontSize: '14px',
      color: 'hsl(var(--foreground))',
      '::placeholder': { color: 'hsl(var(--muted-foreground))' },
    },
    invalid: { color: 'hsl(var(--destructive))' },
  },
};

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
}: Readonly<PaymentMethodCardProps>) {
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
        <p className="text-sm text-muted-foreground mt-0.5">Expires {expiry}</p>
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
function EmptyState({ onAddCard }: Readonly<{ onAddCard: () => void }>) {
  return (
    <div className="text-center py-12">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <span className="material-symbols-outlined text-3xl text-slate-400" aria-hidden="true">
          credit_card_off
        </span>
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">No payment methods</h3>
      <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
        Add a payment method to manage your subscription and make purchases.
      </p>
      <Button onClick={onAddCard}>
        <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
          add
        </span>{' '}
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
        <div
          key={i}
          className="flex items-center gap-4 p-4 rounded-lg border border-slate-200 dark:border-slate-700"
        >
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
 * Add Card Dialog — Inner form (must be inside <Elements>)
 */
interface AddCardFormProps {
  onSuccess: (paymentMethodId: string) => void;
  onClose: () => void;
  isAdding: boolean;
  setIsAdding: (v: boolean) => void;
}

function AddCardForm({ onSuccess, onClose, isAdding, setIsAdding }: Readonly<AddCardFormProps>) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardholderName, setCardholderName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setFormError(null);
    setIsAdding(true);

    try {
      const cardElement = elements.getElement(CardNumberElement);
      if (!cardElement) {
        setFormError('Card element not ready');
        setIsAdding(false);
        return;
      }

      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: { name: cardholderName || undefined },
      });

      if (error) {
        setFormError(error.message ?? 'Failed to create payment method');
        setIsAdding(false);
        return;
      }

      if (paymentMethod) {
        onSuccess(paymentMethod.id);
        setCardholderName('');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add card');
      setIsAdding(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 py-4">
        {formError && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                error
              </span>{' '}
              {formError}
            </div>
          </div>
        )}

        {/* Card Number — Stripe Element */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Card Number</p>
          <div className="h-10 rounded-md border border-input bg-background px-3 py-2.5">
            <CardNumberElement options={stripeElementStyle} />
          </div>
        </div>

        {/* Expiry and CVC — Stripe Elements */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Expiry Date</p>
            <div className="h-10 rounded-md border border-input bg-background px-3 py-2.5">
              <CardExpiryElement options={stripeElementStyle} />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">CVC</p>
            <div className="h-10 rounded-md border border-input bg-background px-3 py-2.5">
              <CardCvcElement options={stripeElementStyle} />
            </div>
          </div>
        </div>

        {/* Cardholder Name — regular Input (not PCI scope) */}
        <div className="space-y-1.5">
          <label htmlFor="billing-cardholder-name" className="text-sm font-medium">
            Cardholder Name
          </label>
          <Input
            id="billing-cardholder-name"
            type="text"
            autoComplete="cc-name"
            placeholder="John Doe"
            value={cardholderName}
            onChange={(e) => setCardholderName(e.target.value)}
            disabled={isAdding}
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isAdding}>
          Cancel
        </Button>
        <Button type="submit" disabled={isAdding || !stripe}>
          {isAdding ? (
            <>
              <span
                className="material-symbols-outlined animate-spin text-lg mr-2"
                aria-hidden="true"
              >
                progress_activity
              </span>{' '}
              Adding...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
                add
              </span>{' '}
              Add Card
            </>
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Add Card Dialog
 */
interface AddCardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSuccess: (paymentMethodId: string) => void;
  isAdding: boolean;
  setIsAdding: (v: boolean) => void;
}

function AddCardDialog({
  isOpen,
  onClose,
  onAddSuccess,
  isAdding,
  setIsAdding,
}: Readonly<AddCardDialogProps>) {
  const handleClose = () => {
    if (!isAdding) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>
            Enter your card details below. Your information is encrypted and secure.
          </DialogDescription>
        </DialogHeader>
        {stripePromise === null ? (
          <div className="py-4 text-center text-muted-foreground text-sm">
            <p>Payment processing is not configured. Please contact support.</p>
          </div>
        ) : (
          <Elements stripe={stripePromise}>
            <AddCardForm
              onSuccess={onAddSuccess}
              onClose={handleClose}
              isAdding={isAdding}
              setIsAdding={setIsAdding}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Remove Card Confirmation Dialog (shadcn AlertDialog)
 */
interface RemoveCardDialogProps {
  isOpen: boolean;
  card: BillingPaymentMethod | null;
  onClose: () => void;
  onConfirm: () => void;
  isRemoving: boolean;
  warningMessage?: string;
  canRemove?: boolean;
}

function RemoveCardDialog({
  isOpen,
  card,
  onClose,
  onConfirm,
  isRemoving,
  warningMessage,
  canRemove = true,
}: Readonly<RemoveCardDialogProps>) {
  if (!card?.card) return null;

  const displayString = formatCardDisplayString(card.card.brand, card.card.last4);

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && !isRemoving && onClose()}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader className="text-center">
          {/* Icon */}
          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-destructive/10 flex items-center justify-center">
            <span
              className="material-symbols-outlined text-2xl text-destructive"
              aria-hidden="true"
            >
              delete
            </span>
          </div>
          <AlertDialogTitle>Remove Payment Method?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove{' '}<strong>{displayString}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Warning */}
        {warningMessage && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-left">
            <div className="flex items-start gap-2">
              <span
                className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-lg flex-shrink-0"
                aria-hidden="true"
              >
                warning
              </span>
              <p className="text-sm text-amber-700 dark:text-amber-300">{warningMessage}</p>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isRemoving || !canRemove}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRemoving ? (
              <>
                <span
                  className="material-symbols-outlined animate-spin text-lg mr-2"
                  aria-hidden="true"
                >
                  progress_activity
                </span>{' '}
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================
// Main Component
// ============================================

export function PaymentMethods({ className }: Readonly<PaymentMethodsProps>) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  // State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [removeCard, setRemoveCard] = useState<BillingPaymentMethod | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // tRPC queries and mutations
  const {
    data: paymentMethods,
    isLoading,
    error,
  } = trpc.billing.getPaymentMethods.useQuery(undefined, {
    enabled: isAuthenticated && !authLoading,
  });

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
  const handleSetDefault = useCallback(
    async (paymentMethodId: string) => {
      setSettingDefaultId(paymentMethodId);
      try {
        await updatePaymentMethodMutation.mutateAsync({ paymentMethodId, setAsDefault: true });
      } finally {
        setSettingDefaultId(null);
      }
    },
    [updatePaymentMethodMutation]
  );

  const handleRemoveClick = useCallback(
    (paymentMethodId: string) => {
      const card = paymentMethods?.find((pm) => pm.id === paymentMethodId);
      if (card) {
        setRemoveCard(card);
      }
    },
    [paymentMethods]
  );

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

  const [isAddingCard, setIsAddingCard] = useState(false);

  const handleAddCardSuccess = useCallback(
    async (paymentMethodId: string) => {
      try {
        await updatePaymentMethodMutation.mutateAsync({
          paymentMethodId,
          setAsDefault: !paymentMethods || paymentMethods.length === 0,
        });
        setIsAddDialogOpen(false);
      } catch {
        // Error handled by mutation onError callback
      } finally {
        setIsAddingCard(false);
      }
    },
    [updatePaymentMethodMutation, paymentMethods]
  );

  // Get sorted payment methods
  const sortedPaymentMethods = paymentMethods ? sortPaymentMethods(paymentMethods) : [];

  // Get remove check result (subscription-aware)
  const removeCheck =
    removeCard && paymentMethods
      ? canRemoveCard(removeCard.id, paymentMethods)
      : { canRemove: true };

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
              <CardDescription className="mt-1">Manage your saved payment methods</CardDescription>
            </div>
            {!isLoading && paymentMethods && paymentMethods.length > 0 && (
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <span className="material-symbols-outlined text-lg mr-2" aria-hidden="true">
                  add
                </span>{' '}
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
              <Button
                variant="outline"
                onClick={() => utils.billing.getPaymentMethods.invalidate()}
              >
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
        onAddSuccess={handleAddCardSuccess}
        isAdding={isAddingCard}
        setIsAdding={setIsAddingCard}
      />

      {/* Remove Card Dialog */}
      <RemoveCardDialog
        isOpen={!!removeCard}
        card={removeCard}
        onClose={() => setRemoveCard(null)}
        onConfirm={handleRemoveConfirm}
        isRemoving={!!removingId}
        warningMessage={removeCheck.reason}
        canRemove={removeCheck.canRemove}
      />
    </div>
  );
}
