/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  tz: { timezone: 'Europe/London', timezoneLabel: 'London (GMT+1)' },
  selectorProps: null as null | Record<string, unknown>,
}));

vi.mock('@/providers/TimezoneProvider', () => ({ useTimezoneContext: () => h.tz }));
vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: (props: Record<string, any>) => {
    h.selectorProps = props;
    return (
      <select
        id={props.id}
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="Europe/London">Europe/London</option>
        <option value="America/New_York">America/New_York</option>
      </select>
    );
  },
}));

import { TimezoneCard } from '../TimezoneCard';

beforeEach(() => {
  h.tz = { timezone: 'Europe/London', timezoneLabel: 'London (GMT+1)' };
  h.selectorProps = null;
});

describe('TimezoneCard', () => {
  it('labels the selector as the firm timezone and hides browser detection', () => {
    render(
      <TimezoneCard
        timezone="Europe/London"
        onChange={vi.fn()}
        isConfigured
        readOnly={false}
        announce={vi.fn()}
      />
    );
    expect(screen.getByRole('region', { name: 'Timezone' })).toBeInTheDocument();
    expect(screen.getByLabelText('Firm timezone')).toHaveValue('Europe/London');
    expect(h.selectorProps?.showDetect).toBe(false);
    expect(
      screen.getByText(/keeps the times and applies them in the new zone/)
    ).toBeInTheDocument();
  });

  it('notes when the viewer zone differs from the firm zone', () => {
    h.tz = { timezone: 'America/New_York', timezoneLabel: 'New York (GMT-4)' };
    render(
      <TimezoneCard
        timezone="Europe/London"
        onChange={vi.fn()}
        isConfigured
        readOnly={false}
        announce={vi.fn()}
      />
    );
    expect(
      screen.getByText('Your timezone is New York (GMT-4); hours here are in Europe/London.')
    ).toBeInTheDocument();
  });

  it('does not show the note when the zones match', () => {
    render(
      <TimezoneCard
        timezone="Europe/London"
        onChange={vi.fn()}
        isConfigured
        readOnly={false}
        announce={vi.fn()}
      />
    );
    expect(screen.queryByText(/Your timezone is/)).not.toBeInTheDocument();
  });

  it('asks to confirm the zone while availability has not been saved', () => {
    render(
      <TimezoneCard
        timezone="Europe/London"
        onChange={vi.fn()}
        isConfigured={false}
        readOnly={false}
        announce={vi.fn()}
      />
    );
    expect(screen.getByText('Confirm your firm timezone before saving.')).toBeInTheDocument();
  });

  it('reports changes and announces them', () => {
    const onChange = vi.fn();
    const announce = vi.fn();
    render(
      <TimezoneCard
        timezone="Europe/London"
        onChange={onChange}
        isConfigured
        readOnly={false}
        announce={announce}
      />
    );
    fireEvent.change(screen.getByLabelText('Firm timezone'), {
      target: { value: 'America/New_York' },
    });
    expect(onChange).toHaveBeenCalledWith('America/New_York');
    expect(announce).toHaveBeenCalledWith('Timezone set to America/New_York.');
  });

  it('wires an error to the selector', () => {
    render(
      <TimezoneCard
        timezone=""
        onChange={vi.fn()}
        isConfigured
        readOnly={false}
        announce={vi.fn()}
        error="Choose a valid timezone"
      />
    );
    expect(h.selectorProps?.invalid).toBe(true);
    // Error first, then the always-present help text.
    expect(screen.getByLabelText('Firm timezone')).toHaveAccessibleDescription(
      'Choose a valid timezone Changing the zone keeps the times and applies them in the new zone.'
    );
    expect(screen.getByText('Choose a valid timezone').className).toContain('text-red-700');
  });

  it('shows the zone as text when read-only', () => {
    render(
      <TimezoneCard
        timezone="Europe/London"
        onChange={vi.fn()}
        isConfigured
        readOnly
        announce={vi.fn()}
      />
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Europe/London')).toBeInTheDocument();
  });
});
