// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMockContact, createMockEmailTrpc } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

const { RecipientPicker } = await import('../RecipientPicker');

describe('RecipientPicker', () => {
  const defaultProps = {
    label: 'To',
    value: [] as Array<{ name: string; email: string }>,
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contactSearch.mockReturnValue({
      data: {
        contacts: [
          createMockContact({
            id: 'c1',
            firstName: 'Alice',
            lastName: 'Johnson',
            email: 'alice@test.com',
          }),
          createMockContact({
            id: 'c2',
            firstName: 'Bob',
            lastName: 'Smith',
            email: 'bob@test.com',
          }),
        ],
      },
      isLoading: false,
      isError: false,
    });
    mocks.leadList.mockReturnValue({
      data: { leads: [] },
      isLoading: false,
      isError: false,
    });
  });

  it('renders input field with placeholder', () => {
    render(<RecipientPicker {...defaultProps} />);
    expect(screen.getByPlaceholderText(/add recipient/i)).toBeInTheDocument();
  });

  it('shows autocomplete dropdown when typing', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'al');
    expect(screen.getByRole('list', { name: /to suggestions/i })).toBeInTheDocument();
  });

  it('adds chip when selecting contact', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'al');
    const listbox = screen.getByRole('list', { name: /to suggestions/i });
    const options = within(listbox).getAllByRole('button');
    await user.click(options[0]);
    expect(defaultProps.onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ email: 'alice@test.com' })])
    );
  });

  it('shows chip with name and remove button', () => {
    render(
      <RecipientPicker
        {...defaultProps}
        value={[{ name: 'Alice Johnson', email: 'alice@test.com' }]}
      />
    );
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove alice/i })).toBeInTheDocument();
  });

  it('removes chip when remove button clicked', async () => {
    const user = userEvent.setup();
    render(
      <RecipientPicker
        {...defaultProps}
        value={[{ name: 'Alice Johnson', email: 'alice@test.com' }]}
      />
    );
    await user.click(screen.getByRole('button', { name: /remove alice/i }));
    expect(defaultProps.onChange).toHaveBeenCalledWith([]);
  });

  it('adds valid email on Enter key', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'valid@email.com{Enter}');
    expect(defaultProps.onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ email: 'valid@email.com' })])
    );
  });

  it('shows error for invalid email on Enter', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'notanemail{Enter}');
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
  });

  it('removes last chip on Backspace when input empty', async () => {
    const user = userEvent.setup();
    render(
      <RecipientPicker {...defaultProps} value={[{ name: 'Alice', email: 'alice@test.com' }]} />
    );
    const input = screen.getByPlaceholderText(/add recipient/i);
    input.focus();
    await user.keyboard('{Backspace}');
    expect(defaultProps.onChange).toHaveBeenCalledWith([]);
  });

  it('navigates dropdown with arrow keys', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'a');
    await user.keyboard('{ArrowDown}');
    const options = within(screen.getByRole('list', { name: /to suggestions/i })).getAllByRole(
      'button'
    );
    expect(options[0]).toHaveAttribute('data-highlighted', 'true');
  });

  it('selects highlighted suggestion on Enter', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'a');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(defaultProps.onChange).toHaveBeenCalled();
  });

  it('closes dropdown on Escape', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'a');
    expect(screen.getByRole('list', { name: /to suggestions/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: /to suggestions/i })).not.toBeInTheDocument();
  });

  it('wires the textbox to native suggestions and live instructions', () => {
    render(<RecipientPicker {...defaultProps} />);
    const textbox = screen.getByRole('combobox', { name: /to/i });
    expect(textbox).toHaveAttribute('list');
    expect(textbox).toHaveAttribute('aria-describedby');
  });

  it('renders a semantic list for visible suggestions', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    await user.type(screen.getByPlaceholderText(/add recipient/i), 'a');
    expect(screen.getByRole('list', { name: /to suggestions/i })).toBeInTheDocument();
  });

  it('tracks the highlighted suggestion on the visible option button', async () => {
    const user = userEvent.setup();
    render(<RecipientPicker {...defaultProps} />);
    const input = screen.getByPlaceholderText(/add recipient/i);
    await user.type(input, 'a');
    await user.keyboard('{ArrowDown}');
    expect(
      within(screen.getByRole('list', { name: /to suggestions/i })).getAllByRole('button')[0]
    ).toHaveAttribute('data-highlighted', 'true');
  });
});
