/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import axe from 'axe-core';
import { ClosuresList, type ClosuresListHandle } from '../ClosuresList';
import { closureFieldId, type DraftClosure } from '../../availability-draft';

const one: DraftClosure = {
  key: 'c1',
  startDate: '2026-12-24',
  endDate: '2026-12-26',
  reason: 'Christmas',
};

function Harness(props: {
  initial?: DraftClosure[];
  errors?: Record<string, string>;
  readOnly?: boolean;
  handleRef?: React.Ref<ClosuresListHandle>;
}) {
  const [closures, setClosures] = React.useState(props.initial ?? [one]);
  const [announcement, setAnnouncement] = React.useState('');
  return (
    <>
      <output aria-live="polite">{announcement}</output>
      <ClosuresList
        ref={props.handleRef}
        closures={closures}
        onChange={setClosures}
        errors={props.errors ?? {}}
        readOnly={props.readOnly ?? false}
        announce={setAnnouncement}
      />
    </>
  );
}

describe('ClosuresList', () => {
  it('renders the canonical passive empty state with closure wording and no CTA inside', () => {
    render(<Harness initial={[]} />);
    expect(screen.queryByRole('list', { name: 'Closures' })).not.toBeInTheDocument();
    const empty = screen.getByRole('region', { name: 'No closures' });
    expect(empty).toHaveTextContent('No closures');
    expect(empty).toHaveTextContent('Add the dates the firm is closed, such as public holidays.');
    fireEvent.focus(empty);
    fireEvent.mouseEnter(empty);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('openCreate (forwardRef) adds a row, focuses its start date and announces it', () => {
    const ref = React.createRef<ClosuresListHandle>();
    render(<Harness initial={[]} handleRef={ref} />);
    act(() => ref.current?.openCreate());
    const start = screen.getByLabelText('Closure 1 start date');
    expect(document.activeElement).toBe(start);
    expect(screen.getByRole('status')).toHaveTextContent('Closure 1 added.');
  });

  it('labels each row and its remove button', () => {
    render(<Harness />);
    expect(screen.getByRole('list', { name: 'Closures' })).toBeInTheDocument();
    expect(screen.getByLabelText('Closure 1 start date')).toHaveValue('2026-12-24');
    expect(screen.getByLabelText('Closure 1 end date')).toHaveValue('2026-12-26');
    expect(screen.getByLabelText('Closure 1 reason (optional)')).toHaveValue('Christmas');
    expect(
      screen.getByRole('button', { name: 'Remove closure 1, 2026-12-24 to 2026-12-26' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Closure 1 start date')).toHaveAttribute('min', '2000-01-01');
    expect(screen.getByLabelText('Closure 1 start date')).toHaveAttribute('max', '2100-12-31');
  });

  it('removes a row, announces it and moves focus to the next row (or the previous)', () => {
    const two: DraftClosure = {
      key: 'c2',
      startDate: '2027-01-01',
      endDate: '2027-01-01',
      reason: '',
    };
    render(<Harness initial={[one, two]} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove closure 1/ }));
    expect(document.activeElement).toBe(screen.getByLabelText('Closure 1 start date'));
    expect(screen.getByLabelText('Closure 1 start date')).toHaveValue('2027-01-01');
    expect(screen.getByRole('status')).toHaveTextContent('Closure 1 removed, 1 closure remains.');
  });

  it('keeps the draft order while editing (no auto-sort)', () => {
    const later: DraftClosure = {
      key: 'c0',
      startDate: '2027-05-01',
      endDate: '2027-05-01',
      reason: '',
    };
    render(<Harness initial={[later, one]} />);
    expect(screen.getByLabelText('Closure 1 start date')).toHaveValue('2027-05-01');
  });

  it('wires row errors', () => {
    render(
      <Harness
        errors={{ [closureFieldId('c1', 'end')]: 'Closure 1 must end on or after its start date' }}
      />
    );
    const end = screen.getByLabelText('Closure 1 end date');
    expect(end).toHaveAttribute('aria-invalid', 'true');
    expect(end).toHaveAccessibleDescription('Closure 1 must end on or after its start date');
  });

  it('limits the reason to 200 characters', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Closure 1 reason (optional)')).toHaveAttribute(
      'maxlength',
      '200'
    );
  });

  it('refuses a 201st closure with an announcement', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      key: `k${i}`,
      startDate: '2030-01-01',
      endDate: '2030-01-01',
      reason: '',
    }));
    const ref = React.createRef<ClosuresListHandle>();
    render(<Harness initial={many} handleRef={ref} />);
    act(() => ref.current?.openCreate());
    expect(screen.queryByLabelText('Closure 201 start date')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Maximum of 200 closures reached.');
  });

  it('renders rows as text, reasons included, when read-only', () => {
    render(<Harness readOnly />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('24 Dec 2026 to 26 Dec 2026, Christmas')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('calls onChange when a date changes', () => {
    const onChange = vi.fn();
    render(
      <ClosuresList
        closures={[one]}
        onChange={onChange}
        errors={{}}
        readOnly={false}
        announce={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Closure 1 end date'), {
      target: { value: '2026-12-27' },
    });
    expect(onChange).toHaveBeenCalledWith([{ ...one, endDate: '2026-12-27' }]);
  });
});
