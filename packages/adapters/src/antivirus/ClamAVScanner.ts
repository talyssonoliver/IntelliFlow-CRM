import { AVScannerPort, AVScanResult } from '@intelliflow/application';
import NodeClam from 'clamscan';

/**
 * ClamAV Scanner Adapter
 *
 * Integrates with ClamAV antivirus daemon for file scanning.
 * Requires ClamAV to be installed and clamav-daemon running.
 *
 * Installation:
 * - Ubuntu/Debian: sudo apt-get install clamav clamav-daemon
 * - MacOS: brew install clamav
 * - Windows: Download from https://www.clamav.net/downloads
 *
 * Start daemon:
 * - sudo systemctl start clamav-daemon (Linux)
 * - sudo freshclam (update virus definitions)
 */
export class ClamAVScanner implements AVScannerPort {
  private clamscan: any;
  private initialized = false;

  constructor(
    private readonly config: {
      host?: string;
      port?: number;
      timeout?: number;
    } = {}
  ) {}

  async scan(file: Buffer | string): Promise<AVScanResult> {
    await this.ensureInitialized();

    const startTime = Date.now();

    try {
      let result: any;

      if (Buffer.isBuffer(file)) {
        // Scan buffer
        result = await this.clamscan.scanStream(file);
      } else {
        // Scan file path
        result = await this.clamscan.isInfected(file);
      }

      const scanDuration = Date.now() - startTime;

      return {
        clean: !result.isInfected,
        threatName: result.viruses?.length > 0 ? result.viruses[0] : null,
        scanDuration,
        engine: `ClamAV ${result.version || 'unknown'}`,
      };
    } catch (error: any) {
      throw new Error(`AV scan failed: ${error.message}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const version = await this.clamscan.getVersion();
      return !!version;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize ClamAV client on first use (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    const ClamScan = NodeClam;
    this.clamscan = await new ClamScan().init({
      removeInfected: false, // Don't auto-delete
      quarantineInfected: false,
      scanLog: null,
      debugMode: process.env.NODE_ENV === 'development',
      clamdscan: {
        host: this.config.host || 'localhost',
        port: this.config.port || 3310,
        timeout: this.config.timeout || 30000,
        localFallback: false, // Don't fallback to clamscan binary
      },
    });

    this.initialized = true;
  }
}

/**
 * Mock AV Scanner for testing/development
 */
export class MockAVScanner implements AVScannerPort {
  private shouldFail = false;
  private infected = false;

  async scan(file: Buffer | string): Promise<AVScanResult> {
    if (this.shouldFail) {
      throw new Error('Mock AV scanner configured to fail');
    }

    // Check for EICAR test virus string
    const content = Buffer.isBuffer(file) ? file.toString() : '';
    const isEicar = content.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');

    return {
      clean: !this.infected && !isEicar,
      threatName: this.infected || isEicar ? 'EICAR-Test-File' : null,
      scanDuration: 10,
      engine: 'MockAV 1.0.0',
    };
  }

  async isHealthy(): Promise<boolean> {
    return !this.shouldFail;
  }

  // Test helpers
  setInfected(infected: boolean): void {
    this.infected = infected;
  }

  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }
}
