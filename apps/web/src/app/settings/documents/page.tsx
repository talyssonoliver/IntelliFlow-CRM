'use client';

/**
 * Documents Settings Page (Legacy — redirects to /documents/document-settings)
 * @deprecated Use /documents/document-settings instead
 */

import { redirect } from 'next/navigation';

export default function DocumentsSettingsPage() {
  redirect('/documents/document-settings');
}
