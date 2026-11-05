// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}));
const api = vi.hoisted(() => ({
  getEmail: vi.fn(),
  resolveDefault: vi.fn(),
  utils: {
    email: {
      listEmails: { invalidate: vi.fn() },
      getUnreadCounts: { invalidate: vi.fn() },
    },
  },
}));
const compose = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => api.utils,
    email: { getEmail: { useQuery: api.getEmail } },
    emailSignatures: { resolveDefault: { useQuery: api.resolveDefault } },
  },
}));
vi.mock('@/components/email/EmailCompose', () => ({
  EmailCompose: (props: Record<string, unknown>) => {
    compose(props);
    return <div data-testid="compose" />;
  },
}));

import { ComposeClient } from '../_compose-client';

const draft = {
  id: 'draft-9',
  isDraft: true,
  to: [{ address: 'sam@client.example.invalid' }],
  cc: [{ address: 'cc@client.example.invalid' }],
  bcc: [],
  subject: 'Draft to finish',
  htmlBody: '<p>Half written</p>',
  threadId: 'thread-3',
};

const queryOf = (data: unknown, isLoading = false) => ({ data, isLoading });
const lastProps = () => compose.mock.calls.at(-1)?.[0] as Record<string, any>;

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  api.getEmail.mockReturnValue(queryOf(null));
  api.resolveDefault.mockReturnValue(queryOf({ html: '<p>Signature</p>' }));
});

describe('ComposeClient drafts', () => {
  it('opens a saved draft for editing, with no signature added', () => {
    nav.params = new URLSearchParams('draftId=draft-9');
    api.getEmail.mockReturnValue(queryOf(draft));
    render(<ComposeClient />);
    expect(screen.getByRole('heading', { name: 'Draft' })).toBeInTheDocument();
    expect(lastProps().initialDraft).toEqual({
      id: 'draft-9',
      to: ['sam@client.example.invalid'],
      cc: ['cc@client.example.invalid'],
      bcc: [],
      subject: 'Draft to finish',
      htmlBody: '<p>Half written</p>',
      threadId: 'thread-3',
    });
    expect(lastProps().initialSignatureHtml).toBeUndefined();
  });

  it('waits for the draft before opening Compose, which reads it only once', () => {
    nav.params = new URLSearchParams('draftId=draft-9');
    api.getEmail.mockReturnValue(queryOf(undefined, true));
    render(<ComposeClient />);
    expect(screen.queryByTestId('compose')).not.toBeInTheDocument();
    expect(screen.getByText('Preparing your message…')).toBeInTheDocument();
  });

  it('never treats a sent email as a draft', () => {
    nav.params = new URLSearchParams('draftId=sent-1');
    api.getEmail.mockReturnValue(queryOf({ ...draft, id: 'sent-1', isDraft: false }));
    render(<ComposeClient />);
    expect(lastProps().initialDraft).toBeUndefined();
  });

  it('starts empty when the draft is gone', () => {
    nav.params = new URLSearchParams('draftId=missing');
    render(<ComposeClient />);
    expect(lastProps().initialDraft).toBeUndefined();
  });

  it('starts a new message when Compose is opened again from a draft', () => {
    nav.params = new URLSearchParams('draftId=draft-9');
    api.getEmail.mockImplementation((_input: unknown, options: { enabled: boolean }) =>
      queryOf(options.enabled ? draft : undefined)
    );
    const { rerender } = render(<ComposeClient />);
    expect(lastProps().initialDraft?.id).toBe('draft-9');
    const mounts = compose.mock.calls.length;
    nav.params = new URLSearchParams();
    rerender(<ComposeClient />);
    expect(compose.mock.calls.length).toBeGreaterThan(mounts);
    expect(lastProps().initialDraft).toBeUndefined();
    expect(api.getEmail.mock.calls.at(-1)?.[1]).toMatchObject({ enabled: false });
  });

  it('opens another draft when the address changes to it', () => {
    nav.params = new URLSearchParams('draftId=draft-9');
    api.getEmail.mockReturnValue(queryOf(draft));
    const { rerender } = render(<ComposeClient />);
    nav.params = new URLSearchParams('draftId=draft-2');
    rerender(<ComposeClient />);
    expect(api.getEmail.mock.calls.at(-1)?.[0]).toEqual({ emailId: 'draft-2' });
  });

  it('does not reload when saving a new draft adds its id to the URL', () => {
    window.history.replaceState(null, '', '/email/compose');
    const { rerender } = render(<ComposeClient />);
    expect(api.getEmail.mock.calls.at(-1)?.[1]).toMatchObject({ enabled: false });
    lastProps().onDraftSaved('draft-1');
    nav.params = new URLSearchParams('draftId=draft-1');
    rerender(<ComposeClient />);
    expect(api.getEmail.mock.calls.at(-1)?.[1]).toMatchObject({ enabled: false });
    expect(screen.getByTestId('compose')).toBeInTheDocument();
  });

  it('records the saved draft in this history entry, so Back returns to it', () => {
    window.history.replaceState(null, '', '/email/compose?mode=new');
    render(<ComposeClient />);
    lastProps().onDraftSaved('draft-1');
    expect(window.location.search).toBe('?mode=new&draftId=draft-1');
  });

  it('refreshes the lists when leaving, so a sent or saved draft shows correctly', () => {
    const { unmount } = render(<ComposeClient />);
    expect(api.utils.email.listEmails.invalidate).not.toHaveBeenCalled();
    unmount();
    expect(api.utils.email.listEmails.invalidate).toHaveBeenCalled();
    expect(api.utils.email.getUnreadCounts.invalidate).toHaveBeenCalled();
  });

  it('leaves through the router', () => {
    render(<ComposeClient />);
    lastProps().onLeave('/email/email-settings');
    expect(nav.push).toHaveBeenCalledWith('/email/email-settings');
  });
});
