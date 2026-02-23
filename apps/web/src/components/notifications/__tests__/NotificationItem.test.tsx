// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { NotificationItem } from '../NotificationItem';
import type { Notification } from '../types';

// Mock @intelliflow/ui Tooltip
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@intelliflow/ui');
  return {
    ...actual,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children, asChild: _asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <>{children}</>
    ),
    TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const baseNotification: Notification = {
  id: 'notif-1',
  type: 'lead_assigned',
  priority: 'normal',
  status: 'delivered',
  title: 'New Lead Assigned',
  body: 'John Doe has been assigned to you',
  isRead: false,
  readAt: null,
  createdAt: new Date(Date.now() - 5 * 60 * 1000),
  expiresAt: null,
  entityType: 'lead',
  entityId: 'lead-123',
  entityName: 'John Doe',
  actionUrl: '/leads/lead-123',
  actionLabel: 'View Lead',
  metadata: null,
};

describe('NotificationItem', () => {
  let onMarkAsRead: (id: string) => void;
  let onDismiss: (id: string) => void;

  beforeEach(() => {
    onMarkAsRead = vi.fn<(id: string) => void>();
    onDismiss = vi.fn<(id: string) => void>();
  });

  it('renders notification title', () => {
    render(
      <NotificationItem
        notification={baseNotification}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByText('New Lead Assigned')).toBeInTheDocument();
  });

  it('renders notification body', () => {
    render(
      <NotificationItem
        notification={baseNotification}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByText('John Doe has been assigned to you')).toBeInTheDocument();
  });

  it('renders relative time', () => {
    render(
      <NotificationItem
        notification={baseNotification}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByText('5 min ago')).toBeInTheDocument();
  });

  it('renders type label', () => {
    render(
      <NotificationItem
        notification={baseNotification}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByText('Lead')).toBeInTheDocument();
  });

  it('shows unread indicator for unread notifications', () => {
    const { container } = render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: false }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    // Unread dot indicator
    const dot = container.querySelector('.bg-primary.rounded-full');
    expect(dot).toBeInTheDocument();
  });

  it('does not show unread indicator for read notifications', () => {
    const { container } = render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: true }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    const dot = container.querySelector('.h-2.w-2.rounded-full.bg-primary');
    expect(dot).not.toBeInTheDocument();
  });

  it('applies high priority styling', () => {
    const { container } = render(
      <NotificationItem
        notification={{ ...baseNotification, priority: 'high' }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    // High priority badge
    expect(screen.getByText('High')).toBeInTheDocument();
    // Red priority border
    const priorityBar = container.querySelector('.bg-red-500');
    expect(priorityBar).toBeInTheDocument();
  });

  it('applies normal priority styling without badge', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, priority: 'normal' }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
  });

  it('shows mark as read button for unread notifications', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: false }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    const markReadBtn = screen.getByLabelText('Mark as read');
    expect(markReadBtn).toBeInTheDocument();
  });

  it('calls onMarkAsRead when mark as read button is clicked', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: false }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByLabelText('Mark as read'));
    expect(onMarkAsRead).toHaveBeenCalledWith('notif-1');
  });

  it('does not show mark as read button for read notifications', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: true }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.queryByLabelText('Mark as read')).not.toBeInTheDocument();
  });

  it('shows dismiss button', () => {
    render(
      <NotificationItem
        notification={baseNotification}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    const dismissBtn = screen.getByLabelText('Dismiss');
    expect(dismissBtn).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', () => {
    render(
      <NotificationItem
        notification={baseNotification}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledWith('notif-1');
  });

  it('has accessible action buttons with aria-label', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: false }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.getByLabelText('Mark as read')).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('action buttons are visible on focus-within', () => {
    const { container } = render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: false }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    // The actions container should have group-focus-within:opacity-100
    const actionsContainer = container.querySelector('[class*="group-focus-within"]');
    expect(actionsContainer).toBeInTheDocument();
  });

  it('renders action link when actionUrl is present', () => {
    render(
      <NotificationItem
        notification={baseNotification}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    const link = screen.getByText('View details');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/leads/lead-123');
  });

  it('does not render action link when actionUrl is absent', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, actionUrl: null }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    expect(screen.queryByText('View details')).not.toBeInTheDocument();
  });

  it('applies AI type special styling', () => {
    const { container } = render(
      <NotificationItem
        notification={{ ...baseNotification, type: 'ai_insight' }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('indigo');
  });

  it('shows bold title for unread notifications', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: false }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    const title = screen.getByText('New Lead Assigned');
    expect(title.className).toContain('font-bold');
  });

  it('shows medium-weight title for read notifications', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, isRead: true }}
        onMarkAsRead={onMarkAsRead}
        onDismiss={onDismiss}
      />
    );
    const title = screen.getByText('New Lead Assigned');
    expect(title.className).toContain('font-medium');
  });

  it('is a memoized component', () => {
    expect(NotificationItem).toHaveProperty('$$typeof');
    // React.memo wraps with Symbol(react.memo)
    expect(String((NotificationItem as unknown as { $$typeof: symbol }).$$typeof)).toContain(
      'memo'
    );
  });
});
