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
import { api } from '@/lib/api';

export interface ContactAddSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly accountId: string;
  readonly accountName?: string;
  readonly onSuccess?: () => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const DEFAULT_FORM: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
};

export function ContactAddSheet({
  open,
  onOpenChange,
  accountId,
  accountName,
  onSuccess,
}: Readonly<ContactAddSheetProps>) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const utils = api.useUtils();
  const createMutation = api.contact.create.useMutation({
    onSuccess: () => {
      utils.account.getContacts.invalidate({ accountId });
      utils.account.getById.invalidate({ id: accountId });
      toast({
        title: 'Contact created',
        description: `${form.firstName} ${form.lastName} has been added.`,
      });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      const desc =
        error.message.includes('not found') || error.message.includes('foreign key')
          ? 'Account may have been deleted. Please refresh.'
          : error.message;
      toast({ title: 'Failed to create contact', description: desc, variant: 'destructive' });
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
    if (!form.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!form.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!form.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Invalid email format';
    }
    if (!form.phone.trim()) {
      newErrors.phone = 'Phone is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!validate()) return;

    createMutation.mutate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      accountId,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>Add Contact</SheetTitle>
        <SheetDescription>
          Create a new contact{accountName ? ` linked to ${accountName}` : ''}.
        </SheetDescription>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="contact-first-name">First Name *</Label>
            <Input
              id="contact-first-name"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? 'contact-first-name-error' : undefined}
              placeholder="First name"
            />
            {errors.firstName && (
              <p id="contact-first-name-error" className="text-sm text-destructive mt-1">
                {errors.firstName}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="contact-last-name">Last Name *</Label>
            <Input
              id="contact-last-name"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? 'contact-last-name-error' : undefined}
              placeholder="Last name"
            />
            {errors.lastName && (
              <p id="contact-last-name-error" className="text-sm text-destructive mt-1">
                {errors.lastName}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="contact-email">Email *</Label>
            <Input
              id="contact-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'contact-email-error' : undefined}
              placeholder="email@example.com"
            />
            {errors.email && (
              <p id="contact-email-error" className="text-sm text-destructive mt-1">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="contact-phone">Phone *</Label>
            <Input
              id="contact-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'contact-phone-error' : undefined}
              placeholder="+1 (555) 000-0000"
            />
            {errors.phone && (
              <p id="contact-phone-error" className="text-sm text-destructive mt-1">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Contact'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
