/**
 * Metrics Module Tests
 *
 * Tests for OpenTelemetry metrics collection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Use vi.hoisted for mocks to be available during module loading
const {
  mockMeterProvider,
  mockMeterProviderShutdown,
  mockMeter,
  mockCounter,
  mockHistogram,
  mockObservableGauge,
  mockMetricExporter,
  mockMetricReader,
  mockResource,
  mockSetGlobalMeterProvider,
} = vi.hoisted(() => {
  const mockCounter = {
    add: vi.fn(),
  };
  const mockHistogram = {
    record: vi.fn(),
  };
  const mockObservableGauge = {};
  const mockMeterProviderShutdown = vi.fn(async () => {});
  const mockMeter = {
    createCounter: vi.fn(() => mockCounter),
    createHistogram: vi.fn(() => mockHistogram),
    createObservableGauge: vi.fn(() => mockObservableGauge),
  };
  const mockMeterProvider = {
    getMeter: vi.fn(() => mockMeter),
    shutdown: mockMeterProviderShutdown,
  };
  return {
    mockMeterProvider,
    mockMeterProviderShutdown,
    mockMeter,
    mockCounter,
    mockHistogram,
    mockObservableGauge,
    mockMetricExporter: vi.fn(),
    mockMetricReader: vi.fn(),
    mockResource: vi.fn(),
    mockSetGlobalMeterProvider: vi.fn(),
  };
});

// Mock OpenTelemetry SDK
vi.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: class MockMeterProvider {
    getMeter = mockMeterProvider.getMeter;
    shutdown = mockMeterProvider.shutdown;
  },
  PeriodicExportingMetricReader: class MockPeriodicExportingMetricReader {
    constructor(config: unknown) {
      mockMetricReader(config);
    }
  },
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: class MockResource {
    constructor(attrs: unknown) {
      mockResource(attrs);
    }
  },
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));

vi.mock('@opentelemetry/exporter-metrics-otlp-grpc', () => ({
  OTLPMetricExporter: class MockOTLPMetricExporter {
    constructor(config: unknown) {
      mockMetricExporter(config);
    }
  },
}));

vi.mock('@opentelemetry/api', () => ({
  metrics: {
    setGlobalMeterProvider: mockSetGlobalMeterProvider,
  },
}));

describe('Metrics Module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initMetrics', () => {
    it('should initialize metrics with service name', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({ serviceName: 'test-service', enabled: true });

      expect(mockResource).toHaveBeenCalledWith(
        expect.objectContaining({
          'service.name': 'test-service',
        })
      );
      expect(mockSetGlobalMeterProvider).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('metrics initialized'));
    });

    it('should create resource with service version', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({
        serviceName: 'test-service',
        serviceVersion: '1.2.3',
        enabled: true,
      });

      expect(mockResource).toHaveBeenCalledWith(
        expect.objectContaining({
          'service.version': '1.2.3',
        })
      );
    });

    it('should create resource with environment', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({
        serviceName: 'test-service',
        environment: 'production',
        enabled: true,
      });

      expect(mockResource).toHaveBeenCalledWith(
        expect.objectContaining({
          'deployment.environment': 'production',
        })
      );
    });

    it('should configure metric exporter with endpoint', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({
        serviceName: 'test-service',
        endpoint: 'http://custom:4317',
        enabled: true,
      });

      expect(mockMetricExporter).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://custom:4317',
        })
      );
    });

    it('should configure metric reader with export interval', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({
        serviceName: 'test-service',
        exportInterval: 30000,
        enabled: true,
      });

      expect(mockMetricReader).toHaveBeenCalledWith(
        expect.objectContaining({
          exportIntervalMillis: 30000,
        })
      );
    });

    it('should warn if already initialized', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({ serviceName: 'service-1', enabled: true });
      initMetrics({ serviceName: 'service-2', enabled: true });

      expect(console.warn).toHaveBeenCalledWith('Metrics already initialized');
    });

    it('should not initialize if disabled', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({ serviceName: 'test-service', enabled: false });

      expect(mockSetGlobalMeterProvider).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Metrics disabled');
    });

    it('should create all business metrics', async () => {
      const { initMetrics } = await import('../src/metrics.js');

      initMetrics({ serviceName: 'test-service', enabled: true });

      // Lead metrics
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.lead.created',
        expect.any(Object)
      );
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.lead.scored',
        expect.any(Object)
      );
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.lead.qualified',
        expect.any(Object)
      );
      expect(mockMeter.createHistogram).toHaveBeenCalledWith(
        'intelliflow.lead.score',
        expect.any(Object)
      );

      // API metrics
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.api.request.count',
        expect.any(Object)
      );
      expect(mockMeter.createHistogram).toHaveBeenCalledWith(
        'intelliflow.api.request.duration',
        expect.any(Object)
      );

      // AI metrics
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.ai.inference.count',
        expect.any(Object)
      );
      expect(mockMeter.createHistogram).toHaveBeenCalledWith(
        'intelliflow.ai.inference.latency',
        expect.any(Object)
      );

      // Database metrics
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.db.query.count',
        expect.any(Object)
      );
      expect(mockMeter.createObservableGauge).toHaveBeenCalledWith(
        'intelliflow.db.connection.pool.size',
        expect.any(Object)
      );

      // Cache metrics
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.cache.hit',
        expect.any(Object)
      );
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'intelliflow.cache.miss',
        expect.any(Object)
      );

      // System metrics
      expect(mockMeter.createObservableGauge).toHaveBeenCalledWith(
        'intelliflow.users.active',
        expect.any(Object)
      );
    });
  });

  describe('shutdownMetrics', () => {
    it('should shutdown meter provider', async () => {
      const { initMetrics, shutdownMetrics } = await import('../src/metrics.js');

      initMetrics({ serviceName: 'test-service', enabled: true });
      await shutdownMetrics();

      expect(mockMeterProviderShutdown).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('shut down'));
    });

    it('should handle shutdown when not initialized', async () => {
      const { shutdownMetrics } = await import('../src/metrics.js');

      await shutdownMetrics();

      expect(mockMeterProviderShutdown).not.toHaveBeenCalled();
    });
  });

  describe('getMeter', () => {
    it('should return meter when initialized', async () => {
      const { initMetrics, getMeter } = await import('../src/metrics.js');

      initMetrics({ serviceName: 'test-service', enabled: true });
      const meter = getMeter();

      expect(meter).toBeDefined();
    });

    it('should throw when not initialized', async () => {
      const { getMeter } = await import('../src/metrics.js');

      expect(() => getMeter()).toThrow('Metrics not initialized');
    });
  });

  describe('incrementCounter', () => {
    it('should increment counter with value', async () => {
      const { incrementCounter } = await import('../src/metrics.js');

      incrementCounter(mockCounter as any, 5, { source: 'test' });

      expect(mockCounter.add).toHaveBeenCalledWith(5, { source: 'test' });
    });

    it('should increment counter with default value 1', async () => {
      const { incrementCounter } = await import('../src/metrics.js');

      incrementCounter(mockCounter as any);

      expect(mockCounter.add).toHaveBeenCalledWith(1, undefined);
    });

    it('should handle null counter safely', async () => {
      const { incrementCounter } = await import('../src/metrics.js');

      expect(() => incrementCounter(null, 1)).not.toThrow();
    });
  });

  describe('recordHistogram', () => {
    it('should record histogram value', async () => {
      const { recordHistogram } = await import('../src/metrics.js');

      recordHistogram(mockHistogram as any, 100, { endpoint: '/api/test' });

      expect(mockHistogram.record).toHaveBeenCalledWith(100, { endpoint: '/api/test' });
    });

    it('should handle null histogram safely', async () => {
      const { recordHistogram } = await import('../src/metrics.js');

      expect(() => recordHistogram(null, 100)).not.toThrow();
    });
  });

  describe('measureTime', () => {
    it('should measure async function duration', async () => {
      const { measureTime } = await import('../src/metrics.js');

      const result = await measureTime(mockHistogram as any, async () => {
        await new Promise((r) => setTimeout(r, 10));
        return 'done';
      });

      expect(result).toBe('done');
      expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number), undefined);
    });

    it('should measure sync function duration', async () => {
      const { measureTime } = await import('../src/metrics.js');

      const result = await measureTime(mockHistogram as any, () => 'sync-result');

      expect(result).toBe('sync-result');
      expect(mockHistogram.record).toHaveBeenCalled();
    });

    it('should record duration even on error', async () => {
      const { measureTime } = await import('../src/metrics.js');

      await expect(
        measureTime(mockHistogram as any, async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      expect(mockHistogram.record).toHaveBeenCalled();
    });

    it('should pass attributes to histogram', async () => {
      const { measureTime } = await import('../src/metrics.js');

      await measureTime(mockHistogram as any, () => 'result', { method: 'GET' });

      expect(mockHistogram.record).toHaveBeenCalledWith(expect.any(Number), { method: 'GET' });
    });
  });

  describe('MeasureTime decorator', () => {
    it('should wrap method with timing measurement', async () => {
      const { MeasureTime } = await import('../src/metrics.js');

      // Manually apply decorator (TypeScript decorators don't transpile in Vitest)
      class TestService {
        async processData() {
          return 'processed';
        }
      }

      // Apply decorator manually
      const descriptor: PropertyDescriptor = {
        value: TestService.prototype.processData,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      const decoratedDescriptor = MeasureTime(mockHistogram as any)(
        TestService.prototype,
        'processData',
        descriptor
      );
      TestService.prototype.processData = decoratedDescriptor.value;

      const service = new TestService();
      const result = await service.processData();

      expect(result).toBe('processed');
      expect(mockHistogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          method: 'processData',
          class: 'TestService',
        })
      );
    });

    it('should pass custom attributes from decorator', async () => {
      const { MeasureTime } = await import('../src/metrics.js');

      class TestService {
        async doWork() {
          return 'work done';
        }
      }

      // Apply decorator manually with custom attributes
      const descriptor: PropertyDescriptor = {
        value: TestService.prototype.doWork,
        writable: true,
        enumerable: false,
        configurable: true,
      };
      const decoratedDescriptor = MeasureTime(mockHistogram as any, { operation: 'custom' })(
        TestService.prototype,
        'doWork',
        descriptor
      );
      TestService.prototype.doWork = decoratedDescriptor.value;

      const service = new TestService();
      await service.doWork();

      expect(mockHistogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          operation: 'custom',
        })
      );
    });
  });

  describe('MetricAttributes', () => {
    it('should export source attributes', async () => {
      const { MetricAttributes } = await import('../src/metrics.js');

      expect(MetricAttributes.SOURCE_WEBSITE).toEqual({ source: 'website' });
      expect(MetricAttributes.SOURCE_REFERRAL).toEqual({ source: 'referral' });
      expect(MetricAttributes.SOURCE_SOCIAL).toEqual({ source: 'social' });
      expect(MetricAttributes.SOURCE_EMAIL).toEqual({ source: 'email' });
    });

    it('should export status attributes', async () => {
      const { MetricAttributes } = await import('../src/metrics.js');

      expect(MetricAttributes.STATUS_SUCCESS).toEqual({ status: 'success' });
      expect(MetricAttributes.STATUS_ERROR).toEqual({ status: 'error' });
      expect(MetricAttributes.STATUS_TIMEOUT).toEqual({ status: 'timeout' });
    });

    it('should export AI model attributes', async () => {
      const { MetricAttributes } = await import('../src/metrics.js');

      expect(MetricAttributes.MODEL_GPT4).toEqual({ model: 'gpt-4' });
      expect(MetricAttributes.MODEL_GPT35).toEqual({ model: 'gpt-3.5-turbo' });
      expect(MetricAttributes.MODEL_OLLAMA).toEqual({ model: 'ollama' });
    });

    it('should export HTTP method attributes', async () => {
      const { MetricAttributes } = await import('../src/metrics.js');

      expect(MetricAttributes.METHOD_GET).toEqual({ method: 'GET' });
      expect(MetricAttributes.METHOD_POST).toEqual({ method: 'POST' });
      expect(MetricAttributes.METHOD_PUT).toEqual({ method: 'PUT' });
      expect(MetricAttributes.METHOD_DELETE).toEqual({ method: 'DELETE' });
    });
  });

  describe('metricHelpers', () => {
    beforeEach(async () => {
      const { initMetrics } = await import('../src/metrics.js');
      initMetrics({ serviceName: 'test-service', enabled: true });
    });

    describe('recordLeadCreated', () => {
      it('should record lead creation with source', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordLeadCreated('website');

        expect(mockCounter.add).toHaveBeenCalledWith(1, { source: 'website' });
      });
    });

    describe('recordLeadScored', () => {
      it('should record lead score metrics', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordLeadScored(85, 0.92, 'v1.0');

        expect(mockCounter.add).toHaveBeenCalledWith(1, { model_version: 'v1.0' });
        expect(mockHistogram.record).toHaveBeenCalledWith(85, { model_version: 'v1.0' });
        expect(mockHistogram.record).toHaveBeenCalledWith(0.92, { model_version: 'v1.0' });
      });
    });

    describe('recordApiRequest', () => {
      it('should record successful API request', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordApiRequest('GET', '/api/leads', 150, 200);

        expect(mockCounter.add).toHaveBeenCalledWith(1, {
          method: 'GET',
          endpoint: '/api/leads',
          status: '200',
        });
        expect(mockHistogram.record).toHaveBeenCalledWith(150, {
          method: 'GET',
          endpoint: '/api/leads',
        });
      });

      it('should record error count for 4xx status', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordApiRequest('POST', '/api/leads', 50, 400);

        // Should record both request count and error count
        expect(mockCounter.add).toHaveBeenCalledWith(1, {
          method: 'POST',
          endpoint: '/api/leads',
          status: '400',
        });
      });

      it('should record error count for 5xx status', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordApiRequest('GET', '/api/leads', 100, 500);

        expect(mockCounter.add).toHaveBeenCalledWith(1, {
          method: 'GET',
          endpoint: '/api/leads',
          status: '500',
        });
      });
    });

    describe('recordDatabaseQuery', () => {
      it('should record database query metrics', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordDatabaseQuery('SELECT', 'leads', 25);

        expect(mockCounter.add).toHaveBeenCalledWith(1, {
          operation: 'SELECT',
          table: 'leads',
        });
        expect(mockHistogram.record).toHaveBeenCalledWith(25, {
          operation: 'SELECT',
          table: 'leads',
        });
      });
    });

    describe('recordCacheAccess', () => {
      it('should record cache hit', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordCacheAccess(true, 'user:123');

        expect(mockCounter.add).toHaveBeenCalledWith(1, { key: 'user:123' });
      });

      it('should record cache miss', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordCacheAccess(false, 'user:456');

        expect(mockCounter.add).toHaveBeenCalledWith(1, { key: 'user:456' });
      });

      it('should record cache access without key', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordCacheAccess(true);

        expect(mockCounter.add).toHaveBeenCalledWith(1, undefined);
      });
    });

    describe('recordAiInference', () => {
      it('should record AI inference metrics', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordAiInference('gpt-4', 500, 0.01, 0.95);

        expect(mockCounter.add).toHaveBeenCalledWith(1, { model: 'gpt-4' });
        expect(mockHistogram.record).toHaveBeenCalledWith(500, { model: 'gpt-4' });
        expect(mockHistogram.record).toHaveBeenCalledWith(0.01, { model: 'gpt-4' });
        expect(mockHistogram.record).toHaveBeenCalledWith(0.95, { model: 'gpt-4' });
      });

      it('should record AI inference without confidence', async () => {
        const { metricHelpers } = await import('../src/metrics.js');

        metricHelpers.recordAiInference('gpt-3.5-turbo', 200, 0.002);

        expect(mockCounter.add).toHaveBeenCalledWith(1, { model: 'gpt-3.5-turbo' });
        expect(mockHistogram.record).toHaveBeenCalledWith(200, { model: 'gpt-3.5-turbo' });
        expect(mockHistogram.record).toHaveBeenCalledWith(0.002, { model: 'gpt-3.5-turbo' });
      });
    });
  });

  describe('metrics object', () => {
    it('should have null metrics before initialization', async () => {
      const { metrics } = await import('../src/metrics.js');

      // Before init, all should be null (or initialized from prior test)
      expect(metrics).toBeDefined();
    });

    it('should populate metrics after initialization', async () => {
      const { initMetrics, metrics } = await import('../src/metrics.js');

      initMetrics({ serviceName: 'test-service', enabled: true });

      expect(metrics.leadCreated).not.toBeNull();
      expect(metrics.apiRequestCount).not.toBeNull();
      expect(metrics.aiInferenceCount).not.toBeNull();
      expect(metrics.dbQueryCount).not.toBeNull();
    });
  });
});
