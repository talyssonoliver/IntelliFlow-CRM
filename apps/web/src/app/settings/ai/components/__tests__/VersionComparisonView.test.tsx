/**
 * VersionComparisonView Tests
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Tests for the side-by-side version comparison component.
 * Covers: AC11 (version comparison shows diff)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionComparisonView } from '../VersionComparisonView';
import type { ChainVersionSummary } from '@intelliflow/validators';
import type { VersionComparison } from '../../hooks/useChainVersions';

const mockVersions: ChainVersionSummary[] = [
  {
    id: 'v1-uuid-1111',
    chainType: 'SCORING',
    status: 'ACTIVE',
    model: 'gpt-4',
    description: 'Production scoring v1',
    rolloutStrategy: 'IMMEDIATE',
    rolloutPercent: null,
    createdAt: new Date('2025-06-01'),
    createdBy: 'admin@test.com',
  },
  {
    id: 'v2-uuid-2222',
    chainType: 'SCORING',
    status: 'DRAFT',
    model: 'gpt-4-turbo',
    description: 'Improved scoring v2',
    rolloutStrategy: 'PERCENTAGE',
    rolloutPercent: 50,
    createdAt: new Date('2025-06-15'),
    createdBy: 'dev@test.com',
  },
  {
    id: 'v3-uuid-3333',
    chainType: 'QUALIFICATION',
    status: 'DEPRECATED',
    model: 'gpt-3.5-turbo',
    description: 'Old qualification',
    rolloutStrategy: 'IMMEDIATE',
    rolloutPercent: null,
    createdAt: new Date('2025-05-01'),
    createdBy: 'admin@test.com',
  },
];

const mockComparison: VersionComparison = {
  versionA: {
    id: 'v1-uuid-1111',
    chainType: 'SCORING',
    status: 'ACTIVE',
    model: 'gpt-4',
    prompt: 'You are a lead scoring expert.',
    temperature: 0.7,
    maxTokens: 2000,
    description: 'Production scoring v1',
    config: { contextLength: 4096 },
  } as any,
  versionB: {
    id: 'v2-uuid-2222',
    chainType: 'SCORING',
    status: 'DRAFT',
    model: 'gpt-4-turbo',
    prompt: 'You are an advanced lead scoring expert with deep analysis.',
    temperature: 0.5,
    maxTokens: 4000,
    description: 'Improved scoring v2',
    config: { contextLength: 8192 },
  } as any,
  differences: [
    { field: 'model', valueA: 'gpt-4', valueB: 'gpt-4-turbo' },
    { field: 'temperature', valueA: 0.7, valueB: 0.5 },
    { field: 'maxTokens', valueA: 2000, valueB: 4000 },
    { field: 'prompt', valueA: 'You are a lead scoring expert.', valueB: 'You are an advanced lead scoring expert with deep analysis.' },
  ],
};

describe('VersionComparisonView', () => {
  const defaultProps = {
    versions: mockVersions,
    onCompare: vi.fn().mockResolvedValue(mockComparison),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render side-by-side comparison layout', () => {
    render(<VersionComparisonView {...defaultProps} />);

    expect(screen.getByText('Version A')).toBeInTheDocument();
    expect(screen.getByText('Version B')).toBeInTheDocument();
  });

  it('should show version selection dropdowns', () => {
    render(<VersionComparisonView {...defaultProps} />);

    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it('should show empty state when no versions selected', () => {
    render(<VersionComparisonView {...defaultProps} />);

    expect(screen.getByText(/select two versions/i)).toBeInTheDocument();
  });

  it('should display version A details after comparison', async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn().mockResolvedValue(mockComparison);
    render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

    // Select version A
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'v1-uuid-1111');
    // Select version B
    await user.selectOptions(selects[1], 'v2-uuid-2222');

    // Click compare
    const compareButton = screen.getByRole('button', { name: /compare/i });
    await user.click(compareButton);

    await waitFor(() => {
      // gpt-4 appears in both version details and diff table, so use getAllByText
      const gpt4Elements = screen.getAllByText('gpt-4');
      expect(gpt4Elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should display version B details after comparison', async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn().mockResolvedValue(mockComparison);
    render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'v1-uuid-1111');
    await user.selectOptions(selects[1], 'v2-uuid-2222');

    const compareButton = screen.getByRole('button', { name: /compare/i });
    await user.click(compareButton);

    await waitFor(() => {
      const turboElements = screen.getAllByText('gpt-4-turbo');
      expect(turboElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('should highlight differences between versions', async () => {
    const user = userEvent.setup();
    const onCompare = vi.fn().mockResolvedValue(mockComparison);
    render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'v1-uuid-1111');
    await user.selectOptions(selects[1], 'v2-uuid-2222');

    const compareButton = screen.getByRole('button', { name: /compare/i });
    await user.click(compareButton);

    await waitFor(() => {
      // Should show the differences table
      expect(screen.getByText('Differences')).toBeInTheDocument();
      expect(screen.getByText('temperature')).toBeInTheDocument();
      expect(screen.getByText('maxTokens')).toBeInTheDocument();
    });
  });

  it('should show loading state while fetching comparison', async () => {
    render(<VersionComparisonView {...defaultProps} isLoading={true} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
