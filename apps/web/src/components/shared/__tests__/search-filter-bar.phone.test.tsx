// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchFilterBar } from '../search-filter-bar';

const statusOptions = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
];

function setup(status = '', extra: Partial<Parameters<typeof SearchFilterBar>[0]> = {}) {
  const onStatus = vi.fn();
  const onSort = vi.fn();
  render(
    <SearchFilterBar
      searchValue=""
      onSearchChange={() => {}}
      searchPlaceholder="Search leads..."
      filters={[
        {
          id: 'status',
          label: 'Status',
          options: statusOptions,
          value: status,
          onChange: onStatus,
        },
        {
          id: 'assignee',
          label: 'Assignee',
          options: [{ value: 'me', label: 'Me' }],
          value: '',
          onChange: () => {},
          hideOnMobile: true,
        },
      ]}
      sort={{
        options: [{ value: 'newest', label: 'Newest First' }],
        value: 'newest',
        onChange: onSort,
      }}
      {...extra}
    />
  );
  return { onStatus, onSort };
}

describe('SearchFilterBar on phones (owner 21/11: fields split over several lines)', () => {
  it('keeps search and one Filters button on a line below md; the inline controls show from md', () => {
    setup();
    const button = screen.getByTestId('filters-sheet-button');
    expect(button).toHaveClass('md:hidden', 'min-h-11');
    const inline = screen.getAllByLabelText('Status')[0].closest('div.hidden');
    expect(inline).toHaveClass('md:flex');
  });

  it('counts the active filters on the button', () => {
    setup('CONTACTED');
    expect(screen.getByTestId('filters-sheet-button')).toHaveTextContent('Filters1');
  });

  it('opens a sheet with every phone filter and the sort, full width, and Done closes it', async () => {
    const { onStatus } = setup();
    await userEvent.click(screen.getByTestId('filters-sheet-button'));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('heading', { name: 'Filters' })).toBeInTheDocument();
    const status = within(sheet).getByLabelText('Status');
    expect(status).toHaveClass('w-full', 'min-h-11');
    expect(within(sheet).getByLabelText('Sort order')).toHaveClass('w-full');
    // A filter the page hides on phones is not offered in the sheet either.
    expect(within(sheet).queryByLabelText('Assignee')).toBeNull();

    await userEvent.selectOptions(status, 'NEW');
    expect(onStatus).toHaveBeenCalledWith('NEW');

    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Codex review 26/11.
  it('does not count a filter set to "all" as active', () => {
    setup('all');
    expect(screen.getByTestId('filters-sheet-button')).not.toHaveTextContent(/Filters\s*\d/);
  });

  it('renders the extra controls once while the phone sheet is open (no duplicate ids)', async () => {
    setup('', { extra: <input id="from-date" aria-label="From date" /> });
    expect(document.querySelectorAll('#from-date')).toHaveLength(1);
    await userEvent.click(screen.getByTestId('filters-sheet-button'));
    await screen.findByRole('dialog');
    expect(document.querySelectorAll('#from-date')).toHaveLength(1);
  });

  it('draws no Filters button when the bar has only search', () => {
    render(<SearchFilterBar searchValue="" onSearchChange={() => {}} />);
    expect(screen.queryByTestId('filters-sheet-button')).toBeNull();
  });
});
