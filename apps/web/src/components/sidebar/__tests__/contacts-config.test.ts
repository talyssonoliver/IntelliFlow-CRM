import { describe, it, expect } from 'vitest';
import {
  CONTACT_SETTINGS_ITEMS,
  createContactsSidebarConfig,
  isContactSettingsPage,
} from '../configs/contacts';
import { segmentToFilter } from '@/lib/contacts/contact-search';

describe('contacts sidebar config (PG-205)', () => {
  it('links Contact Types as a contact settings page', () => {
    expect(CONTACT_SETTINGS_ITEMS).toContainEqual(
      expect.objectContaining({ id: 'contact-types', href: '/contacts/contact-types' })
    );
    expect(isContactSettingsPage('/contacts/contact-types')).toBe(true);
  });

  it('keeps the segment links, and each one maps to a real list filter', () => {
    const config = createContactsSidebarConfig(() => undefined);
    const segments = config.sections.find((s) => s.id === 'segments');
    const hrefs = segments?.items.map((i) => i.href) ?? [];
    expect(hrefs).toEqual([
      '/contacts?segment=vip',
      '/contacts?segment=partners',
      '/contacts?segment=vendors',
    ]);
    const mapped = hrefs.map((href) =>
      segmentToFilter(new URL(href, 'http://localhost').searchParams.get('segment'))
    );
    expect(mapped).toEqual([
      { typeFilter: '', segmentFilter: 'vip' },
      { typeFilter: 'partner', segmentFilter: '' },
      { typeFilter: 'vendor', segmentFilter: '' },
    ]);
  });
});
