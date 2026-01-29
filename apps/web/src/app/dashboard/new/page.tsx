'use client';

import Link from 'next/link';

const recordTypes = [
  {
    id: 'lead',
    title: 'New Lead',
    description: 'Add a new prospective customer to your pipeline and assign an owner.',
    icon: 'person_add',
    href: '/leads/new',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-ds-primary',
    hoverBorder: 'hover:border-ds-primary/50',
    hoverShadow: 'hover:shadow-ds-primary/5',
    actionColor: 'group-hover:text-ds-primary',
  },
  {
    id: 'contact',
    title: 'New Contact',
    description: 'Create a profile for a new individual contact associated with an account.',
    icon: 'contacts',
    href: '/contacts/new',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
    hoverBorder: 'hover:border-indigo-400/50',
    hoverShadow: 'hover:shadow-indigo-500/5',
    actionColor: 'group-hover:text-indigo-500',
  },
  {
    id: 'account',
    title: 'New Account',
    description: 'Create a company or organization profile to group contacts and deals.',
    icon: 'business',
    href: '/accounts/new',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    iconColor: 'text-teal-600 dark:text-teal-400',
    hoverBorder: 'hover:border-teal-400/50',
    hoverShadow: 'hover:shadow-teal-500/5',
    actionColor: 'group-hover:text-teal-600 dark:group-hover:text-teal-400',
  },
  {
    id: 'deal',
    title: 'New Deal',
    description: 'Start a new sales opportunity, define its value, and track its stage.',
    icon: 'monetization_on',
    href: '/deals/new',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    hoverBorder: 'hover:border-amber-400/50',
    hoverShadow: 'hover:shadow-amber-500/5',
    actionColor: 'group-hover:text-amber-600 dark:group-hover:text-amber-400',
  },
  {
    id: 'ticket',
    title: 'New Ticket',
    description: 'Log a new support issue or customer request for the support team.',
    icon: 'confirmation_number',
    href: '/tickets/new',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    iconColor: 'text-rose-600 dark:text-rose-400',
    hoverBorder: 'hover:border-rose-400/50',
    hoverShadow: 'hover:shadow-rose-500/5',
    actionColor: 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
  },
  {
    id: 'task',
    title: 'New Task',
    description: 'Create a to-do item to track work and follow-ups.',
    icon: 'check_circle',
    href: '/tasks/new',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    hoverBorder: 'hover:border-emerald-400/50',
    hoverShadow: 'hover:shadow-emerald-500/5',
    actionColor: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
  },
  {
    id: 'campaign',
    title: 'New Campaign',
    description: 'Launch a marketing campaign to engage prospects and customers.',
    icon: 'campaign',
    href: '/campaigns/new',
    bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-900/20',
    iconColor: 'text-fuchsia-600 dark:text-fuchsia-400',
    hoverBorder: 'hover:border-fuchsia-400/50',
    hoverShadow: 'hover:shadow-fuchsia-500/5',
    actionColor: 'group-hover:text-fuchsia-600 dark:group-hover:text-fuchsia-400',
  },
  {
    id: 'document',
    title: 'New Document',
    description: 'Upload files and attachments to store and share with your team.',
    icon: 'description',
    href: '/documents/upload',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
    hoverBorder: 'hover:border-orange-400/50',
    hoverShadow: 'hover:shadow-orange-500/5',
    actionColor: 'group-hover:text-orange-600 dark:group-hover:text-orange-400',
  },
];

