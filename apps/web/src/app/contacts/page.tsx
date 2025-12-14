'use client';

import { useState } from 'react';

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  title: string | null;
  phone: string | null;
  department: string | null;
}

// Placeholder data until API is connected
const placeholderContacts: Contact[] = [
  {
    id: '1',
    email: 'sarah.johnson@techcorp.com',
    firstName: 'Sarah',
    lastName: 'Johnson',
    company: 'TechCorp Inc.',
    title: 'VP of Engineering',
    phone: '+1-555-1234',
    department: 'Engineering',
  },
  {
    id: '2',
    email: 'mike.chen@startup.io',
    firstName: 'Mike',
    lastName: 'Chen',
    company: 'Startup.io',
    title: 'CTO',
    phone: '+1-555-5678',
    department: 'Technology',
  },
];

export default function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredContacts = placeholderContacts.filter(
    (contact) =>
      contact.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/dashboard" className="text-xl font-bold text-gray-900 dark:text-white">
              IntelliFlow CRM
            </a>
            <div className="flex items-center space-x-4">
              <a href="/leads" className="text-gray-600 dark:text-gray-300">Leads</a>
              <a href="/contacts" className="text-primary font-medium">Contacts</a>
              <a href="/analytics" className="text-gray-600 dark:text-gray-300">Analytics</a>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Contacts
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Manage your customer contacts and relationships
            </p>
          </div>
          <button className="px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
            + New Contact
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="grid gap-4 p-4">
            {filteredContacts.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function ContactCard({ contact }: { contact: Contact }) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
      <div className="flex items-center space-x-4">
        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
          <span className="text-lg font-semibold text-primary">
            {contact.firstName[0]}
            {contact.lastName[0]}
          </span>
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white">
            {contact.firstName} {contact.lastName}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {contact.title} at {contact.company}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
        <span>{contact.email}</span>
        <span>{contact.phone}</span>
        <button className="text-primary hover:underline">View</button>
      </div>
    </div>
  );
}
