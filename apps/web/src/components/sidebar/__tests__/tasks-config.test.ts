/**
 * @vitest-environment jsdom
 *
 * Tasks sidebar + settings panel reach /tasks/automation (PG-208). Asserted here
 * because check-nav-wiring false-PASSes on (list) routes (#877).
 */
import { createElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/tasks' }));

import { TASK_SETTINGS_ITEMS, isTaskSettingsPage } from '../configs/tasks';
import { TaskSettingsPanel } from '@/components/tasks/TaskSettingsPanel';

describe('tasks sidebar config (PG-208)', () => {
  it('links Task Automation as a task settings page', () => {
    expect(TASK_SETTINGS_ITEMS).toContainEqual(
      expect.objectContaining({ id: 'automation', href: '/tasks/automation' })
    );
    expect(isTaskSettingsPage('/tasks/automation')).toBe(true);
  });

  it('the task settings panel links to /tasks/automation', () => {
    render(createElement(TaskSettingsPanel, { isOpen: true, onClose: vi.fn() }));
    const link = screen.getByRole('link', { name: /Task Automation/ });
    expect(link.getAttribute('href')).toBe('/tasks/automation');
  });
});
