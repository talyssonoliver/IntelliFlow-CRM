// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import {
  ExperimentDashboard,
  type ExperimentSummary,
  type ExperimentResult,
} from '../src/components/experiment/ExperimentDashboard';

const now = new Date('2026-01-15T00:00:00Z');

function makeExperiment(overrides: Partial<ExperimentSummary> = {}): ExperimentSummary {
  return {
    id: 'exp-1',
    name: 'Test Experiment',
    description: 'A test experiment',
    type: 'AI_VS_MANUAL',
    status: 'RUNNING',
    hypothesis: 'AI will outperform manual',
    controlVariant: 'Manual',
    treatmentVariant: 'AI',
    trafficPercent: 50,
    startDate: now,
    endDate: null,
    minSampleSize: 100,
    significanceLevel: 0.05,
    controlSampleSize: 45,
    treatmentSampleSize: 55,
    totalAssignments: 100,
    progressPercent: 60,
    hasResult: false,
    isSignificant: null,
    winner: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const baseResult: ExperimentResult = {
  controlMean: 0.65,
  treatmentMean: 0.78,
  controlStdDev: 0.12,
  treatmentStdDev: 0.1,
  pValue: 0.03,
  effectSize: 0.2,
  isSignificant: true,
  winner: 'treatment',
  recommendation: 'Switch to AI model',
};

describe('ExperimentDashboard', () => {
  it('renders with empty experiments', () => {
    const { container } = render(<ExperimentDashboard experiments={[]} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<ExperimentDashboard experiments={[]} isLoading />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders experiment list', () => {
    const experiments = [
      makeExperiment({ id: 'exp-1', name: 'Experiment One' }),
      makeExperiment({ id: 'exp-2', name: 'Experiment Two', status: 'DRAFT' }),
    ];
    render(<ExperimentDashboard experiments={experiments} />);
    expect(screen.getByText('Experiment One')).toBeInTheDocument();
    expect(screen.getByText('Experiment Two')).toBeInTheDocument();
  });

  it('renders RUNNING status badge', () => {
    render(<ExperimentDashboard experiments={[makeExperiment({ status: 'RUNNING' })]} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders DRAFT status badge', () => {
    render(<ExperimentDashboard experiments={[makeExperiment({ status: 'DRAFT' })]} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders PAUSED status badge', () => {
    render(<ExperimentDashboard experiments={[makeExperiment({ status: 'PAUSED' })]} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('renders COMPLETED status badge', () => {
    render(<ExperimentDashboard experiments={[makeExperiment({ status: 'COMPLETED' })]} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders ARCHIVED status badge', () => {
    render(<ExperimentDashboard experiments={[makeExperiment({ status: 'ARCHIVED' })]} />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('calls onSelectExperiment when experiment clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const experiments = [makeExperiment({ id: 'exp-1', name: 'My Experiment' })];
    render(<ExperimentDashboard experiments={experiments} onSelectExperiment={onSelect} />);
    await user.click(screen.getByText('My Experiment'));
    expect(onSelect).toHaveBeenCalledWith('exp-1');
  });

  it('calls onCreateExperiment when create button clicked', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(<ExperimentDashboard experiments={[]} onCreateExperiment={onCreate} />);
    const createBtn = screen.getByRole('button', { name: /new experiment|create/i });
    await user.click(createBtn);
    expect(onCreate).toHaveBeenCalled();
  });

  it('renders selected experiment detail', () => {
    const selected = makeExperiment({
      id: 'exp-1',
      name: 'Selected Experiment',
      status: 'RUNNING',
    });
    render(<ExperimentDashboard experiments={[selected]} selectedExperiment={selected} />);
    expect(screen.getByText('Selected Experiment')).toBeInTheDocument();
  });

  it('renders results when selectedResult is provided', () => {
    const selected = makeExperiment({ id: 'exp-1', status: 'COMPLETED', hasResult: true });
    render(
      <ExperimentDashboard
        experiments={[selected]}
        selectedExperiment={selected}
        selectedResult={baseResult}
      />
    );
    expect(screen.getByText('Switch to AI model')).toBeInTheDocument();
  });

  it('renders significant winner badge (treatment)', () => {
    const experiment = makeExperiment({
      status: 'COMPLETED',
      hasResult: true,
      isSignificant: true,
      winner: 'treatment',
    });
    render(<ExperimentDashboard experiments={[experiment]} />);
    expect(screen.getByText(/AI wins/i)).toBeInTheDocument();
  });

  it('renders significant winner badge (control)', () => {
    const experiment = makeExperiment({
      status: 'COMPLETED',
      hasResult: true,
      isSignificant: true,
      winner: 'control',
    });
    render(<ExperimentDashboard experiments={[experiment]} />);
    expect(screen.getByText(/Manual wins/i)).toBeInTheDocument();
  });

  it('renders no significant difference badge', () => {
    const experiment = makeExperiment({
      status: 'COMPLETED',
      hasResult: true,
      isSignificant: false,
      winner: null,
    });
    render(<ExperimentDashboard experiments={[experiment]} />);
    expect(screen.getByText('No significant difference')).toBeInTheDocument();
  });

  it('calls onStartExperiment for DRAFT experiments', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    const experiment = makeExperiment({ id: 'exp-1', status: 'DRAFT' });
    render(
      <ExperimentDashboard
        experiments={[experiment]}
        selectedExperiment={experiment}
        onStartExperiment={onStart}
      />
    );
    // Multiple elements may match; find the native <button> with text "Start"
    const allStartButtons = screen.getAllByRole('button', { name: /^start$/i });
    const startBtn = allStartButtons[0];
    await user.click(startBtn);
    expect(onStart).toHaveBeenCalledWith('exp-1');
  });

  it('calls onPauseExperiment for RUNNING experiments', async () => {
    const onPause = vi.fn();
    const user = userEvent.setup();
    const experiment = makeExperiment({ id: 'exp-1', status: 'RUNNING' });
    render(
      <ExperimentDashboard
        experiments={[experiment]}
        selectedExperiment={experiment}
        onPauseExperiment={onPause}
      />
    );
    const allPauseButtons = screen.getAllByRole('button', { name: /^pause$/i });
    const pauseBtn = allPauseButtons[0];
    await user.click(pauseBtn);
    expect(onPause).toHaveBeenCalledWith('exp-1');
  });

  it('renders progress bar', () => {
    const experiment = makeExperiment({ progressPercent: 75 });
    const { container } = render(
      <ExperimentDashboard experiments={[experiment]} selectedExperiment={experiment} />
    );
    // Progress bar div exists
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toBeInTheDocument();
  });

  it('renders MODEL_COMPARISON type', () => {
    const { container } = render(
      <ExperimentDashboard experiments={[makeExperiment({ type: 'MODEL_COMPARISON' })]} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders THRESHOLD_TEST type', () => {
    const { container } = render(
      <ExperimentDashboard experiments={[makeExperiment({ type: 'THRESHOLD_TEST' })]} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<ExperimentDashboard experiments={[]} className="my-dashboard" />);
    expect(container.firstChild).toHaveClass('my-dashboard');
  });

  it('renders experiment with null startDate', () => {
    const { container } = render(
      <ExperimentDashboard experiments={[makeExperiment({ startDate: null })]} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders experiment with end date', () => {
    const { container } = render(
      <ExperimentDashboard experiments={[makeExperiment({ endDate: new Date('2026-06-01') })]} />
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
