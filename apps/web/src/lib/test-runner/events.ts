/**
 * Test Runner Events
 *
 * EventEmitter for progress events between the test spawner and SSE endpoint.
 * Enables real-time streaming of test results to the UI.
 */

import { EventEmitter } from 'events';
import type { TestRunProgress } from './types';

class TestRunnerEvents extends EventEmitter {
  /**
   * Emit a progress event for a specific test run
   */
  emitProgress(progress: TestRunProgress): void {
    // Emit to general listeners
    this.emit('progress', progress);
    // Emit to run-specific listeners
    this.emit(`progress:${progress.runId}`, progress);
  }

  /**
   * Subscribe to progress events for a specific run
   */
  onRunProgress(runId: string, handler: (progress: TestRunProgress) => void): void {
    this.on(`progress:${runId}`, handler);
  }

  /**
   * Unsubscribe from progress events for a specific run
   */
  offRunProgress(runId: string, handler: (progress: TestRunProgress) => void): void {
    this.off(`progress:${runId}`, handler);
  }

  /**
   * Subscribe to all progress events
   */
  onAllProgress(handler: (progress: TestRunProgress) => void): void {
    this.on('progress', handler);
  }

  /**
   * Unsubscribe from all progress events
   */
  offAllProgress(handler: (progress: TestRunProgress) => void): void {
    this.off('progress', handler);
  }
}

// Singleton instance for cross-module communication
export const testRunnerEvents = new TestRunnerEvents();
