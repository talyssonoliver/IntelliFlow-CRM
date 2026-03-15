// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUnreadCounts = vi.fn();
const mockCreateEmailSidebarConfig = vi.fn(() => ({ sections: [] }));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    email: {
      getUnreadCounts: {
        useQuery: (...args: unknown[]) => (mockGetUnreadCounts as (...params: unknown[]) => unknown)(...args),
      },
    },
  },
}));

vi.mock('@/components/sidebar', () => ({
  SidebarProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  SidebarInset: ({ children }: Readonly<{ children: React.ReactNode }>) => <div>{children}</div>,
  SidebarTrigger: () => <button type="button">Toggle sidebar</button>,
  SidebarWithSuspense: () => <aside>Email sidebar</aside>,
  createEmailSidebarConfig: (...args: unknown[]) =>
    (mockCreateEmailSidebarConfig as (...params: unknown[]) => unknown)(...args),
}));

const { default: EmailLayoutShell } = await import('../_layout-shell');

describe('EmailLayoutShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUnreadCounts.mockReturnValue({
      data: { inbox: 3, sent: 0, drafts: 1, trash: 0, spam: 0 },
    });
  });

  it('renders children with sidebar and unread counts', () => {
    render(
      <EmailLayoutShell>
        <div>Email content</div>
      </EmailLayoutShell>
    );

    expect(screen.getByText('Email content')).toBeInTheDocument();
    expect(screen.getByText('Email sidebar')).toBeInTheDocument();
    expect(mockGetUnreadCounts).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        refetchInterval: 30000,
      })
    );
  });

  it('passes unread counts to createEmailSidebarConfig', () => {
    const unreadData = { inbox: 5, sent: 0, drafts: 2, trash: 0, spam: 1 };
    mockGetUnreadCounts.mockReturnValue({ data: unreadData });

    render(
      <EmailLayoutShell>
        <div>Content</div>
      </EmailLayoutShell>
    );

    expect(mockCreateEmailSidebarConfig).toHaveBeenCalledWith(unreadData);
  });

  it('shows mobile sidebar trigger on small screens', () => {
    render(
      <EmailLayoutShell>
        <div>Content</div>
      </EmailLayoutShell>
    );

    expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });
});
