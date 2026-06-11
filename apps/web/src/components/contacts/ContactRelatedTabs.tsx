import { ContactDocumentsTab } from './ContactDocumentsTab';
import { ContactTicketsTab } from './ContactTicketsTab';
import {
  toTicketViewModels,
  toDocumentViewModels,
  type ContactTicketInput,
  type ContactDocumentInput,
} from './contact-tab-format';

export interface ContactRelatedTabsProps {
  /** The currently active Contact 360 tab id. */
  activeTab: string;
  /** The contact's raw tickets/documents from the API (normalised internally). */
  contact:
    | { tickets?: ContactTicketInput[]; documents?: ContactDocumentInput[] }
    | undefined
    | null;
  /** IANA timezone used to render dates. */
  timezone: string;
}

/**
 * IFC-256: dispatcher for the Contact 360 Tickets/Documents tabs. Normalises the
 * raw API data into view models and renders the active tab (or nothing for the
 * other tabs). Lives here — not inline in the route page — so the wiring is
 * unit-tested and counted by coverage (route page.tsx files are excluded from
 * the merged coverage report).
 */
export function ContactRelatedTabs({ activeTab, contact, timezone }: ContactRelatedTabsProps) {
  if (activeTab === 'tickets') {
    return <ContactTicketsTab tickets={toTicketViewModels(contact?.tickets)} timezone={timezone} />;
  }
  if (activeTab === 'documents') {
    return (
      <ContactDocumentsTab
        documents={toDocumentViewModels(contact?.documents)}
        timezone={timezone}
      />
    );
  }
  return null;
}
