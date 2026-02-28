/**
 * Account Settings Page Tests
 *
 * Task: IFC-191 — User Timezone Support
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock tRPC
const mockRefetch = vi.fn();
const mockMutate = vi.fn();
let mockProfileData: any = null;
let mockIsLoading = false;
let mockIsPending = false;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    user: {
      getProfile: {
        useQuery: () => ({
          data: mockProfileData,
          isLoading: mockIsLoading,
          refetch: mockRefetch,
        }),
      },
      updateTimezone: {
        useMutation: (opts: any) => {
          // Store the onSuccess/onError callbacks for testing
          (globalThis as any).__mutationOpts = opts;
          return {
            mutate: mockMutate,
            isPending: mockIsPending,
          };
        },
      },
    },
  },
}));

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  toast: vi.fn(),
}));

// Mock TimezoneSelector
vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: ({ value, onChange, disabled }: any) => (
    <div data-testid="timezone-selector" data-value={value} data-disabled={disabled}>
      <button data-testid="tz-change" onClick={() => onChange('Asia/Tokyo')}>
        Change TZ
      </button>
    </div>
  ),
}));

// Must import AFTER mocks are declared
import AccountPage from '../page';

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileData = {
      name: 'Test User',
      email: 'test@example.com',
      role: 'USER',
      timezone: 'America/New_York',
    };
    mockIsLoading = false;
    mockIsPending = false;
  });

  it('renders TimezoneSelector within the page', () => {
    render(<AccountPage />);

    const tzSelector = screen.getByTestId('timezone-selector');
    expect(tzSelector).toBeTruthy();
  });

  it('loads current timezone from profile data', () => {
    render(<AccountPage />);

    const tzSelector = screen.getByTestId('timezone-selector');
    // Initially set from useEffect when data loads
    expect(tzSelector.getAttribute('data-value')).toBeTruthy();
  });

  it('save button triggers updateTimezone mutation', async () => {
    render(<AccountPage />);

    // Change timezone
    const changeBtn = screen.getByTestId('tz-change');
    fireEvent.click(changeBtn);

    // Click save
    const saveBtn = screen.getByText('Save Preferences');
    fireEvent.click(saveBtn);

    expect(mockMutate).toHaveBeenCalledWith({ timezone: 'Asia/Tokyo' });
  });

  it('success toast shown after successful save', async () => {
    const { toast } = await import('@intelliflow/ui');
    render(<AccountPage />);

    // Trigger onSuccess callback
    const opts = (globalThis as any).__mutationOpts;
    if (opts?.onSuccess) {
      opts.onSuccess();
    }

    expect(toast).toHaveBeenCalledWith({ description: 'Timezone updated successfully' });
  });

  it('shows disabled controls while loading', () => {
    mockIsLoading = true;
    render(<AccountPage />);

    const tzSelector = screen.getByTestId('timezone-selector');
    expect(tzSelector.getAttribute('data-disabled')).toBe('true');
  });

  it('populates profile fields from async data', () => {
    render(<AccountPage />);

    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    const roleInput = screen.getByLabelText('Role') as HTMLInputElement;

    expect(nameInput.value).toBe('Test User');
    expect(emailInput.value).toBe('test@example.com');
    expect(roleInput.value).toBe('USER');
  });

  it('starts with empty fields when data is not yet loaded', () => {
    mockProfileData = null;
    render(<AccountPage />);

    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;

    expect(nameInput.value).toBe('');
    expect(emailInput.value).toBe('');
  });

  it('allows editing the name field', () => {
    render(<AccountPage />);

    const nameInput = screen.getByLabelText('Full Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });

    expect(nameInput.value).toBe('Jane Doe');
  });
});
