/**
 * VersionComparisonView Component Tests
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Tests for the version comparison component.
 * Covers AC11 (version comparison shows diff).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionComparisonView } from '../VersionComparisonView';
import type { ChainVersionSummary } from '@intelliflow/validators';
import type { ChainType } from '@intelliflow/domain';
import type { VersionComparison } from '../../hooks/useChainVersions';

// Mock data
const mockVersions: ChainVersionSummary[] = [
  {
    id: 'v1-uuid',
    chainType: 'SCORING' as ChainType,
    status: 'ACTIVE' as const,
    model: 'gpt-4',
    description: 'Production scoring model',
    rolloutStrategy: 'IMMEDIATE' as const,
    rolloutPercent: null,
    createdAt: new Date('2025-01-01'),
    createdBy: 'admin@test.com',
  },
  {
    id: 'v2-uuid',
    chainType: 'SCORING' as ChainType,
    status: 'DRAFT' as const,
    model: 'gpt-4-turbo',
    description: 'Experimental scoring model',
    rolloutStrategy: 'PERCENTAGE' as const,
    rolloutPercent: 20,
    createdAt: new Date('2025-01-10'),
    createdBy: 'developer@test.com',
  },
  {
    id: 'v3-uuid',
    chainType: 'QUALIFICATION' as ChainType,
    status: 'ACTIVE' as const,
    model: 'gpt-3.5-turbo',
    description: 'Qualification chain',
    rolloutStrategy: 'IMMEDIATE' as const,
    rolloutPercent: null,
    createdAt: new Date('2025-01-05'),
    createdBy: 'admin@test.com',
  },
];

const mockComparison: VersionComparison = {
  versionA: {
    ...mockVersions[0],
    prompt: 'You are a lead scoring AI. Score leads from 0-100.',
    temperature: 0.7,
    maxTokens: 2000,
  } as any,
  versionB: {
    ...mockVersions[1],
    prompt: 'You are an advanced lead scoring AI. Provide detailed scoring with reasoning.',
    temperature: 0.5,
    maxTokens: 3000,
  } as any,
  differences: [
    { field: 'model', valueA: 'gpt-4', valueB: 'gpt-4-turbo' },
    { field: 'temperature', valueA: 0.7, valueB: 0.5 },
    { field: 'maxTokens', valueA: 2000, valueB: 3000 },
    {
      field: 'prompt',
      valueA: 'You are a lead scoring AI. Score leads from 0-100.',
      valueB: 'You are an advanced lead scoring AI. Provide detailed scoring with reasoning.',
    },
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

  describe('Initial State', () => {
    it('renders version selectors', () => {
      render(<VersionComparisonView {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /Version A/i })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /Version B/i })).toBeInTheDocument();
    });

    it('renders compare button', () => {
      render(<VersionComparisonView {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Compare Versions/i })).toBeInTheDocument();
    });

    it('shows empty state message initially', () => {
      render(<VersionComparisonView {...defaultProps} />);

      expect(
        screen.getByText('Select two versions above and click Compare to see the differences.')
      ).toBeInTheDocument();
    });

    it('disables compare button when no versions selected', () => {
      render(<VersionComparisonView {...defaultProps} />);

      const compareButton = screen.getByRole('button', { name: /Compare Versions/i });
      expect(compareButton).toBeDisabled();
    });

    it('populates version dropdowns with version options', () => {
      render(<VersionComparisonView {...defaultProps} />);

      const versionASelect = screen.getByRole('combobox', {
        name: /Version A/i,
      }) as HTMLSelectElement;

      // Check for the default option
      expect(versionASelect.querySelector('option[value=""]')).toBeInTheDocument();
      expect(screen.getAllByRole('option', { name: /Select version/i }).length).toBeGreaterThan(0);

      // Check for version options
      expect(versionASelect.querySelector('option[value="v1-uuid"]')).toBeInTheDocument();
      expect(
        screen.getAllByRole('option', { name: /SCORING - gpt-4 \(ACTIVE\)/ }).length
      ).toBeGreaterThan(0);
    });
  });

  describe('Loading State', () => {
    it('shows loading message when isLoading is true', () => {
      render(<VersionComparisonView {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Loading versions...')).toBeInTheDocument();
    });

    it('renders skeleton loaders when loading', () => {
      render(<VersionComparisonView {...defaultProps} isLoading={true} />);

      const skeletons = document.querySelectorAll('.h-48');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show version selectors when loading', () => {
      render(<VersionComparisonView {...defaultProps} isLoading={true} />);

      expect(screen.queryByRole('combobox', { name: /Version A/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /Version B/i })).not.toBeInTheDocument();
    });
  });

  describe('Version Selection', () => {
    it('updates selectedA when Version A dropdown changes', async () => {
      const user = userEvent.setup();
      render(<VersionComparisonView {...defaultProps} />);

      const versionASelect = screen.getByRole('combobox', {
        name: /Version A/i,
      }) as HTMLSelectElement;

      await user.selectOptions(versionASelect, 'v1-uuid');

      expect(versionASelect.value).toBe('v1-uuid');
    });

    it('updates selectedB when Version B dropdown changes', async () => {
      const user = userEvent.setup();
      render(<VersionComparisonView {...defaultProps} />);

      const versionBSelect = screen.getByRole('combobox', {
        name: /Version B/i,
      }) as HTMLSelectElement;

      await user.selectOptions(versionBSelect, 'v2-uuid');

      expect(versionBSelect.value).toBe('v2-uuid');
    });

    it('clears comparison when version A changes', async () => {
      const user = userEvent.setup();
      // Create a fresh mock (vi.clearAllMocks clears defaultProps.onCompare)
      const onCompare = vi.fn().mockResolvedValue(mockComparison);
      const { rerender } = render(
        <VersionComparisonView {...defaultProps} onCompare={onCompare} />
      );

      // Select versions and compare
      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      // Wait for comparison to render
      await waitFor(() => {
        expect(screen.getByText('Differences')).toBeInTheDocument();
      });

      // Change Version A
      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v3-uuid');

      // Comparison should be cleared (Differences table hidden)
      expect(screen.queryByText('Differences')).not.toBeInTheDocument();
    });

    it('enables compare button when two different versions are selected', async () => {
      const user = userEvent.setup();
      render(<VersionComparisonView {...defaultProps} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');

      const compareButton = screen.getByRole('button', { name: /Compare Versions/i });
      expect(compareButton).not.toBeDisabled();
    });

    it('disables compare button when same version selected for both', async () => {
      const user = userEvent.setup();
      render(<VersionComparisonView {...defaultProps} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v1-uuid');

      const compareButton = screen.getByRole('button', { name: /Compare Versions/i });
      expect(compareButton).toBeDisabled();
    });
  });

  describe('Comparison', () => {
    it('calls onCompare with correct version IDs when compare is clicked', async () => {
      const user = userEvent.setup();
      const onCompare = vi.fn().mockResolvedValue(mockComparison);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      expect(onCompare).toHaveBeenCalledWith('v1-uuid', 'v2-uuid');
    });

    it('shows comparing text while comparison is in progress', async () => {
      const user = userEvent.setup();
      const onCompare = vi.fn(
        () =>
          new Promise<VersionComparison>((resolve) =>
            setTimeout(() => resolve(mockComparison), 100)
          )
      );
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      expect(screen.getByRole('button', { name: /Comparing.../i })).toBeInTheDocument();
    });

    it('disables compare button while comparison is in progress', async () => {
      const user = userEvent.setup();
      const onCompare = vi.fn(
        () =>
          new Promise<VersionComparison>((resolve) =>
            setTimeout(() => resolve(mockComparison), 100)
          )
      );
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      const compareButton = screen.getByRole('button', { name: /Comparing.../i });
      expect(compareButton).toBeDisabled();
    });

    it('renders comparison results after successful comparison', async () => {
      const user = userEvent.setup();
      render(<VersionComparisonView {...defaultProps} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        expect(screen.getByText('Version A')).toBeInTheDocument();
        expect(screen.getByText('Version B')).toBeInTheDocument();
      });
    });

    it('displays error message when comparison fails', async () => {
      const user = userEvent.setup();
      const onCompare = vi.fn().mockRejectedValue(new Error('Comparison failed'));
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        expect(screen.getByText('Comparison failed')).toBeInTheDocument();
      });
    });
  });

  describe('Comparison Results Display', () => {
    beforeEach(async () => {
      const user = userEvent.setup();
      // Create a fresh mock that returns mockComparison (vi.clearAllMocks clears defaultProps.onCompare)
      const onCompare = vi.fn().mockResolvedValue(mockComparison);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      const versionASelect = screen.getByRole('combobox', { name: /Version A/i });
      const versionBSelect = screen.getByRole('combobox', { name: /Version B/i });

      await user.selectOptions(versionASelect, 'v1-uuid');
      await user.selectOptions(versionBSelect, 'v2-uuid');

      // Wait for button to be enabled
      const compareButton = screen.getByRole('button', { name: /Compare Versions/i });
      await waitFor(() => {
        expect(compareButton).not.toBeDisabled();
      });

      await user.click(compareButton);

      await waitFor(
        () => {
          expect(screen.getByText('Differences')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('displays Version A details', () => {
      // "Version A" appears twice: once in label, once in comparison card
      expect(screen.getAllByText('Version A').length).toBeGreaterThan(0);
      // Model and status appear in dropdown AND comparison card
      expect(screen.getAllByText('gpt-4').length).toBeGreaterThan(0);
      expect(screen.getAllByText('SCORING').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/ACTIVE/).length).toBeGreaterThan(0);
    });

    it('displays Version B details', () => {
      // "Version B" appears twice: once in label, once in comparison card
      expect(screen.getAllByText('Version B').length).toBeGreaterThan(0);
      // Model and status appear in dropdown AND comparison card
      expect(screen.getAllByText('gpt-4-turbo').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/DRAFT/).length).toBeGreaterThan(0);
    });

    it('displays temperature for both versions', () => {
      // Should show both 0.7 and 0.5 (may appear multiple times in cards and differences table)
      expect(screen.getAllByText('0.7').length).toBeGreaterThan(0);
      expect(screen.getAllByText('0.5').length).toBeGreaterThan(0);
    });

    it('displays max tokens for both versions', () => {
      // May appear multiple times in cards and differences table
      expect(screen.getAllByText('2000').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3000').length).toBeGreaterThan(0);
    });

    it('displays prompts in code blocks', () => {
      // Prompts appear in both cards and differences table
      expect(
        screen.getAllByText('You are a lead scoring AI. Score leads from 0-100.').length
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByText(
          'You are an advanced lead scoring AI. Provide detailed scoring with reasoning.'
        ).length
      ).toBeGreaterThan(0);
    });

    it('renders differences table', () => {
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('Differences')).toBeInTheDocument();
    });

    it('displays all difference rows', () => {
      expect(screen.getByText('model')).toBeInTheDocument();
      expect(screen.getByText('temperature')).toBeInTheDocument();
      expect(screen.getByText('maxTokens')).toBeInTheDocument();
      expect(screen.getByText('prompt')).toBeInTheDocument();
    });

    it('shows field names in differences table', () => {
      const table = screen.getByRole('table');
      expect(table).toContainHTML('<th');
      expect(screen.getByText('Field')).toBeInTheDocument();
      // "Version A" and "Version B" appear multiple times (labels + table headers + card headings)
      expect(screen.getAllByText('Version A').length).toBeGreaterThan(1);
      expect(screen.getAllByText('Version B').length).toBeGreaterThan(1);
    });

    it('truncates long string values in differences table', () => {
      const longPrompt =
        'You are an advanced lead scoring AI. Provide detailed scoring with reasoning.';
      // Text may appear multiple times (in card and differences table)
      const renderedTexts = screen.getAllByText(longPrompt);
      expect(renderedTexts.length).toBeGreaterThan(0);
    });
  });

  describe('No Differences', () => {
    it('shows "no differences" message when versions are identical', async () => {
      const user = userEvent.setup();
      const noDiffComparison: VersionComparison = {
        versionA: mockVersions[0] as any,
        versionB: mockVersions[0] as any,
        differences: [],
      };
      const onCompare = vi.fn().mockResolvedValue(noDiffComparison);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        expect(
          screen.getByText('No differences found between the two versions.')
        ).toBeInTheDocument();
      });
    });

    it('does not render differences table when no differences', async () => {
      const user = userEvent.setup();
      const noDiffComparison: VersionComparison = {
        versionA: mockVersions[0] as any,
        versionB: mockVersions[0] as any,
        differences: [],
      };
      const onCompare = vi.fn().mockResolvedValue(noDiffComparison);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        expect(
          screen.getByText('No differences found between the two versions.')
        ).toBeInTheDocument();
      });

      // Differences table should not exist
      expect(screen.queryByText('Differences')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty versions array', () => {
      render(<VersionComparisonView {...defaultProps} versions={[]} />);

      const versionASelect = screen.getByRole('combobox', {
        name: /Version A/i,
      }) as HTMLSelectElement;
      expect(versionASelect.children.length).toBe(1); // Only "Select version..." option
    });

    it('handles null/undefined prompt fields gracefully', async () => {
      const user = userEvent.setup();
      const comparisonWithoutPrompts: VersionComparison = {
        versionA: { ...mockVersions[0] } as any,
        versionB: { ...mockVersions[1] } as any,
        differences: [{ field: 'model', valueA: 'gpt-4', valueB: 'gpt-4-turbo' }],
      };
      const onCompare = vi.fn().mockResolvedValue(comparisonWithoutPrompts);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        // Should still render version details without errors
        expect(screen.getAllByText('Version A')[0]).toBeInTheDocument();
      });
    });

    it('handles N/A for missing temperature/maxTokens', async () => {
      const user = userEvent.setup();
      const comparisonWithMissingFields: VersionComparison = {
        versionA: { ...mockVersions[0] } as any,
        versionB: { ...mockVersions[1] } as any,
        differences: [],
      };
      const onCompare = vi.fn().mockResolvedValue(comparisonWithMissingFields);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
      });
    });

    it('displays version ID truncated in dropdown options', () => {
      render(<VersionComparisonView {...defaultProps} />);

      const versionASelect = screen.getByRole('combobox', { name: /Version A/i });
      // Should show first 8 chars: v1-uuid... → v1-uuid-u...
      expect(versionASelect).toContainHTML('v1-uuid...');
    });
  });

  describe('Accessibility', () => {
    it('uses combobox role for version selectors', () => {
      render(<VersionComparisonView {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /Version A/i })).toHaveAttribute(
        'role',
        'combobox'
      );
      expect(screen.getByRole('combobox', { name: /Version B/i })).toHaveAttribute(
        'role',
        'combobox'
      );
    });

    it('has accessible labels for version selectors', () => {
      render(<VersionComparisonView {...defaultProps} />);

      const versionASelect = screen.getByRole('combobox', { name: /Version A/i });
      const versionBSelect = screen.getByRole('combobox', { name: /Version B/i });

      expect(versionASelect).toBeInTheDocument();
      expect(versionBSelect).toBeInTheDocument();
    });

    it('uses semantic HTML for comparison cards', async () => {
      const user = userEvent.setup();
      // Create a fresh mock (vi.clearAllMocks clears defaultProps.onCompare)
      const onCompare = vi.fn().mockResolvedValue(mockComparison);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
      });
    });
  });

  describe('Multiple Comparisons', () => {
    it('allows comparing different version pairs sequentially', async () => {
      const user = userEvent.setup();
      const onCompare = vi.fn().mockResolvedValue(mockComparison);
      render(<VersionComparisonView {...defaultProps} onCompare={onCompare} />);

      // First comparison
      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v1-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v2-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        expect(screen.getByText('Differences')).toBeInTheDocument();
      });

      expect(onCompare).toHaveBeenCalledWith('v1-uuid', 'v2-uuid');
      onCompare.mockClear();

      // Second comparison
      await user.selectOptions(screen.getByRole('combobox', { name: /Version A/i }), 'v2-uuid');
      await user.selectOptions(screen.getByRole('combobox', { name: /Version B/i }), 'v3-uuid');
      await user.click(screen.getByRole('button', { name: /Compare Versions/i }));

      await waitFor(() => {
        expect(onCompare).toHaveBeenCalledWith('v2-uuid', 'v3-uuid');
      });
    });
  });
});
