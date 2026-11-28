/**
 * Send-survey dialog (MVP-012): the contact a survey goes to is always the one shown as chosen.
 * A new search or closing the dialog clears the choice, because a sent email cannot be recalled.
 * Names are invented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockMutate = vi.fn();
const CONTACTS = [
  { id: 'c1', firstName: 'Mara', lastName: 'Quill', email: 'mara@example.invalid' },
  { id: 'c2', firstName: 'Orin', lastName: 'Vale', email: 'orin@example.invalid' },
];

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ feedbackSurvey: { getDashboardStats: { invalidate: vi.fn() } } }),
    contact: {
      list: {
        useQuery: (input: { search?: string }) => ({
          isLoading: false,
          data: {
            contacts: CONTACTS.filter(
              (c) =>
                !input.search ||
                `${c.firstName} ${c.lastName}`.toLowerCase().includes(input.search.toLowerCase())
            ),
          },
        }),
      },
    },
    feedbackSurvey: {
      send: { useMutation: () => ({ mutate: mockMutate, isPending: false }) },
    },
  },
}));

const { SendSurveyDialog } = await import('../SendSurveyDialog');

function sendButton() {
  return screen.getByRole('button', { name: 'Send survey' });
}

describe('SendSurveyDialog', () => {
  beforeEach(() => mockMutate.mockClear());

  it('sends to the contact chosen on screen', () => {
    render(<SendSurveyDialog open onOpenChange={vi.fn()} />);
    expect(sendButton()).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Mara Quill/ }));
    fireEvent.click(sendButton());
    expect(mockMutate).toHaveBeenCalledWith({ contactId: 'c1', surveyType: 'NPS' });
  });

  it('clears the choice when a new search hides the chosen contact', () => {
    render(<SendSurveyDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Mara Quill/ }));
    fireEvent.change(screen.getByLabelText('Contact'), { target: { value: 'Orin' } });
    expect(screen.queryByRole('button', { name: /Mara Quill/ })).toBeNull();
    expect(sendButton()).toBeDisabled();
    fireEvent.click(sendButton());
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('forgets the choice after Cancel, so reopening starts empty', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(<SendSurveyDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Mara Quill/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<SendSurveyDialog open={false} onOpenChange={onOpenChange} />);
    rerender(<SendSurveyDialog open onOpenChange={onOpenChange} />);
    expect(sendButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: /Mara Quill/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });
});
