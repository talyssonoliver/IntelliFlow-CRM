'use client';

/**
 * AI Settings Page (Legacy — redirects to /agent-approvals/ai-settings)
 * @deprecated Use /agent-approvals/ai-settings instead
 */

import { redirect } from 'next/navigation';

export default function AISettingsPage() {
  redirect('/agent-approvals/ai-settings');
}
