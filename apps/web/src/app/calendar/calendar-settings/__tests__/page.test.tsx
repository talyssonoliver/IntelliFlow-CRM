import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../CalendarSettingsContent', () => ({
  default: () => <div data-testid="calendar-settings-content">CalendarSettingsContent</div>,
}));

import CalendarSettingsPage from '../page';

describe('CalendarSettingsPage', () => {
  it('renders CalendarSettingsContent', () => {
    render(<CalendarSettingsPage />);
    expect(screen.getByTestId('calendar-settings-content')).toBeInTheDocument();
  });

  it('does not render the coming-soon stub', () => {
    render(<CalendarSettingsPage />);
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
