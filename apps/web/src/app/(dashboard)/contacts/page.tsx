'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';

const placeholderContacts = [
  { id: '1', email: 'sarah.johnson@techcorp.com', firstName: 'Sarah', lastName: 'Johnson', company: 'TechCorp Inc.', title: 'VP of Engineering', phone: '+1-555-1234' },
  { id: '2', email: 'mike.chen@startup.io', firstName: 'Mike', lastName: 'Chen', company: 'Startup.io', title: 'CTO', phone: '+1-555-5678' },
];

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const filtered = placeholderContacts.filter((c) =>
    `${c.firstName} ${c.lastName} ${c.email} ${c.company}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Manage your customer contacts and relationships"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Contacts' }]}
        actions={
          <Link href="/contacts/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            + New Contact
          </Link>
        }
      />

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="divide-y">
          {filtered.map((contact) => (
            <div key={contact.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  {contact.firstName[0]}{contact.lastName[0]}
                </div>
                <div>
                  <p className="font-medium">{contact.firstName} {contact.lastName}</p>
                  <p className="text-sm text-muted-foreground">{contact.title} at {contact.company}</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <span className="hidden md:inline">{contact.email}</span>
                <span className="hidden lg:inline">{contact.phone}</span>
                <Link href={`/contacts/${contact.id}`} className="text-primary hover:underline">View</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
