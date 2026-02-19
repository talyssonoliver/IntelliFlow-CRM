/**
 * ExperimentResultsPanel tests (PG-149 coverage)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExperimentResultsPanel from '../ExperimentResultsPanel';

// Mock the hooks
vi.mock('@/lib/experiments/hooks', () => ({
  useExperimentResults: vi.fn(),
}));

import { useExperimentResults } from '@/lib/experiments/hooks';
const mockUseExperimentResults = vi.mocked(useExperimentResults);

const mockResult = {
  pValue: 0.023,
  isSignificant: true,
  effectSize: 0.65,
  confidenceInterval: { lower: 2.3, upper: 9.3 },
  controlMean: 72.5,
  controlStdDev: 8.2,
  controlSampleSize: 150,
  treatmentMean: 81.3,
  treatmentStdDev: 7.9,
  treatmentSampleSize: 148,
  winner: 'treatment' as const,
  recommendation: 'Deploy treatment variant — significant improvement observed.',
};

describe('ExperimentResultsPanel', () => {
  it('shows loading skeleton when loading', () => {
    mockUseExperimentResults.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByTestId('results-loading')).toBeInTheDocument();
  });

  it('shows error message on error', () => {
    mockUseExperimentResults.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('fetch failed'),
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByText('Failed to load results.')).toBeInTheDocument();
  });

  it('shows no results message when data is null', () => {
    mockUseExperimentResults.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByText('No results available.')).toBeInTheDocument();
  });

  it('renders variant comparison with means and std devs', () => {
    mockUseExperimentResults.mockReturnValue({
      data: mockResult,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);

    expect(screen.getByText('Variant Comparison')).toBeInTheDocument();
    expect(screen.getByText('72.50')).toBeInTheDocument();
    expect(screen.getByText('81.30')).toBeInTheDocument();
    expect(screen.getByText(/SD: 8.20/)).toBeInTheDocument();
    expect(screen.getByText(/SD: 7.90/)).toBeInTheDocument();
  });

  it('renders p-value and significance badge', () => {
    mockUseExperimentResults.mockReturnValue({
      data: mockResult,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);

    expect(screen.getByText('0.023')).toBeInTheDocument();
    expect(screen.getByText('Significant')).toBeInTheDocument();
    expect(screen.getByLabelText('Statistically significant')).toBeInTheDocument();
  });

  it('renders effect size with interpretation', () => {
    mockUseExperimentResults.mockReturnValue({
      data: mockResult,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);

    expect(screen.getByText('d = 0.650')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('renders confidence interval', () => {
    mockUseExperimentResults.mockReturnValue({
      data: mockResult,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByText('[2.3, 9.3]')).toBeInTheDocument();
  });

  it('renders winner badge', () => {
    mockUseExperimentResults.mockReturnValue({
      data: mockResult,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByLabelText('Winner: treatment')).toBeInTheDocument();
    expect(screen.getByLabelText('Winner: treatment')).toHaveTextContent('Treatment');
  });

  it('shows "No winner" when winner is null', () => {
    mockUseExperimentResults.mockReturnValue({
      data: { ...mockResult, winner: null },
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByText('No winner')).toBeInTheDocument();
  });

  it('renders control winner badge', () => {
    mockUseExperimentResults.mockReturnValue({
      data: { ...mockResult, winner: 'control' },
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByLabelText('Winner: control')).toBeInTheDocument();
    expect(screen.getByLabelText('Winner: control')).toHaveTextContent('Control');
  });

  it('renders recommendation', () => {
    mockUseExperimentResults.mockReturnValue({
      data: mockResult,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByText('Recommendation')).toBeInTheDocument();
    expect(
      screen.getByText('Deploy treatment variant — significant improvement observed.')
    ).toBeInTheDocument();
  });

  it('hides recommendation when not present', () => {
    mockUseExperimentResults.mockReturnValue({
      data: { ...mockResult, recommendation: undefined },
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.queryByText('Recommendation')).not.toBeInTheDocument();
  });

  it('renders significance description text', () => {
    mockUseExperimentResults.mockReturnValue({
      data: mockResult,
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByText(/Significant \(p < 0\.05\)/)).toBeInTheDocument();
  });

  it('renders not significant badge for non-significant results', () => {
    mockUseExperimentResults.mockReturnValue({
      data: { ...mockResult, pValue: 0.5, isSignificant: false },
      isLoading: false,
      error: null,
    } as any);

    render(<ExperimentResultsPanel experimentId="exp-1" />);
    expect(screen.getByText('Not Significant')).toBeInTheDocument();
    expect(screen.getByLabelText('Not significant')).toBeInTheDocument();
  });
});
