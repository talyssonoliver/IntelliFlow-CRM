import type { Metadata } from 'next';
import { ComposeClient } from './_compose-client';

export const metadata: Metadata = {
  title: 'Compose Email | IntelliFlow CRM',
  description: 'Compose a new email or reply to a conversation',
};

export default function EmailComposePage() {
  return <ComposeClient />;
}
