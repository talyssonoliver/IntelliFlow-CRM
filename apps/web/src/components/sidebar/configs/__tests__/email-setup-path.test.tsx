// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../EmailSidebarContent', () => ({
  EmailComposeButton: () => null,
  EmailSidebarExtras: () => null,
  EmailStorageIndicator: () => null,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/email' }));
vi.mock('@/components/sidebar', () => ({ useSidebarOptional: () => null }));

import { ModuleSettingsNav } from '@/components/shared/module-settings-nav';
import { createEmailSettingsSidebarConfig, createEmailSidebarConfig } from '../email';

const ITEMS = [{ id: 'a', label: 'Email Settings', icon: 'tune', href: '/email/email-settings' }];

describe('the path to Email Settings', () => {
  it('is in the email sidebar, without opening a panel', () => {
    const items = createEmailSidebarConfig().sections.flatMap((section) => section.items);
    expect(items).toContainEqual(
      expect.objectContaining({ label: 'Email Settings', href: '/email/email-settings' })
    );
  });

  it('is not listed twice on the settings pages, which have their own list', () => {
    const items = createEmailSettingsSidebarConfig(undefined).sections.flatMap((s) => s.items);
    expect(items.some((item) => item.id === 'email-settings-link')).toBe(false);
  });
});

describe('ModuleSettingsNav', () => {
  const blankSpace = (container: HTMLElement) =>
    document.body.querySelector('aside > .flex-1') ?? container.querySelector('aside > .flex-1');

  it('stacks items above the footer by default, for the other modules', () => {
    const { container } = render(
      <main id="main-content">
        <ModuleSettingsNav isOpen onClose={vi.fn()} title="Settings" items={ITEMS} />
      </main>
    );
    expect(blankSpace(container)).not.toBeNull();
    expect(screen.getByRole('link', { name: /email settings/i })).toBeInTheDocument();
  });

  it('can list them from the top, with no blank half', () => {
    const { container } = render(
      <main id="main-content">
        <ModuleSettingsNav isOpen onClose={vi.fn()} title="Settings" items={ITEMS} itemsAtTop />
      </main>
    );
    expect(blankSpace(container)).toBeNull();
    expect(screen.getByRole('link', { name: /email settings/i })).toBeInTheDocument();
  });
});
