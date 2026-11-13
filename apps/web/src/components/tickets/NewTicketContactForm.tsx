'use client';

/**
 * NewTicketContactForm — the create-ticket form, pre-filled from a contact
 * when the page is opened with ?contactId= (from a contact's Tickets tab).
 *
 * The contact is read with contact.getById, which is tenant-scoped on the
 * server: an id from another tenant, or one that does not exist, comes back
 * NOT_FOUND, and the form opens empty with a note saying so. A found contact's
 * id goes with the new ticket, so it shows on that contact's Tickets tab.
 */

import { api } from '@/lib/api';
import { TicketForm } from './TicketForm';

export interface NewTicketContactFormProps {
  contactId: string | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

interface PrefillContact {
  id?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function contactPrefill(contact: PrefillContact) {
  return {
    contactName: [contact.firstName, contact.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' '),
    contactEmail: contact.email?.trim() ?? '',
  };
}

const sameEmail = (a: unknown, b: unknown) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.trim() !== '' &&
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Links the ticket to the looked-up contact only while the email sent is still
 * that contact's. If the user typed someone else's email, the ticket is not
 * linked: the server matches activity and duplicates by email, and the
 * Tickets tab by id, so both must name the same person.
 */
export function withLinkedContact(
  data: Record<string, unknown>,
  contact: PrefillContact
): Record<string, unknown> {
  if (!contact.id || !sameEmail(data.contactEmail, contact.email)) return data;
  return { ...data, contactId: contact.id };
}

export function NewTicketContactForm({
  contactId,
  onSubmit,
  onCancel,
  isSubmitting,
}: Readonly<NewTicketContactFormProps>) {
  const contactQuery = api.contact.getById.useQuery(
    { id: contactId ?? '' },
    { enabled: Boolean(contactId), retry: false }
  );

  const form = (initialData?: ReturnType<typeof contactPrefill>, linked?: PrefillContact) => (
    <TicketForm
      mode="create"
      initialData={initialData}
      onSubmit={linked ? (data) => onSubmit(withLinkedContact(data, linked)) : onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
    />
  );

  if (!contactId) return form();

  // TicketForm reads initialData once, so wait for the contact before mounting it.
  if (contactQuery.isLoading) {
    return (
      <output data-testid="ticket-contact-loading" className="block text-sm text-muted-foreground">
        Loading contact…
      </output>
    );
  }

  // Loaded data wins over a later failed refetch (TanStack keeps the last good
  // data and still sets isError), so the form the user is filling is never
  // swapped for an empty one.
  if (contactQuery.data) {
    const contact = contactQuery.data as PrefillContact;
    // The id comes from the tenant-checked lookup, not straight from the URL.
    return form(contactPrefill(contact), contact);
  }

  return (
    <div className="flex flex-col gap-4">
      <p
        role="alert"
        data-testid="ticket-contact-missing"
        className="text-sm text-muted-foreground"
      >
        We couldn&apos;t find that contact. Enter the contact&apos;s details below.
      </p>
      {form()}
    </div>
  );
}
