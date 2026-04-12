'use client';

/**
 * Contacts Settings Page (Legacy — redirects to /contacts/contact-settings)
 * @deprecated Use /contacts/contact-settings instead
 */

import { redirect } from 'next/navigation';

export default function ContactsSettingsPage() {
  redirect('/contacts/contact-settings');
}
