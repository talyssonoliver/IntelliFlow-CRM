'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string | null;
  industry: string | null;
  title: string | null;
  phone: string | null;
  deals: { count: number; status: 'open' | 'closed' } | null;
  tickets: { count: number; status: 'pending' | 'urgent' } | null;
}

// Placeholder data until API is connected
const placeholderContacts: Contact[] = [
  {
    id: '1',
    email: 'sarah@techcorp.com',
    firstName: 'Sarah',
    lastName: 'Miller',
    company: 'TechCorp',
    industry: 'Software',
    title: 'CTO',
    phone: '+1 (555) 123-4567',
    deals: { count: 2, status: 'open' },
    tickets: null,
  },
  {
    id: '2',
    email: 'd.chen@designco.com',
    firstName: 'David',
    lastName: 'Chen',
    company: 'DesignCo',
    industry: 'Creative Agency',
    title: 'Manager',
    phone: '+1 (555) 987-6543',
    deals: null,
    tickets: null,
  },
  {
    id: '3',
    email: 'amanda@gmail.com',
    firstName: 'Amanda',
    lastName: 'Smith',
    company: 'Smith Consulting',
    industry: 'Consulting',
    title: 'Freelance Consultant',
    phone: '+1 (555) 321-7890',
    deals: null,
    tickets: { count: 1, status: 'pending' },
  },
  {
    id: '4',
    email: 'j.wilson@globalsoft.com',
    firstName: 'James',
    lastName: 'Wilson',
    company: 'GlobalSoft',
    industry: 'Enterprise',
    title: 'VP Sales',
    phone: '+1 (555) 456-7890',
    deals: { count: 3, status: 'closed' },
    tickets: null,
  },
  {
    id: '5',
    email: 'elena@fintech.io',
    firstName: 'Elena',
    lastName: 'Rodriguez',
    company: 'FinTech IO',
    industry: 'Finance',
    title: 'Product Manager',
    phone: '+1 (555) 555-0199',
    deals: null,
    tickets: { count: 1, status: 'urgent' },
  },
];

export default function ContactsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredContacts = placeholderContacts.filter(
    (contact) =>
      searchQuery === '' ||
      contact.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contact.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/dashboard" className="hover:text-[#137fec]">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-white font-medium">Contacts</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            Contact List
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-base">
            View and manage your customer database efficiently.
          </p>
        </div>
        <Link
          href="/contacts/new"
          className="group flex items-center justify-center gap-2 bg-ds-primary hover:bg-ds-primary-hover text-white font-bold py-2.5 px-5 rounded-lg shadow-sm shadow-ds-primary/30 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-ds-primary focus:ring-offset-2"
        >
          <span
            className="material-symbols-outlined text-[20px] group-hover:rotate-90 transition-transform"
            aria-hidden="true"
          >
            add
          </span>
          <span>New Contact</span>
        </Link>
      </div>

      {/* Search and Filters */}
      <Card className="p-4 bg-white dark:bg-[#1e2936] border-[#e2e8f0] dark:border-[#334155]">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <span className="material-symbols-outlined">search</span>
            </span>
            <input
              type="search"
              placeholder="Search contacts by name, email, or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select className="px-3 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]">
              <option value="">Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select className="px-3 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]">
              <option value="">Company</option>
              <option value="techcorp">TechCorp</option>
              <option value="designco">DesignCo</option>
              <option value="globalsoft">GlobalSoft</option>
            </select>
            <select className="px-3 py-2 border border-[#e2e8f0] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2936] text-slate-700 dark:text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#137fec]">
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Data Table */}
      <Card className="overflow-hidden bg-white dark:bg-[#1e2936] border-[#e2e8f0] dark:border-[#334155]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e2e8f0] dark:border-[#334155]">
                <th className="px-6 py-4 text-left">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 dark:border-slate-600"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Contact Name
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Deals / Tickets
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
              {filteredContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="hover:bg-slate-50 dark:hover:bg-[#2d3a4a]/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-[#334155] flex items-center justify-center text-sm font-medium text-slate-600 dark:text-slate-300">
                        {contact.firstName[0]}
                        {contact.lastName[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white group-hover:text-[#137fec] transition-colors">
                          {contact.firstName} {contact.lastName}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {contact.title}
                        </p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {contact.company}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {contact.industry}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <a
                      href={`mailto:${contact.email}`}
                      className="text-[#137fec] hover:underline text-sm"
                    >
                      {contact.email}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {contact.phone}
                  </td>
                  <td className="px-6 py-4">
                    <DealTicketBadge deals={contact.deals} tickets={contact.tickets} />
                  </td>
                  <td className="px-6 py-4">
                    <button className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                      <span className="material-symbols-outlined">more_vert</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-[#e2e8f0] dark:border-[#334155] flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Showing <span className="font-medium">1-5</span> of{' '}
            <span className="font-medium">128</span> contacts
          </p>
          <div className="flex items-center gap-1">
            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-50">
              <span className="material-symbols-outlined text-lg">chevron_left</span>
            </button>
            <button className="w-8 h-8 rounded bg-[#137fec] text-white text-sm font-medium">
              1
            </button>
            <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
              2
            </button>
            <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
              3
            </button>
            <span className="text-slate-400">...</span>
            <button className="w-8 h-8 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2d3a4a] text-sm">
              12
            </button>
            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              <span className="material-symbols-outlined text-lg">chevron_right</span>
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DealTicketBadge({
  deals,
  tickets,
}: {
  deals: { count: number; status: 'open' | 'closed' } | null;
  tickets: { count: number; status: 'pending' | 'urgent' } | null;
}) {
  if (!deals && !tickets) {
    return <span className="text-sm text-slate-400 italic">No active items</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {deals && (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            deals.status === 'open'
              ? 'bg-[#137fec]/10 text-[#137fec]'
              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {deals.status === 'open' ? 'pending' : 'check_circle'}
          </span>
          {deals.count} {deals.status === 'open' ? 'Open Deals' : 'Closed Deals'}
        </span>
      )}
      {tickets && (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            tickets.status === 'urgent'
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {tickets.status === 'urgent' ? 'warning' : 'schedule'}
          </span>
          {tickets.count} {tickets.status === 'urgent' ? 'Urgent Ticket' : 'Pending Ticket'}
        </span>
      )}
    </div>
  );
}
