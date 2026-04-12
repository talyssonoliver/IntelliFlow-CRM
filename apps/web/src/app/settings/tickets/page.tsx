'use client';

/**
 * Tickets Settings Page (Legacy — redirects to /tickets/sla-policies)
 * @deprecated Use /tickets/sla-policies instead
 */

import { redirect } from 'next/navigation';

export default function TicketsSettingsPage() {
  redirect('/tickets/sla-policies');
}
