'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, EmptyState, Skeleton, Badge } from '@intelliflow/ui';
import { api } from '@/lib/api';
import type { ContactStatus } from '@intelliflow/domain';

const CONTACTS_SKELETON_KEYS = [
  'contact-0',
  'contact-1',
  'contact-2',
  'contact-3',
  'contact-4',
] as const;

interface AccountContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
}

interface AccountContactsListProps {
  accountId: string;
  onAddContact?: () => void;
}

export function AccountContactsList({
  accountId,
  onAddContact,
}: Readonly<AccountContactsListProps>) {
  const router = useRouter();
  const [cursor, setCursor] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<ContactStatus | undefined>();

  const { data, isLoading, error } = api.account.getContacts.useQuery({
    accountId,
    limit: 20,
    cursor,
    status: statusFilter ? [statusFilter] : undefined,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {CONTACTS_SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <span className="material-symbols-outlined text-3xl mb-2">error</span>
        <p className="text-sm">Failed to load contacts</p>
      </div>
    );
  }

  const contacts: AccountContact[] = data?.contacts ?? [];

  if (contacts.length === 0 && !statusFilter) {
    return (
      <>
        <EmptyState entity="contacts" phase="passive" className="py-4" />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={onAddContact} type="button">
            <span className="material-symbols-outlined text-base mr-1">person_add</span> Add Contact
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <select
          className="text-sm border rounded-md px-2 py-1 bg-background text-foreground"
          value={statusFilter ?? ''}
          onChange={(e) => {
            setStatusFilter((e.target.value || undefined) as ContactStatus | undefined);
            setCursor(undefined);
          }}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="LEAD">Lead</option>
        </select>
        <Button variant="outline" size="sm" onClick={onAddContact} type="button">
          <span className="material-symbols-outlined text-base mr-1">person_add</span> Add Contact
        </Button>
      </div>

      <div className="border rounded-lg divide-y dark:divide-border">
        {contacts.map((contact) => (
          <button
            key={contact.id}
            className="flex items-center gap-4 px-4 py-3 w-full text-left hover:bg-muted/50 transition-colors"
            onClick={() => router.push(`/contacts/${contact.id}`)}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
              {contact.firstName[0]}
              {contact.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {contact.firstName} {contact.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {contact.status}
            </Badge>
          </button>
        ))}
      </div>

      {data?.nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(data.nextCursor)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
