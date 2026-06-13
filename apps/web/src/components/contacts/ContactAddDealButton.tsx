'use client';

import { useRouter } from 'next/navigation';

import { buildDealNewHref } from './contact-detail-actions';

export interface ContactAddDealButtonProps {
  contactId: string;
}

/**
 * IFC-257: the Deals-tab "Add Deal" action. Extracted from the route page so the
 * navigation wiring is unit-tested and counted by the merged coverage report
 * (route `page.tsx` is excluded from that report).
 */
export function ContactAddDealButton({ contactId }: Readonly<ContactAddDealButtonProps>) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(buildDealNewHref(contactId))}
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#137fec] hover:bg-[#137fec]/10 rounded-lg transition-colors"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11 13H5v-2h6V5h2v6h6v2h-6v6h-2Z" />
      </svg>{' '}
      Add Deal
    </button>
  );
}
