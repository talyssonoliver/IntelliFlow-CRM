import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/components/home/PinButton', () => ({
  PinButton: ({ className }: { className?: string }) => (
    <button type="button" className={className}>
      Pin
    </button>
  ),
}));

import { LeadPageHeader, leadHeaderSheetActions, convertBlockedReason } from '../LeadPageHeader';

afterEach(() => cleanup());

const lead = (over: Record<string, unknown> = {}) => ({
  id: 'lead-1',
  firstName: null,
  lastName: null,
  company: 'West London Handyman Ltd',
  email: 'info@wlh.example.invalid',
  status: 'QUALIFIED',
  ...over,
});

const handlers = () => ({
  onOpenConvert: vi.fn(),
  onOpenQualify: vi.fn(),
  onEdit: vi.fn(),
  onLogCall: vi.fn(),
  onOpenActionSheet: vi.fn(),
});

describe('LeadPageHeader', () => {
  it('shows the lead name as the page title on every screen (not screen-reader only)', () => {
    render(<LeadPageHeader lead={lead()} {...handlers()} />);
    const title = screen.getByRole('heading', { level: 1, name: 'West London Handyman Ltd' });
    expect(title.className).not.toContain('sr-only');
    // It truncates instead of wrapping, so the header stays one line.
    expect(title.className).toContain('truncate');
  });

  it('is one row at every width, with the title allowed to shrink', () => {
    const { container } = render(<LeadPageHeader lead={lead()} {...handlers()} />);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('flex');
    expect(row.className).not.toContain('flex-col');
    expect(row.querySelector('.min-w-0')).not.toBeNull();
  });

  it('keeps Log call and the three-dots button on a phone; the rest is desktop-only', () => {
    render(<LeadPageHeader lead={lead()} {...handlers()} />);
    const phoneVisible = (el: HTMLElement) =>
      !el.closest('.hidden') || el.closest('.hidden')!.className.includes('sm:');
    // Log call and More actions are not inside a phone-hidden wrapper...
    for (const name of [/log call/i, /more actions/i]) {
      const button = screen.getByRole('button', { name });
      expect(button.closest('.hidden')).toBeNull();
    }
    // ...Qualify/Convert/Edit are inside the wrapper hidden below sm, and Pin hides itself.
    for (const name of [/convert to deal/i, /edit lead/i]) {
      const button = screen.getByRole('button', { name });
      const hidden = button.closest('.hidden');
      expect(hidden).not.toBeNull();
      expect(hidden!.className).toContain('sm:contents');
    }
    expect(screen.getByRole('button', { name: 'Pin' }).className).toContain(
      'hidden sm:inline-flex'
    );
    expect(phoneVisible(screen.getByRole('button', { name: /log call/i }))).toBe(true);
  });

  it('wires the buttons', () => {
    const h = handlers();
    render(<LeadPageHeader lead={lead({ status: 'NEW' })} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: /log call/i }));
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit lead/i }));
    fireEvent.click(screen.getByRole('button', { name: /qualify lead/i }));
    expect(h.onLogCall).toHaveBeenCalledTimes(1);
    expect(h.onOpenActionSheet).toHaveBeenCalledTimes(1);
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect(h.onOpenQualify).toHaveBeenCalledTimes(1);
  });

  it('names a lead with no person name by its company, then its email', () => {
    render(<LeadPageHeader lead={lead({ company: '' })} {...handlers()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('info@wlh.example.invalid');
  });
});

describe('leadHeaderSheetActions: what a phone header moves into the three-dots sheet', () => {
  const noop = { onOpenQualify: vi.fn(), onOpenConvert: vi.fn() };

  it('offers Qualify for a lead that can be qualified, and Convert disabled with its reason', () => {
    const actions = leadHeaderSheetActions(lead({ status: 'NEW' }), noop);
    expect(actions.map((a) => a.label)).toEqual(['Qualify', 'Convert to deal']);
    const convert = actions.find((a) => a.label === 'Convert to deal')!;
    expect(convert.disabled).toBe(true);
    expect(convert.hint).toBe('Lead must be qualified before conversion.');
  });

  it('enables Convert for a qualified lead and runs the handlers', () => {
    const h = { onOpenQualify: vi.fn(), onOpenConvert: vi.fn() };
    const actions = leadHeaderSheetActions(lead({ status: 'QUALIFIED' }), h);
    const convert = actions.find((a) => a.label === 'Convert to deal')!;
    expect(convert.disabled).toBe(false);
    convert.onClick();
    expect(h.onOpenConvert).toHaveBeenCalledTimes(1);
  });

  it('lists no Convert for a converted lead and gives each blocked status its own reason', () => {
    expect(
      leadHeaderSheetActions(lead({ status: 'CONVERTED' }), noop).map((a) => a.label)
    ).not.toContain('Convert to deal');
    expect(convertBlockedReason('LOST')).toContain('Reopen');
    expect(convertBlockedReason('UNQUALIFIED')).toContain('Disqualified');
    expect(convertBlockedReason('NEGOTIATING')).toContain('Qualify the lead first');
    expect(convertBlockedReason('QUALIFIED')).toBeNull();
  });
});
