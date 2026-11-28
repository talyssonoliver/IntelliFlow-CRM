/**
 * Account Settings Page Tests
 *
 * Task: IFC-191 — User Timezone Support
 * Updated for dedicated profile layout (no ModuleSettingsLayout).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock auth
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
}));

// Mock tRPC
const mockRefetch = vi.fn();
const mockMutateAsync = vi.fn().mockResolvedValue({});
let mockProfileData: Record<string, unknown> | null = null;
let mockIsLoading = false;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    user: {
      getProfile: {
        useQuery: () => ({
          data: mockProfileData,
          isLoading: mockIsLoading,
          error: null,
          refetch: mockRefetch,
        }),
      },
      updateTimezone: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
      updateProfile: {
        useMutation: () => ({
          mutate: vi.fn(),
          mutateAsync: mockMutateAsync,
          isPending: false,
        }),
      },
    },
    useUtils: () => ({
      user: {
        getProfile: {
          invalidate: vi.fn(),
        },
      },
    }),
  },
}));

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({
    children,
    htmlFor,
    className,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
    className?: string;
  }) => (
    <label htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ),
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    className,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    className?: string;
    asChild?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className}>
      {children}
    </button>
  ),
  Switch: ({
    checked,
    onCheckedChange,
    defaultChecked,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
    defaultChecked?: boolean;
  }) => (
    <button
      data-testid="switch"
      role="switch"
      aria-checked={checked ?? defaultChecked ?? false}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
  Select: ({
    children,
    value,
    onValueChange: _onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  toast: vi.fn(),
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Mock TimezoneSelector
vi.mock('@/components/settings/TimezoneSelector', () => ({
  TimezoneSelector: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
  }) => (
    <div data-testid="timezone-selector" data-value={value} data-disabled={disabled}>
      <button data-testid="tz-change" onClick={() => onChange('Asia/Tokyo')}>
        Change TZ
      </button>
    </div>
  ),
}));

// Mock AppAvatar
vi.mock('@/components/shared/app-avatar', () => ({
  AppAvatar: ({ name, className }: { name: string; className?: string }) => (
    <div data-testid="app-avatar" data-name={name} className={className} />
  ),
}));

// Mock PageHeader
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({
    title,
    description,
    breadcrumbs,
    className,
  }: {
    title: string;
    description?: string;
    breadcrumbs?: Array<{ label: string; href?: string }>;
    className?: string;
  }) => (
    <div data-testid="page-header" className={className}>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {breadcrumbs?.map((b) => (
        <span key={b.label} data-href={b.href}>
          {b.label}
        </span>
      ))}
    </div>
  ),
}));

import AccountSettingsContent from '../AccountSettingsContent';

describe('AccountSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileData = {
      name: 'Test User',
      givenName: null,
      familyName: null,
      email: 'test@example.com',
      avatarUrl: null,
      role: 'ADMIN',
      timezone: 'America/New_York',
      locale: 'en-GB',
      phone: null,
      company: null,
      department: null,
      location: null,
      website: null,
      bio: null,
      provider: null,
      emailVerified: false,
      lastSignInAt: null,
      signInCount: 1,
      createdAt: '2025-01-15T00:00:00.000Z',
    };
    mockIsLoading = false;
  });

  it('renders the Profile Settings heading via PageHeader', () => {
    render(<AccountSettingsContent />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Profile Settings');
  });

  it('renders breadcrumbs with Dashboard and Settings', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('renders profile header card with avatar and user name', () => {
    render(<AccountSettingsContent />);
    const avatar = screen.getByTestId('app-avatar');
    expect(avatar.getAttribute('data-name')).toBe('Test User');
    expect(screen.getByText('Test User')).toBeTruthy();
  });

  it('shows the role in the profile header and account summary', () => {
    render(<AccountSettingsContent />);
    const roleElements = screen.getAllByText('ADMIN');
    expect(roleElements.length).toBeGreaterThanOrEqual(2);
  });

  it('populates first name and last name from profile data', () => {
    render(<AccountSettingsContent />);
    const firstNameInput = screen.getByLabelText('First Name') as HTMLInputElement;
    const lastNameInput = screen.getByLabelText('Last Name') as HTMLInputElement;
    expect(firstNameInput.value).toBe('Test');
    expect(lastNameInput.value).toBe('User');
  });

  it('populates email from profile data', () => {
    render(<AccountSettingsContent />);
    const emailInput = screen.getByLabelText('Email Address') as HTMLInputElement;
    expect(emailInput.value).toBe('test@example.com');
  });

  it('allows editing the first name field', () => {
    render(<AccountSettingsContent />);
    const firstNameInput = screen.getByLabelText('First Name') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });
    expect(firstNameInput.value).toBe('Jane');
  });

  it('loads timezone from profile data into TimezoneSelector', () => {
    render(<AccountSettingsContent />);
    const tzSelector = screen.getByTestId('timezone-selector');
    expect(tzSelector.getAttribute('data-value')).toBe('America/New_York');
  });

  it('shows loading skeleton when data is loading', () => {
    mockIsLoading = true;
    mockProfileData = null;
    render(<AccountSettingsContent />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders security section with Password, 2FA, and Sessions cards', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Password')).toBeTruthy();
    expect(screen.getByText('Two-Factor Auth')).toBeTruthy();
    expect(screen.getByText('Active Sessions')).toBeTruthy();
  });

  it('renders Change, Manage, and View security links', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Change')).toBeTruthy();
    expect(screen.getAllByText('Manage').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('View')).toBeTruthy();
  });

  it('renders Cancel and Save Changes buttons', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Save Changes')).toBeTruthy();
  });

  it('shows account summary with role and username', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Username')).toBeTruthy();
    expect(screen.getByText('test')).toBeTruthy();
  });

  it('has regional preferences section with timezone', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Regional Preferences')).toBeTruthy();
    expect(screen.getByTestId('timezone-selector')).toBeTruthy();
  });

  it('renders footer quick links and role-based account card links', () => {
    render(<AccountSettingsContent />);
    // Footer links
    expect(screen.getByText(/Security & Password/)).toBeTruthy();
    expect(screen.getByText('Notification Preferences')).toBeTruthy();
    // Account card + footer both show Team Settings for ADMIN role
    expect(screen.getAllByText('Team Settings').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Billing')).toBeTruthy();
  });

  it('renders appearance section with theme selector', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
  });

  it('renders regional preferences with timezone and date format', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Regional Preferences')).toBeTruthy();
    expect(screen.getByText('Date Format')).toBeTruthy();
    expect(screen.getByTestId('timezone-selector')).toBeTruthy();
  });

  it('renders notification quick settings with toggles', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByText('Email Notifications')).toBeTruthy();
    expect(screen.getByText('Desktop Notifications')).toBeTruthy();
    expect(screen.getByText('Sound Alerts')).toBeTruthy();
    const switches = screen.getAllByTestId('switch');
    expect(switches.length).toBeGreaterThanOrEqual(3);
  });

  it('renders contact info rows in profile card and form fields', () => {
    render(<AccountSettingsContent />);
    expect(screen.getAllByText('Company').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Location').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Department').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Website').length).toBeGreaterThanOrEqual(2);
  });
});
