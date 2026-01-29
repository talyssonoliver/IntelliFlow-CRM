/**
 * Type declarations for clamscan module
 * ClamAV Node.js integration
 */
declare module 'clamscan' {
  interface ClamScanConfig {
    removeInfected?: boolean;
    quarantineInfected?: boolean | string;
    scanLog?: string | null;
    debugMode?: boolean;
    preference?: 'clamdscan' | 'clamscan';
    clamdscan?: {
      host?: string;
      port?: number;
      timeout?: number;
      localFallback?: boolean;
      socket?: string;
      path?: string;
      configFile?: string;
      multiscan?: boolean;
      reloadDb?: boolean;
      active?: boolean;
    };
    clamscan?: {
      path?: string;
      db?: string;
      scanArchives?: boolean;
      active?: boolean;
    };
  }

  interface ScanResult {
    isInfected: boolean;
    viruses?: string[];
    file?: string;
    resultString?: string;
    version?: string;
  }

  interface StreamResult {
    isInfected: boolean;
    viruses?: string[];
  }

  class NodeClam {
    init(config?: ClamScanConfig): Promise<NodeClam>;
    isInfected(filePath: string): Promise<ScanResult>;
    scanFile(filePath: string): Promise<ScanResult>;
    scanDir(directoryPath: string): Promise<ScanResult & { goodFiles: string[]; badFiles: string[] }>;
    scanStream(stream: NodeJS.ReadableStream | Buffer): Promise<StreamResult>;
    getVersion(): Promise<string>;
    passthrough(): NodeJS.Transform;
  }

  export = NodeClam;
}
