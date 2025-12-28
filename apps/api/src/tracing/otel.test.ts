import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions/incubating';

let lastNodeSdkOptions: unknown;
const nodeSdkStart = vi.fn();
const nodeSdkShutdown = vi.fn(async () => {});

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class NodeSDK {
    constructor(options: unknown) {
      lastNodeSdkOptions = options;
    }
    start() {
      nodeSdkStart();
    }
    async shutdown() {
      return nodeSdkShutdown();
    }
  },
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: () => [],
}));

describe('OpenTelemetry SDK (otel.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    lastNodeSdkOptions = undefined;
    nodeSdkStart.mockClear();
    nodeSdkShutdown.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('returns null when OTEL_ENABLED=false', async () => {
    process.env.OTEL_ENABLED = 'false';
    const { initializeOpenTelemetry } = await import('./otel.js');

    const sdk = initializeOpenTelemetry();

    expect(sdk).toBeNull();
    expect(lastNodeSdkOptions).toBeUndefined();
  }, 30000);

  it('creates a NodeSDK with resource attributes when enabled', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.NODE_ENV = 'development';
    process.env.OTEL_SERVICE_NAME = 'intelliflow-api-test';
    process.env.npm_package_version = '9.9.9';

    const { initializeOpenTelemetry, shutdownOpenTelemetry } = await import('./otel.js');

    const sdk = initializeOpenTelemetry();
    expect(sdk).not.toBeNull();
    expect(lastNodeSdkOptions).toBeDefined();

    const options = lastNodeSdkOptions as { resource?: { attributes?: Record<string, unknown> } };
    const attrs = options.resource?.attributes ?? {};

    expect(attrs[ATTR_SERVICE_NAME]).toBe('intelliflow-api-test');
    expect(attrs[ATTR_SERVICE_VERSION]).toBe('9.9.9');
    expect(attrs[ATTR_DEPLOYMENT_ENVIRONMENT_NAME]).toBe('development');

    await shutdownOpenTelemetry(sdk);
    expect(nodeSdkShutdown).toHaveBeenCalledTimes(1);
  });
});
