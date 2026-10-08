export type SdkStatus = 'stable' | 'beta' | 'coming-soon';
export type PackageManager = 'npm' | 'pnpm' | 'yarn';
import sdkRegistryJson from '@/data/sdk-registry.json';
import { hasFields, isOneOf, parseJsonArray } from '@/lib/shared/json-data';

export interface SdkPackage {
  id: string;
  name: string;
  language: string;
  version: string;
  packageName: string;
  description: string;
  status: SdkStatus;
  installCommands: Record<PackageManager, string>;
}

const SDK_STATUSES: readonly SdkStatus[] = ['stable', 'beta', 'coming-soon'];

function isSdkPackage(value: unknown): boolean {
  return (
    hasFields(value, {
      id: 'string',
      name: 'string',
      language: 'string',
      version: 'string',
      packageName: 'string',
      description: 'string',
    }) &&
    isOneOf(value.status, SDK_STATUSES) &&
    hasFields(value.installCommands, { npm: 'string', pnpm: 'string', yarn: 'string' })
  );
}

/** Checks the SDK list (the JSON's shape) and returns it typed. */
export function parseSdkRegistry(data: unknown): SdkPackage[] {
  return parseJsonArray<SdkPackage>(data, 'data/sdk-registry.json', isSdkPackage);
}

/** The SDK list is content, kept in data/sdk-registry.json and checked here at load. */
export const SDK_REGISTRY: SdkPackage[] = parseSdkRegistry(sdkRegistryJson);

export function getInstallCommand(packageName: string, manager: PackageManager): string {
  const prefixes: Record<PackageManager, string> = {
    npm: 'npm install',
    pnpm: 'pnpm add',
    yarn: 'yarn add',
  };
  return `${prefixes[manager]} ${packageName}`;
}

export function getSdkByLanguage(language: string): SdkPackage | undefined {
  return SDK_REGISTRY.find((sdk) => sdk.language === language && sdk.status !== 'coming-soon');
}
