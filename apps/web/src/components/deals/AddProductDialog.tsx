/**
 * AddProductDialog — #421 (IFC-280 deferred)
 *
 * Small form dialog backing the deal detail page's "Add product" (+) button
 * on ProductsCard. Mirrors LossReasonModal's shape (controlled open/confirm/
 * cancel, local field state reset on cancel).
 */

import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@intelliflow/ui';

export interface AddProductFormData {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

interface AddProductDialogProps {
  readonly open: boolean;
  readonly onSubmit: (data: AddProductFormData) => void;
  readonly onCancel: () => void;
  readonly isSubmitting?: boolean;
}

const EMPTY_FORM: AddProductFormData = { name: '', description: '', quantity: 1, unitPrice: 0 };

export const AddProductDialog = React.memo(function AddProductDialog({
  open,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: Readonly<AddProductDialogProps>) {
  const [form, setForm] = useState<AddProductFormData>(EMPTY_FORM);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      nameInputRef.current?.focus();
    }
  }, [open]);

  const isValid = form.name.trim().length > 0 && form.quantity > 0 && form.unitPrice > 0;

  const handleCancel = () => {
    setForm(EMPTY_FORM);
    onCancel();
  };

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({ ...form, name: form.name.trim(), description: form.description.trim() });
  };

  const totalPrice = form.quantity * form.unitPrice;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
          <DialogDescription>Add a line item to this deal.</DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <div>
            <label
              htmlFor="product-name-input"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Name
            </label>
            <input
              id="product-name-input"
              ref={nameInputRef}
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Product or service name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <label
              htmlFor="product-description-input"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Description (optional)
            </label>
            <input
              id="product-description-input"
              type="text"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="product-quantity-input"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Quantity
              </label>
              <input
                id="product-quantity-input"
                type="number"
                min={1}
                step={1}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.quantity}
                onChange={(e) =>
                  setForm((f) => ({ ...f, quantity: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </div>
            <div>
              <label
                htmlFor="product-unit-price-input"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Unit price (GBP)
              </label>
              <input
                id="product-unit-price-input"
                type="number"
                min={0}
                step={0.01}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.unitPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unitPrice: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Total:{' '}
            {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
              totalPrice
            )}
          </p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Adding…' : 'Add Product'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