const otherActions = [
  {
    id: 'email',
    title: 'Send Email',
    description: 'Compose a new email',
    icon: 'mail',
    href: '/emails/compose',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    id: 'call',
    title: 'Log Call',
    description: 'Record a phone call',
    icon: 'call',
    href: '/calls/new',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    id: 'meeting',
    title: 'Schedule Meeting',
    description: 'Set up a calendar event',
    icon: 'event',
    href: '/calendar/new',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    id: 'chat',
    title: 'Start Chat',
    description: 'Begin a conversation',
    icon: 'chat',
    href: '/chats/new',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
  {
    id: 'note',
    title: 'Add Note',
    description: 'Write a quick note',
    icon: 'edit_note',
    href: '/notes/new',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
  {
    id: 'ai-insights',
    title: 'AI Insights',
    description: 'Get AI recommendations',
    icon: 'auto_awesome',
    href: '/ai/insights',
    bgColor: 'bg-violet-50 dark:bg-violet-900/20',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    id: 'quote',
    title: 'Create Quote',
    description: 'Generate a sales proposal',
    icon: 'request_quote',
    href: '/quotes/new',
    bgColor: 'bg-lime-50 dark:bg-lime-900/20',
    iconColor: 'text-lime-600 dark:text-lime-400',
  },
  {
    id: 'survey',
    title: 'Send Survey',
    description: 'Collect NPS/CSAT feedback',
    icon: 'rate_review',
    href: '/surveys/new',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    iconColor: 'text-pink-600 dark:text-pink-400',
  },
  {
    id: 'report',
    title: 'Create Report',
    description: 'Build a custom report',
    icon: 'analytics',
    href: '/reports/builder',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    iconColor: 'text-sky-600 dark:text-sky-400',
  },
  {
    id: 'convert',
    title: 'Convert Lead',
    description: 'Turn lead into contact & deal',
    icon: 'swap_horiz',
    href: '/leads/convert',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    iconColor: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    id: 'workflow',
    title: 'New Workflow',
    description: 'Create an automation rule',
    icon: 'account_tree',
    href: '/automation/workflows/new',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  {
    id: 'product',
    title: 'New Product',
    description: 'Add to product catalog',
    icon: 'inventory_2',
    href: '/products/new',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'template',
    title: 'New Template',
    description: 'Create email/doc template',
    icon: 'draft',
    href: '/templates/new',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    iconColor: 'text-teal-600 dark:text-teal-400',
  },
  {
    id: 'invite-user',
    title: 'Invite User',
    description: 'Add team member to CRM',
    icon: 'person_add',
    href: '/admin/users/new',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    id: 'sign-document',
    title: 'Sign Document',
    description: 'E-signature request',
    icon: 'draw',
    href: '/documents/sign',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'integration',
    title: 'New Integration',
    description: 'Connect external app',
    icon: 'extension',
    href: '/admin/integrations',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    id: 'kb-article',
    title: 'Knowledge Article',
    description: 'Add to knowledge base',
    icon: 'library_books',
    href: '/support/kb/new',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  {
    id: 'approval',
    title: 'Request Approval',
    description: 'Submit for approval',
    icon: 'approval',
    href: '/approvals/new',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'import',
    title: 'Import Records',
    description: 'Bulk upload from CSV',
    icon: 'upload_file',
    href: '/import',
    bgColor: 'bg-slate-100 dark:bg-slate-700',
    iconColor: 'text-slate-600 dark:text-slate-300',
  },
  {
    id: 'export',
    title: 'Export Records',
    description: 'Download data to CSV/Excel',
    icon: 'download',
    href: '/export',
    bgColor: 'bg-slate-100 dark:bg-slate-700',
    iconColor: 'text-slate-600 dark:text-slate-300',
  },
];

export default function CreateNewRecordPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background-light dark:bg-background-dark">
      <div className="mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        {/* Breadcrumb */}
        <div className="flex flex-col gap-4">
          <div>
            <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
              <Link href="/" className="hover:text-ds-primary transition-colors">
                Home
              </Link>
              <span className="material-symbols-outlined text-xs">chevron_right</span>
              <Link href="/dashboard" className="hover:text-ds-primary transition-colors">
                Dashboard
              </Link>
              <span className="material-symbols-outlined text-xs">chevron_right</span>
              <span className="text-slate-900 dark:text-slate-100 font-medium">Add New Record</span>
            </nav>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Create New Record
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Select the type of record you would like to create in the system.
            </p>
          </div>
        </div>

        {/* Main Record Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {recordTypes.map((record) => (
            <Link
              key={record.id}
              href={record.href}
              className={`group relative flex flex-col p-6 bg-surface-light dark:bg-surface-dark rounded-xl border border-border-light dark:border-border-dark ${record.hoverBorder} hover:shadow-lg dark:${record.hoverShadow} transition-all duration-300 h-full`}
            >
              <div className="flex items-center justify-between mb-5">
                <div
                  className={`p-3 ${record.bgColor} rounded-xl ${record.iconColor} group-hover:scale-110 transition-transform duration-300`}
                >
                  <span className="material-symbols-outlined text-3xl">{record.icon}</span>
                </div>
                <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-ds-primary transition-colors">
                  arrow_forward
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                {record.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                {record.description}
              </p>
              <div
                className={`mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-xs font-medium text-slate-400 ${record.actionColor} transition-colors`}
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Create {record.title.replace('New ', '')}
              </div>
            </Link>
          ))}
        </div>

        {/* Other Actions Section */}
        <div className="mt-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Other Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {otherActions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="flex items-center gap-3 p-4 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left group"
              >
                <div
                  className={`size-10 rounded-full ${action.bgColor} flex items-center justify-center ${action.iconColor} group-hover:scale-105 transition-transform`}
                >
                  <span className="material-symbols-outlined text-xl">{action.icon}</span>
                </div>
                <div>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                    {action.title}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {action.description}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
