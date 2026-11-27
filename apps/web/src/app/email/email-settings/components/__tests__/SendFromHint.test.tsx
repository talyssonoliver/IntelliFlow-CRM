/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const hint = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock('@/lib/trpc', () => ({ trpc: { emailProviderHint: { forAddress: hint } } }));

import { SendFromHint } from '../SendFromHint';

beforeEach(() => {
  hint.useQuery.mockReset();
  hint.useQuery.mockReturnValue({ data: undefined });
});

const type = (value: string) => {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe('SendFromHint', () => {
  it('asks for the business address on the company card, and looks up nothing until one is given', () => {
    render(<SendFromHint scope="TENANT" onProvider={vi.fn()} />);
    expect(screen.getByLabelText('Which address does the business send from?')).toBeInTheDocument();
    expect(hint.useQuery).toHaveBeenLastCalledWith(
      { address: '' },
      expect.objectContaining({ enabled: false })
    );
  });

  it('looks up a valid address, names its provider and reports it', () => {
    const onProvider = vi.fn();
    hint.useQuery.mockImplementation((input: { address: string }) => ({
      data: input.address
        ? { domain: 'business.example.invalid', provider: 'ZOHO', personal: false }
        : undefined,
    }));
    render(<SendFromHint scope="USER" onProvider={onProvider} />);

    type(' Owner@Business.example.invalid ');

    expect(hint.useQuery).toHaveBeenLastCalledWith(
      { address: 'owner@business.example.invalid' },
      expect.objectContaining({ enabled: true })
    );
    expect(screen.getByTestId('send-from-provider')).toHaveTextContent(
      'Mail for business.example.invalid is run by Zoho Mail. Use Connect Zoho Mail.'
    );
    expect(onProvider).toHaveBeenLastCalledWith('ZOHO');
    expect(screen.queryByTestId('send-from-personal')).not.toBeInTheDocument();
  });

  it('warns when a personal address is picked for the business', () => {
    hint.useQuery.mockImplementation((input: { address: string }) => ({
      data: input.address ? { domain: 'gmail.com', provider: 'GOOGLE', personal: true } : undefined,
    }));
    render(<SendFromHint scope="TENANT" onProvider={vi.fn()} />);

    type('someone@gmail.com');

    expect(screen.getByTestId('send-from-personal')).toHaveTextContent(
      'someone@gmail.com is a personal address. Customers will see it on every email the business sends.'
    );
  });

  it('says plainly when the provider is not one we can connect, and offers no button first', () => {
    const onProvider = vi.fn();
    hint.useQuery.mockImplementation((input: { address: string }) => ({
      data: input.address
        ? { domain: 'own.example.invalid', provider: 'OTHER', personal: false }
        : undefined,
    }));
    render(<SendFromHint scope="USER" onProvider={onProvider} />);

    type('me@own.example.invalid');

    expect(screen.getByTestId('send-from-provider')).toHaveTextContent(
      'is not run by Google, Microsoft or Zoho'
    );
    expect(onProvider).toHaveBeenLastCalledWith(null);
  });

  it('ignores text that is not an email address', () => {
    render(<SendFromHint scope="USER" onProvider={vi.fn()} />);
    type('not an address');
    expect(hint.useQuery).toHaveBeenLastCalledWith(
      { address: '' },
      expect.objectContaining({ enabled: false })
    );
  });
});
