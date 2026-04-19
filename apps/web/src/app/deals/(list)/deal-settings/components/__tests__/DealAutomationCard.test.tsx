import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealAutomationCard } from '../DealAutomationCard';
import { DEFAULT_DEAL_AUTOMATION } from '@intelliflow/validators';

describe('DealAutomationCard', () => {
  it('renders all 5 section headings', () => {
    render(<DealAutomationCard settings={DEFAULT_DEAL_AUTOMATION} onSettingsChange={vi.fn()} />);
    expect(screen.getByText('Duplicate Detection')).toBeDefined();
    expect(screen.getByText('Role-Based Access')).toBeDefined();
    expect(screen.getByText('Data Hygiene')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
    expect(screen.getByText(/AI & Intelligence/i)).toBeDefined();
  });

  it('renders "Runtime delivered by IFC-312" hint', () => {
    render(<DealAutomationCard settings={DEFAULT_DEAL_AUTOMATION} onSettingsChange={vi.fn()} />);
    expect(screen.getByText(/Runtime delivered by IFC-312/i)).toBeDefined();
  });

  it('toggles a boolean flag', () => {
    const onChange = vi.fn();
    render(<DealAutomationCard settings={DEFAULT_DEAL_AUTOMATION} onSettingsChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Notify on duplicate'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].notifyOnDuplicate).toBe(false); // toggled off
  });

  it('updates highValueThreshold', () => {
    const onChange = vi.fn();
    render(<DealAutomationCard settings={DEFAULT_DEAL_AUTOMATION} onSettingsChange={onChange} />);
    const input = screen.getByLabelText(/high-value threshold/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '75000' } });
    expect(onChange).toHaveBeenCalled();
    const latest = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(latest.highValueThreshold).toBe(75000);
  });
});
