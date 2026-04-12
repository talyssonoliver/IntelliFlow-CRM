export type SdkStatus = 'stable' | 'beta' | 'coming-soon';
export type PackageManager = 'npm' | 'pnpm' | 'yarn';

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

export const SDK_REGISTRY: SdkPackage[] = [
  {
    id: 'typescript-sdk',
    name: 'TypeScript SDK',
    language: 'typescript',
    version: '0.1.0',
    packageName: '@intelliflow/api-client',
    description: 'Official TypeScript/JavaScript SDK for IntelliFlow CRM API with full type safety',
    status: 'beta',
    installCommands: {
      npm: 'npm install @intelliflow/api-client',
      pnpm: 'pnpm add @intelliflow/api-client',
      yarn: 'yarn add @intelliflow/api-client',
    },
  },
  {
    id: 'react-hooks',
    name: 'React Hooks',
    language: 'typescript',
    version: '0.1.0',
    packageName: '@intelliflow/api-client',
    description: 'Pre-built React hooks for common CRM operations with React Query caching',
    status: 'stable',
    installCommands: {
      npm: 'npm install @intelliflow/api-client',
      pnpm: 'pnpm add @intelliflow/api-client',
      yarn: 'yarn add @intelliflow/api-client',
    },
  },
  {
    id: 'python-sdk',
    name: 'Python SDK',
    language: 'python',
    version: '0.0.1',
    packageName: 'intelliflow-crm',
    description: 'Python client library for IntelliFlow CRM API',
    status: 'coming-soon',
    installCommands: {
      npm: 'pip install intelliflow-crm',
      pnpm: 'pip install intelliflow-crm',
      yarn: 'pip install intelliflow-crm',
    },
  },
  {
    id: 'go-sdk',
    name: 'Go SDK',
    language: 'go',
    version: '0.0.1',
    packageName: 'intelliflow-go',
    description: 'Go client library for IntelliFlow CRM API',
    status: 'coming-soon',
    installCommands: {
      npm: 'go get intelliflow-go',
      pnpm: 'go get intelliflow-go',
      yarn: 'go get intelliflow-go',
    },
  },
  {
    id: 'cli-tools',
    name: 'CLI Tools',
    language: 'typescript',
    version: '0.0.1',
    packageName: '@intelliflow/cli',
    description: 'Command-line interface for managing IntelliFlow CRM resources',
    status: 'coming-soon',
    installCommands: {
      npm: 'npm install -g @intelliflow/cli',
      pnpm: 'pnpm add -g @intelliflow/cli',
      yarn: 'yarn global add @intelliflow/cli',
    },
  },
];

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
