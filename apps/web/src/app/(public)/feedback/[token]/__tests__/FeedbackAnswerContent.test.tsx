/**
 * @vitest-environment jsdom
 *
 * MVP-012 - the public survey answer page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  lookup: { data: undefined as unknown, isLoading: false, error: null as unknown },
  submit: { mutateAsync: vi.fn(), isPending: false, data: undefined as unknown },
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    publicSurvey: {
      get: { useQuery: () => h.lookup },
      submit: { useMutation: () => h.submit },
    },
  },
}));

import FeedbackAnswerContent, { questionFor } from '../FeedbackAnswerContent';
import { generateMetadata } from '../page';

const TOKEN = 'k'.repeat(43);

describe('FeedbackAnswerContent', () => {
  beforeEach(() => {
    h.lookup = { data: undefined, isLoading: false, error: null };
    h.submit = { mutateAsync: vi.fn(), isPending: false, data: undefined };
  });

  it('is never indexed and has a generic title', async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe('Quick question');
  });

  it('shows an NPS scale of 0 to 10 with the company name only', () => {
    h.lookup.data = { status: 'ok', surveyType: 'NPS', companyName: 'Harbour Mill Co' };
    render(<FeedbackAnswerContent token={TOKEN} />);
    expect(screen.getByText(questionFor('NPS', 'Harbour Mill Co'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(11);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('shows a CSAT scale of 1 to 5', () => {
    h.lookup.data = { status: 'ok', surveyType: 'CSAT', companyName: 'Harbour Mill Co' };
    render(<FeedbackAnswerContent token={TOKEN} />);
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(5);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('keeps Send disabled until a number is picked, then submits score and comment', async () => {
    h.lookup.data = { status: 'ok', surveyType: 'NPS', companyName: 'Harbour Mill Co' };
    h.submit.mutateAsync.mockResolvedValue({ status: 'ok' });
    render(<FeedbackAnswerContent token={TOKEN} />);
    const send = screen.getByRole('button', { name: 'Send answer' });
    expect(send).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.change(screen.getByLabelText(/Anything you would like to add/), {
      target: { value: ' Fast replies ' },
    });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() =>
      expect(h.submit.mutateAsync).toHaveBeenCalledWith({
        token: TOKEN,
        score: 9,
        comment: 'Fast replies',
      })
    );
  });

  it('shows a server refusal in place', async () => {
    h.lookup.data = { status: 'ok', surveyType: 'NPS', companyName: 'Harbour Mill Co' };
    h.submit.mutateAsync.mockResolvedValue({ status: 'used' });
    render(<FeedbackAnswerContent token={TOKEN} />);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already been answered');
  });

  it('thanks the visitor after a stored answer', () => {
    h.lookup.data = { status: 'ok', surveyType: 'NPS', companyName: 'Harbour Mill Co' };
    h.submit.data = { status: 'ok' };
    render(<FeedbackAnswerContent token={TOKEN} />);
    expect(screen.getByText('Thank you')).toBeInTheDocument();
  });

  it.each([
    ['invalid', 'not valid'],
    ['expired', 'expired'],
    ['used', 'already been answered'],
  ])('explains a %s link without a form', (status, text) => {
    h.lookup.data = { status };
    render(<FeedbackAnswerContent token={TOKEN} />);
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send answer' })).not.toBeInTheDocument();
  });

  it('shows a plain message when the lookup fails', () => {
    h.lookup.error = new Error('boom');
    render(<FeedbackAnswerContent token={TOKEN} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
