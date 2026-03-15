/**
 * ScoringRulesTab Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests point value rendering, activity type labels,
 * and change propagation via onRulesChange.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ScoringRule } from '../components/ScoringRulesTab';

// ─── @intelliflow/ui mock ───────────────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Input: ({
    value,
    onChange,
    id,
    type,
    min,
    max,
    step,
    className,
    ...props
  }: any) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      type={type}
      min={min}
      max={max}
      step={step}
      className={className}
      {...props}
    />
  ),
}));

// Import after mocks
import { ScoringRulesTab } from '../components/ScoringRulesTab';

const mockRules: ScoringRule[] = [
  { activityType: 'EMAIL_OPEN', points: 5 },
  { activityType: 'EMAIL_CLICK', points: 10 },
  { activityType: 'MEETING_SCHEDULED', points: 25 },
  { activityType: 'FORM_SUBMISSION', points: 20 },
  { activityType: 'WEBSITE_VISIT', points: 3 },
  { activityType: 'CALL_COMPLETED', points: 15 },
];

describe('ScoringRulesTab', () => {
  let onRulesChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onRulesChange = vi.fn();
  });

  it('renders the Scoring Rules heading', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    expect(screen.getByText('Scoring Rules')).toBeInTheDocument();
  });

  it('renders activity types with human-readable labels', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    expect(screen.getByText('Email Open')).toBeInTheDocument();
    expect(screen.getByText('Email Click')).toBeInTheDocument();
    expect(screen.getByText('Meeting Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Form Submission')).toBeInTheDocument();
    expect(screen.getByText('Website Visit')).toBeInTheDocument();
    expect(screen.getByText('Call Completed')).toBeInTheDocument();
  });

  it('renders point inputs with correct initial values', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    const emailOpenInput = screen.getByRole('spinbutton', {
      name: /email open/i,
    }) as HTMLInputElement;
    expect(emailOpenInput.value).toBe('5');

    const emailClickInput = screen.getByRole('spinbutton', {
      name: /email click/i,
    }) as HTMLInputElement;
    expect(emailClickInput.value).toBe('10');

    const meetingInput = screen.getByRole('spinbutton', {
      name: /meeting scheduled/i,
    }) as HTMLInputElement;
    expect(meetingInput.value).toBe('25');
  });

  it('renders all 6 point inputs', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(6);
  });

  it('changing a point value calls onRulesChange with updated rules', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    const emailOpenInput = screen.getByRole('spinbutton', { name: /email open/i });
    fireEvent.change(emailOpenInput, { target: { value: '8' } });

    expect(onRulesChange).toHaveBeenCalledOnce();
    const updatedRules: ScoringRule[] = onRulesChange.mock.calls[0][0];
    const emailOpenRule = updatedRules.find((r) => r.activityType === 'EMAIL_OPEN');
    expect(emailOpenRule?.points).toBe(8);
  });

  it('other rules are unchanged when one rule is updated', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    const emailOpenInput = screen.getByRole('spinbutton', { name: /email open/i });
    fireEvent.change(emailOpenInput, { target: { value: '8' } });

    const updatedRules: ScoringRule[] = onRulesChange.mock.calls[0][0];
    const emailClickRule = updatedRules.find((r) => r.activityType === 'EMAIL_CLICK');
    expect(emailClickRule?.points).toBe(10);
  });

  it('clamps point value to 0 when input is negative', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    const emailOpenInput = screen.getByRole('spinbutton', { name: /email open/i });
    fireEvent.change(emailOpenInput, { target: { value: '-5' } });

    const updatedRules: ScoringRule[] = onRulesChange.mock.calls[0][0];
    const emailOpenRule = updatedRules.find((r) => r.activityType === 'EMAIL_OPEN');
    expect(emailOpenRule?.points).toBe(0);
  });

  it('clamps point value to 1000 when input exceeds maximum', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    const emailOpenInput = screen.getByRole('spinbutton', { name: /email open/i });
    fireEvent.change(emailOpenInput, { target: { value: '9999' } });

    const updatedRules: ScoringRule[] = onRulesChange.mock.calls[0][0];
    const emailOpenRule = updatedRules.find((r) => r.activityType === 'EMAIL_OPEN');
    expect(emailOpenRule?.points).toBe(1000);
  });

  it('renders "pts" label next to each input', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    const ptsLabels = screen.getAllByText('pts');
    expect(ptsLabels).toHaveLength(6);
  });

  it('renders with empty rules list without crashing', () => {
    render(<ScoringRulesTab rules={[]} onRulesChange={onRulesChange} />);

    expect(screen.getByText('Scoring Rules')).toBeInTheDocument();
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('renders unknown activity type key as fallback label', () => {
    const rulesWithUnknown: ScoringRule[] = [
      { activityType: 'UNKNOWN_TYPE', points: 7 },
    ];
    render(<ScoringRulesTab rules={rulesWithUnknown} onRulesChange={onRulesChange} />);

    // Unknown type falls back to the raw key
    expect(screen.getByText('UNKNOWN_TYPE')).toBeInTheDocument();
  });

  it('each input is associated with its activity type label via id', () => {
    render(<ScoringRulesTab rules={mockRules} onRulesChange={onRulesChange} />);

    // Label with htmlFor=scoring-EMAIL_OPEN should be linked
    const label = screen.getByText('Email Open');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'scoring-EMAIL_OPEN');

    const input = document.getElementById('scoring-EMAIL_OPEN');
    expect(input).toBeInTheDocument();
  });
});
