'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@intelliflow/ui';

import { EmailCompose } from '@/components/email/EmailCompose';

export interface ContactQuickActionsContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface ContactLogCallInput {
  contactId: string;
  type: 'CALL';
  title: string;
  description?: string;
}

export interface ContactQuickActionsProps {
  contact: ContactQuickActionsContact;
  /** Called with the validated payload when a call is logged. The page wires this to `contact.logActivity`. */
  onLogCall: (input: ContactLogCallInput) => void;
  /** Reflects the parent mutation's pending state so the submit button can show progress. */
  isLoggingCall: boolean;
}

/**
 * IFC-257: the Contact 360 header "Email" + "Log Call" actions, plus their
 * overlays (an `EmailCompose` sheet and a Log Call dialog). Extracted from the
 * route page so the wiring is unit-tested and counted by the merged coverage
 * report (route `page.tsx` is excluded from that report).
 */
export function ContactQuickActions({
  contact,
  onLogCall,
  isLoggingCall,
}: Readonly<ContactQuickActionsProps>) {
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [logCallOpen, setLogCallOpen] = useState(false);
  const [logCallTitle, setLogCallTitle] = useState('');
  const [logCallDescription, setLogCallDescription] = useState('');

  const fullName = `${contact.firstName} ${contact.lastName}`.trim();

  const resetLogCall = () => {
    setLogCallOpen(false);
    setLogCallTitle('');
    setLogCallDescription('');
  };

  const submitLogCall = () => {
    const title = logCallTitle.trim();
    if (!title) return;
    // Dispatch the payload FIRST, then close + clear — clearing in the dialog's
    // onOpenChange teardown would wipe the payload before it is read.
    onLogCall({
      contactId: contact.id,
      type: 'CALL',
      title,
      description: logCallDescription.trim() || undefined,
    });
    resetLogCall();
  };

  return (
    <>
      <button
        type="button"
        disabled={!contact.email}
        onClick={() => setEmailSheetOpen(true)}
        className="flex items-center gap-2 px-4 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 20q-.825 0-1.412-.587Q2 18.825 2 18V6q0-.825.588-1.412Q3.175 4 4 4h16q.825 0 1.413.588Q22 5.175 22 6v12q0 .825-.587 1.413Q20.825 20 20 20Zm8-7 8-5V6l-8 5-8-5v2Z" />
        </svg>{' '}
        Email
      </button>
      <button
        type="button"
        onClick={() => setLogCallOpen(true)}
        className="flex items-center gap-2 px-4 h-10 rounded-lg bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
      >
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.95 21q-3.125 0-6.175-1.362-3.05-1.363-5.55-3.863-2.5-2.5-3.862-5.55Q3 7.175 3 4.05q0-.45.3-.75t.75-.3H8.1q.35 0 .625.238.275.237.325.562l.65 3.5q.05.4-.025.675-.075.275-.275.475L6.65 11.2q.7 1.3 1.65 2.475.95 1.175 2.1 2.175l2.65-2.65q.225-.225.525-.325.3-.1.625-.025l3.3.7q.35.1.563.363.212.262.212.587v4.05q0 .45-.3.75t-.75.3Z" />
        </svg>{' '}
        Log Call
      </button>

      {/* Email compose sheet (PG-141 EmailCompose) */}
      <Sheet open={emailSheetOpen} onOpenChange={setEmailSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Email {fullName}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <EmailCompose
              mode="new"
              initialTo={[{ name: fullName, email: contact.email }]}
              onDiscard={() => setEmailSheetOpen(false)}
              onSent={() => setEmailSheetOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Log Call dialog → contact.logActivity({ type: 'CALL' }) */}
      <Dialog open={logCallOpen} onOpenChange={setLogCallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Call</DialogTitle>
            <DialogDescription>Record a call with {fullName}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="contact-log-call-title"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Call Title <span className="text-red-500">*</span>
              </label>
              <input
                id="contact-log-call-title"
                type="text"
                value={logCallTitle}
                onChange={(e) => setLogCallTitle(e.target.value)}
                placeholder="e.g. Discovery call, Follow-up"
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="contact-log-call-description"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Notes <span className="text-slate-400 text-xs font-normal">(optional)</span>
              </label>
              <textarea
                id="contact-log-call-description"
                value={logCallDescription}
                onChange={(e) => setLogCallDescription(e.target.value)}
                placeholder="Call summary, outcomes, next steps..."
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={resetLogCall}
              className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitLogCall}
              disabled={!logCallTitle.trim() || isLoggingCall}
              className="px-4 py-2 rounded-md bg-[#137fec] text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingCall ? 'Saving...' : 'Log Call'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
