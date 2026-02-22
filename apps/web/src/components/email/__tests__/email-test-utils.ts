import { vi } from 'vitest';

// =============================================================================
// Mock Data Factories
// =============================================================================

export function createMockEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    subject: 'Test Subject',
    textBody: 'Test body text',
    htmlBody: '<p>Test body</p>',
    from: { address: 'sender@example.com', name: 'John Doe' },
    to: [{ address: 'recipient@example.com', name: 'Jane Smith' }],
    attachments: [] as Array<{
      filename: string;
      contentType: string;
      size: number;
      checksum: string;
    }>,
    threadId: 'thread-1',
    isReply: false,
    isForward: false,
    spamScore: 0,
    receivedAt: new Date().toISOString(),
    isRead: true,
    ...overrides,
  };
}

export function createMockThread(overrides: Record<string, unknown> = {}) {
  return {
    threadId: 'thread-1',
    subject: 'Re: Test Thread',
    emails: [
      createMockEmail({ id: 'email-1', receivedAt: '2026-02-16T10:00:00Z' }),
      createMockEmail({
        id: 'email-2',
        isReply: true,
        receivedAt: '2026-02-16T11:00:00Z',
        from: { address: 'recipient@example.com', name: 'Jane Smith' },
        to: [{ address: 'sender@example.com', name: 'John Doe' }],
      }),
    ],
    participantCount: 2,
    ...overrides,
  };
}

export function createMockTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-1',
    name: 'Follow Up',
    subject: 'Following up on {{contact.name}}',
    body: '<p>Hi {{contact.name}},</p><p>Just following up...</p>',
    category: 'sales',
    variables: ['contact.name', 'contact.email'],
    ...overrides,
  };
}

export function createMockContact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'contact-1',
    firstName: 'Alice',
    lastName: 'Johnson',
    email: 'alice@example.com',
    ...overrides,
  };
}

// =============================================================================
// tRPC Mock Setup
// =============================================================================

export function createListEmailsQuery() {
  return vi.fn().mockReturnValue({
    data: { emails: [], total: 0, hasMore: false },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

export function createGetThreadQuery() {
  return vi.fn().mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
}

export function createSendEmailMutation() {
  return vi.fn().mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ id: 'sent-1', status: 'PENDING' }),
    isLoading: false,
    isError: false,
    error: null,
  });
}

export function createSaveDraftMutation() {
  return vi.fn().mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ id: 'draft-1', status: 'DRAFT' }),
    isLoading: false,
    isError: false,
    error: null,
  });
}

export function createListTemplatesQuery() {
  return vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  });
}

export function createContactListQuery() {
  return vi.fn().mockReturnValue({
    data: { contacts: [], total: 0, page: 1, limit: 5, hasMore: false },
    isLoading: false,
    isError: false,
  });
}

export function createGetUnreadCountsQuery() {
  return vi.fn().mockReturnValue({
    data: { inbox: 0, sent: 0, drafts: 0, trash: 0, spam: 0 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

export function createMarkAsReadMutation() {
  return vi.fn().mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
    isError: false,
    error: null,
  });
}

/**
 * Build a complete mock trpc object for email tests.
 * Usage:
 *   const mocks = createMockEmailTrpc();
 *   vi.mock('@/lib/trpc', () => ({ trpc: mocks.trpc }));
 */
export function createMockEmailTrpc() {
  const listEmails = createListEmailsQuery();
  const getEmail = vi.fn().mockReturnValue({ data: null, isLoading: false, isError: false });
  const getThread = createGetThreadQuery();
  const getAttachment = vi.fn().mockReturnValue({ data: null, isLoading: false });
  const sendEmail = createSendEmailMutation();
  const saveDraft = createSaveDraftMutation();
  const listTemplates = createListTemplatesQuery();
  const contactList = createContactListQuery();
  const getUnreadCounts = createGetUnreadCountsQuery();
  const markAsRead = createMarkAsReadMutation();

  const trpc = {
    email: {
      listEmails: { useQuery: listEmails },
      getEmail: { useQuery: getEmail },
      getThread: { useQuery: getThread },
      getAttachment: { useQuery: getAttachment },
      sendEmail: { useMutation: sendEmail },
      saveDraft: { useMutation: saveDraft },
      listTemplates: { useQuery: listTemplates },
      getUnreadCounts: { useQuery: getUnreadCounts },
      markAsRead: { useMutation: markAsRead },
    },
    contact: {
      list: { useQuery: contactList },
    },
  };

  return {
    trpc,
    mocks: {
      listEmails,
      getEmail,
      getThread,
      getAttachment,
      sendEmail,
      saveDraft,
      listTemplates,
      contactList,
      getUnreadCounts,
      markAsRead,
    },
  };
}

// =============================================================================
// Folder data (mirrors FolderSidebar)
// =============================================================================

export const EMAIL_FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: 'Inbox' },
  { id: 'sent', label: 'Sent', icon: 'Send' },
  { id: 'drafts', label: 'Drafts', icon: 'File' },
  { id: 'archive', label: 'Archive', icon: 'Archive' },
  { id: 'spam', label: 'Spam', icon: 'AlertTriangle' },
  { id: 'trash', label: 'Trash', icon: 'Trash2' },
] as const;
