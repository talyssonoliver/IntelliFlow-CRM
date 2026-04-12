import type { AVScannerPort, AVScanResult } from '@intelliflow/application';

/**
 * No-Op AV Scanner Adapter
 *
 * Returns clean/safe results for all files. Used in development and test
 * environments where ClamAV daemon is not available.
 *
 * In production, use ClamAVScanner or a cloud AV service instead.
 */
export class NoOpAVScanner implements AVScannerPort {
  async scan(_file: Buffer | string): Promise<AVScanResult> {
    return {
      clean: true,
      threatName: null,
      scanDuration: 0,
      engine: 'NoOp/1.0.0 (dev)',
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
