/**
 * Antivirus Scanner Port
 *
 * Interface for antivirus scanning services.
 * Implementations can use ClamAV, cloud AV services (VirusTotal, MetaDefender), etc.
 */
export interface AVScanResult {
  clean: boolean;
  threatName: string | null;
  scanDuration: number; // milliseconds
  engine: string; // e.g., "ClamAV 1.0.0"
}

export interface AVScannerPort {
  /**
   * Scan a file for viruses
   * @param file File buffer or file path
   * @returns Scan result with clean status and threat details
   */
  scan(file: Buffer | string): Promise<AVScanResult>;

  /**
   * Check if AV scanner is healthy and ready
   * @returns true if scanner is operational
   */
  isHealthy(): Promise<boolean>;
}
