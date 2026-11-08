/**
 * @vitest-environment jsdom
 *
 * TestRunnerModal: what the user sees as the test-run event stream arrives. Replaces
 * test-runner-modal.test.ts, .supplementary.test.tsx and .supplementary2.test.ts, which asserted
 * copies of the event handling, the percentage and the colours (#1216). The real event handling
 * had no test.
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestRunnerModal } from '../test-runner-modal';

let source: { onmessage: ((e: { data: string }) => void) | null; close: ReturnType<typeof vi.fn> };
let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  mockFetch = vi.fn(async () => ({
    json: async () => ({ success: true, runId: 'run-1', eventsUrl: '/api/events/run-1' }),
  }));
  vi.stubGlobal('fetch', mockFetch);
  class FakeEventSource {
    onmessage = null;
    onerror = null;
    close = vi.fn();
    constructor() {
      source = this as never;
    }
  }
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => vi.unstubAllGlobals());

/** Sends one SSE message to the modal. */
function emit(event: Record<string, unknown>) {
  act(() => source.onmessage?.({ data: JSON.stringify(event) }));
}

/** The number shown above a counter's label (Passed, Failed, Skipped). */
const tile = (label: string) => screen.getByText(label).previousElementSibling?.textContent;

async function startRun(onComplete = vi.fn()) {
  const view = render(<TestRunnerModal isOpen onClose={vi.fn()} onComplete={onComplete} />);
  fireEvent.click(screen.getByRole('button', { name: /start tests/i }));
  await waitFor(() => expect(screen.getByText(/Starting .* test run/)).toBeInTheDocument());
  return { ...view, onComplete };
}

describe('TestRunnerModal events', () => {
  it('counts passes, failures and skips, and shows the passing percentage', async () => {
    await startRun();
    emit({ type: 'test_pass', data: { testName: 'adds numbers' } });
    emit({ type: 'test_pass', data: { testName: 'subtracts' } });
    emit({ type: 'test_fail', data: { testName: 'divides by zero' } });
    emit({ type: 'test_skip', data: { testName: 'later' } });

    expect(tile('Passed')).toBe('2');
    expect(tile('Failed')).toBe('1');
    expect(tile('Skipped')).toBe('1');
    expect(screen.getByText('50% passing')).toBeInTheDocument();
    expect(screen.getByText('divides by zero')).toHaveClass('text-red-500');
  });

  it('logs the suite being run, by name or by file', async () => {
    await startRun();
    emit({ type: 'suite_start', data: { file: 'a.test.ts', suiteName: 'Maths' } });
    emit({ type: 'suite_start', data: { file: 'b.test.ts' } });
    expect(screen.getByText('Running: Maths')).toBeInTheDocument();
    expect(screen.getByText('Running: b.test.ts')).toBeInTheDocument();
  });

  it('on complete: takes the final counts, shows results, closes the stream, calls onComplete once', async () => {
    const { onComplete } = await startRun();
    emit({ type: 'test_pass', data: { testName: 'one' } });
    emit({
      type: 'complete',
      data: { testsRun: 10, testsPassed: 9, testsFailed: 1, testsSkipped: 0 },
    });

    expect(tile('Passed')).toBe('9');
    expect(tile('Failed')).toBe('1');
    expect(screen.queryByText(/% passing/)).toBeNull(); // the live percentage is for a running run
    expect(screen.getByText('Test run complete!')).toBeInTheDocument();
    expect(screen.getByText('Test Results')).toBeInTheDocument();
    expect(source.close).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows coverage once the run completes: green from 80%, amber from 50%, red below', async () => {
    await startRun();
    const pct = (p: number) => ({ pct: p });
    emit({
      type: 'coverage_complete',
      data: {
        coverage: { lines: pct(85), statements: pct(80), functions: pct(50), branches: pct(49.5) },
      },
    });
    expect(screen.queryByText('85.0%')).toBeNull(); // not while the run is going
    emit({ type: 'complete', data: {} });
    expect(screen.getByText('85.0%')).toHaveClass('text-emerald-500');
    expect(screen.getByText('80.0%')).toHaveClass('text-emerald-500');
    expect(screen.getByText('50.0%')).toHaveClass('text-amber-500');
    expect(screen.getByText('49.5%')).toHaveClass('text-red-500');
  });

  it('shows the run error, or a default one, and stops', async () => {
    await startRun();
    emit({ type: 'error', data: {} });
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(source.close).toHaveBeenCalled();
    expect(screen.queryByText('Running Tests...')).toBeNull();
  });

  it('shows why the run could not start', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockImplementationOnce(async () => ({
      json: async () => ({ success: false, error: 'Another run is in progress' }),
    }));
    render(<TestRunnerModal isOpen onClose={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /start tests/i }));
    await waitFor(() => expect(screen.getByText('Another run is in progress')).toBeInTheDocument());
  });

  it('ignores a message that is not JSON', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await startRun();
    act(() => source.onmessage?.({ data: 'not json' }));
    expect(errorSpy).toHaveBeenCalledWith('Failed to parse SSE message:', expect.any(Error));
    expect(tile('Passed')).toBe('0');
  });

  it('starts from zero when reopened', async () => {
    const { rerender } = await startRun();
    emit({ type: 'test_pass', data: { testName: 'one' } });
    expect(tile('Passed')).toBe('1');

    rerender(<TestRunnerModal isOpen={false} onClose={vi.fn()} onComplete={vi.fn()} />);
    rerender(<TestRunnerModal isOpen onClose={vi.fn()} onComplete={vi.fn()} />);
    expect(tile('Passed')).toBe('0');
  });
});
