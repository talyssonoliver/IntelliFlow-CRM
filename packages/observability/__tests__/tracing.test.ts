/**
 * Comprehensive tests for OpenTelemetry tracing utilities
 *
 * Tests cover:
 * - Initialization and shutdown
 * - Span creation and lifecycle
 * - Error handling and status codes
 * - Trace context propagation
 * - Decorators and utilities
 * - Edge cases and error paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Span, Tracer, Context } from '@opentelemetry/api';

// Mock data
const mockTraceId = 'trace-1234567890abcdef';
const mockSpanId = 'span-fedcba0987654321';

// Use vi.hoisted to create mock functions that can be used in vi.mock calls
const {
  mockGetTracer,
  mockGetActiveSpan,
  mockSetSpan,
  mockContextActive,
  mockContextWith,
  mockSdkInstance,
  mockNodeSDKConstructor,
  mockGetNodeAutoInstrumentations,
  mockOTLPTraceExporter,
} = vi.hoisted(() => ({
  mockGetTracer: vi.fn(),
  mockGetActiveSpan: vi.fn(),
  mockSetSpan: vi.fn(),
  mockContextActive: vi.fn(),
  mockContextWith: vi.fn(),
  mockSdkInstance: {
    start: vi.fn(),
    shutdown: vi.fn(async () => {}),
  },
  mockNodeSDKConstructor: vi.fn(),
  mockGetNodeAutoInstrumentations: vi.fn(() => []),
  mockOTLPTraceExporter: vi.fn(),
}));

// Mock span implementation
const createMockSpan = (): Span => ({
  spanContext: vi.fn(() => ({
    traceId: mockTraceId,
    spanId: mockSpanId,
    traceFlags: 1,
    isRemote: false,
  })),
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
  setStatus: vi.fn(),
  addEvent: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
  isRecording: vi.fn(() => true),
  updateName: vi.fn(),
});

let mockSpan: Span;
let mockTracer: Tracer;
let mockContext: Context;
let mockActiveContext: Context;

// Mock OpenTelemetry API
vi.mock('@opentelemetry/api', () => ({
  SpanStatusCode: { OK: 0, ERROR: 2, UNSET: 1 },
  SpanKind: {
    INTERNAL: 0,
    SERVER: 1,
    CLIENT: 2,
    PRODUCER: 3,
    CONSUMER: 4,
  },
  trace: {
    getTracer: (...args: any[]) => mockGetTracer(...args),
    getActiveSpan: (...args: any[]) => mockGetActiveSpan(...args),
    setSpan: (...args: any[]) => mockSetSpan(...args),
  },
  context: {
    active: (...args: any[]) => mockContextActive(...args),
    with: (...args: any[]) => mockContextWith(...args),
  },
}));

// Mock NodeSDK
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class MockNodeSDK {
    constructor(config: unknown) {
      mockNodeSDKConstructor(config);
    }
    start = mockSdkInstance.start;
    shutdown = mockSdkInstance.shutdown;
  },
}));

// Mock auto-instrumentations
vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: (...args: any[]) => mockGetNodeAutoInstrumentations(...args),
}));

// Mock OTLP exporter
vi.mock('@opentelemetry/exporter-trace-otlp-grpc', () => ({
  OTLPTraceExporter: class MockOTLPTraceExporter {
    url: string;
    constructor(config: { url?: string }) {
      this.url = config?.url || '';
      mockOTLPTraceExporter(config);
    }
  },
}));

// Mock span processor
vi.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: class MockBatchSpanProcessor {
    constructor(exporter: unknown) {}
  },
}));

// Mock Resource
vi.mock('@opentelemetry/resources', () => ({
  Resource: class MockResource {
    attributes: Record<string, unknown>;
    constructor(attrs: Record<string, unknown>) {
      this.attributes = attrs;
    }
  },
}));

// Import after mocks
import {
  initTracing,
  shutdownTracing,
  getTracer,
  trace,
  createSpan,
  addEvent,
  addAttributes,
  recordException,
  getTraceId,
  getSpanId,
  Trace,
  traceContext,
  SpanKinds,
  SemanticAttributes,
} from '../src/tracing';

describe('Tracing Module', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create fresh mock instances
    mockSpan = createMockSpan();
    mockContext = {} as Context;
    mockActiveContext = {} as Context;

    mockTracer = {
      startSpan: vi.fn(() => mockSpan),
      startActiveSpan: vi.fn((name, options, fn: any) => {
        if (typeof options === 'function') {
          return options(mockSpan);
        }
        return fn(mockSpan);
      }),
    } as any;

    // Setup default behavior for mocked functions
    mockGetTracer.mockReturnValue(mockTracer);
    mockGetActiveSpan.mockReturnValue(mockSpan);
    mockSetSpan.mockImplementation((ctx, span) => ctx);
    mockContextActive.mockReturnValue(mockActiveContext);
    mockContextWith.mockImplementation((ctx, fn) => fn());
  });

  afterEach(async () => {
    // Clean up any initialized SDK
    await shutdownTracing();
  });

  describe('initTracing', () => {
    it('should initialize SDK with service name', () => {
      mockNodeSDKConstructor.mockClear();

      initTracing({ serviceName: 'test-service', enabled: true });

      expect(mockNodeSDKConstructor).toHaveBeenCalled();
      expect(mockSdkInstance.start).toHaveBeenCalled();
    });

    it('should use default service version if not provided', () => {
      initTracing({ serviceName: 'test-service', enabled: true });

      expect(mockSdkInstance.start).toHaveBeenCalled();
    });

    it('should respect custom service version', () => {
      initTracing({
        serviceName: 'test-service',
        serviceVersion: '1.2.3',
        enabled: true,
      });

      expect(mockSdkInstance.start).toHaveBeenCalled();
    });

    it('should use custom environment', () => {
      initTracing({
        serviceName: 'test-service',
        environment: 'staging',
        enabled: true,
      });

      expect(mockSdkInstance.start).toHaveBeenCalled();
    });

    it('should use custom OTLP endpoint', () => {
      mockOTLPTraceExporter.mockClear();

      initTracing({
        serviceName: 'test-service',
        endpoint: 'http://custom:4317',
        enabled: true,
      });

      expect(mockOTLPTraceExporter).toHaveBeenCalledWith({
        url: 'http://custom:4317',
      });
    });

    it('should skip initialization if tracing is disabled', () => {
      mockNodeSDKConstructor.mockClear();
      const consoleLog = vi.spyOn(console, 'log');

      initTracing({ serviceName: 'test-service', enabled: false });

      expect(mockNodeSDKConstructor).not.toHaveBeenCalled();
      expect(consoleLog).toHaveBeenCalledWith('Tracing disabled');
    });

    it('should warn if already initialized', () => {
      const consoleWarn = vi.spyOn(console, 'warn');

      initTracing({ serviceName: 'test-service', enabled: true });
      initTracing({ serviceName: 'test-service', enabled: true });

      expect(consoleWarn).toHaveBeenCalledWith('Tracing already initialized');
    });

    it('should setup SIGTERM handler for graceful shutdown', () => {
      const processOn = vi.spyOn(process, 'on');

      initTracing({ serviceName: 'test-service', enabled: true });

      expect(processOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should configure auto-instrumentations', () => {
      mockGetNodeAutoInstrumentations.mockClear();

      initTracing({ serviceName: 'test-service', enabled: true });

      expect(mockGetNodeAutoInstrumentations).toHaveBeenCalledWith(
        expect.objectContaining({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-http': expect.any(Object),
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-pg': { enabled: true },
          '@opentelemetry/instrumentation-redis': { enabled: true },
        })
      );
    });
  });

  describe('shutdownTracing', () => {
    it('should shutdown SDK when initialized', async () => {
      initTracing({ serviceName: 'test-service', enabled: true });

      await shutdownTracing();

      expect(mockSdkInstance.shutdown).toHaveBeenCalled();
    });

    it('should clear tracer reference after shutdown', async () => {
      initTracing({ serviceName: 'test-service', enabled: true });
      await shutdownTracing();

      expect(() => getTracer()).toThrow('Tracing not initialized');
    });

    it('should be safe to call when not initialized', async () => {
      await expect(shutdownTracing()).resolves.toBeUndefined();
    });

    it('should be idempotent', async () => {
      initTracing({ serviceName: 'test-service', enabled: true });
      await shutdownTracing();
      await shutdownTracing();

      // Should only call shutdown once
      expect(mockSdkInstance.shutdown).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTracer', () => {
    it('should return tracer when initialized', () => {
      initTracing({ serviceName: 'test-service', enabled: true });

      const tracer = getTracer();

      expect(tracer).toBeDefined();
      expect(tracer).toBe(mockTracer);
    });

    it('should throw error when not initialized', () => {
      expect(() => getTracer()).toThrow('Tracing not initialized. Call initTracing() first.');
    });

    it('should throw error after shutdown', async () => {
      initTracing({ serviceName: 'test-service', enabled: true });
      await shutdownTracing();

      expect(() => getTracer()).toThrow('Tracing not initialized');
    });
  });

  describe('trace', () => {
    beforeEach(() => {
      initTracing({ serviceName: 'test-service', enabled: true });
    });

    it('should create span with given name', async () => {
      await trace('test-operation', async () => {});

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should set OK status on success', async () => {
      await trace('test-operation', async () => 'success');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 }); // SpanStatusCode.OK
    });

    it('should end span on success', async () => {
      await trace('test-operation', async () => 'success');

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should return function result', async () => {
      const result = await trace('test-operation', async () => 'my-result');

      expect(result).toBe('my-result');
    });

    it('should set ERROR status on exception', async () => {
      const error = new Error('Test error');

      await expect(
        trace('test-operation', async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Test error',
      });
    });

    it('should record exception on error', async () => {
      const error = new Error('Test error');

      await expect(
        trace('test-operation', async () => {
          throw error;
        })
      ).rejects.toThrow();

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    });

    it('should end span even on error', async () => {
      await expect(
        trace('test-operation', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow();

      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should propagate thrown error', async () => {
      const error = new Error('Propagated error');

      await expect(
        trace('test-operation', async () => {
          throw error;
        })
      ).rejects.toThrow('Propagated error');
    });

    it('should pass span to callback function', async () => {
      let capturedSpan: Span | null = null;

      await trace('test-operation', async (span) => {
        capturedSpan = span;
      });

      expect(capturedSpan).toBe(mockSpan);
    });

    it('should support custom span kind', async () => {
      const { SpanKind } = require('@opentelemetry/api');

      await trace('test-operation', async () => {}, { kind: SpanKind.SERVER });

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.objectContaining({ kind: SpanKind.SERVER }),
        expect.any(Function)
      );
    }, 10000);

    it('should default to INTERNAL span kind', async () => {
      const { SpanKind } = require('@opentelemetry/api');

      await trace('test-operation', async () => {});

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.objectContaining({ kind: SpanKind.INTERNAL }),
        expect.any(Function)
      );
    });

    it('should support initial attributes', async () => {
      await trace('test-operation', async () => {}, {
        attributes: { 'user.id': 'user-123', 'request.id': 42 },
      });

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'test-operation',
        expect.objectContaining({
          attributes: { 'user.id': 'user-123', 'request.id': 42 },
        }),
        expect.any(Function)
      );
    });

    it('should handle non-Error exceptions', async () => {
      await expect(
        trace('test-operation', async () => {
          throw 'string error';
        })
      ).rejects.toThrow();

      expect(mockSpan.recordException).toHaveBeenCalledWith(new Error('string error'));
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2,
        message: 'Unknown error',
      });
    });

    it('should support synchronous functions', async () => {
      const result = await trace('test-operation', () => 'sync-result');

      expect(result).toBe('sync-result');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
    });

    it('should allow span modification in callback', async () => {
      await trace('test-operation', async (span) => {
        span.setAttribute('custom', 'value');
        span.addEvent('important-event');
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('custom', 'value');
      expect(mockSpan.addEvent).toHaveBeenCalledWith('important-event');
    });
  });

  describe('createSpan', () => {
    beforeEach(() => {
      initTracing({ serviceName: 'test-service', enabled: true });
    });

    it('should create span with given name', () => {
      const span = createSpan('manual-span');

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'manual-span',
        expect.objectContaining({ kind: 0 }) // INTERNAL
      );
      expect(span).toBe(mockSpan);
    });

    it('should support custom span kind', () => {
      const { SpanKind } = require('@opentelemetry/api');

      createSpan('manual-span', { kind: SpanKind.CLIENT });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'manual-span',
        expect.objectContaining({ kind: SpanKind.CLIENT })
      );
    });

    it('should support initial attributes', () => {
      createSpan('manual-span', {
        attributes: { 'operation.type': 'query', count: 5 },
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'manual-span',
        expect.objectContaining({
          attributes: { 'operation.type': 'query', count: 5 },
        })
      );
    });

    it('should default to INTERNAL kind', () => {
      createSpan('manual-span');

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        'manual-span',
        expect.objectContaining({ kind: 0 })
      );
    });

    it('should return span instance', () => {
      const span = createSpan('manual-span');

      expect(span).toBe(mockSpan);
      expect(span.end).toBeDefined();
    });
  });

  describe('addEvent', () => {
    it('should add event to active span', () => {
      addEvent('cache-hit');

      expect(mockSpan.addEvent).toHaveBeenCalledWith('cache-hit', undefined);
    });

    it('should add event with attributes', () => {
      addEvent('email-sent', { recipient: 'user@example.com', provider: 'sendgrid' });

      expect(mockSpan.addEvent).toHaveBeenCalledWith('email-sent', {
        recipient: 'user@example.com',
        provider: 'sendgrid',
      });
    });

    it('should be no-op when no active span', () => {
      mockGetActiveSpan.mockReturnValue(undefined);

      expect(() => addEvent('test-event')).not.toThrow();
      expect(mockSpan.addEvent).not.toHaveBeenCalled();
    });

    it('should handle null active span', () => {
      mockGetActiveSpan.mockReturnValue(null);

      expect(() => addEvent('test-event')).not.toThrow();
    });
  });

  describe('addAttributes', () => {
    it('should add attributes to active span', () => {
      addAttributes({ 'user.id': 'user-123', 'request.method': 'POST' });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'user.id': 'user-123',
        'request.method': 'POST',
      });
    });

    it('should support multiple attribute types', () => {
      addAttributes({
        stringAttr: 'value',
        numberAttr: 42,
        booleanAttr: true,
      });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        stringAttr: 'value',
        numberAttr: 42,
        booleanAttr: true,
      });
    });

    it('should be no-op when no active span', () => {
      mockGetActiveSpan.mockReturnValue(undefined);

      expect(() => addAttributes({ test: 'value' })).not.toThrow();
      expect(mockSpan.setAttributes).not.toHaveBeenCalled();
    });

    it('should handle null active span', () => {
      mockGetActiveSpan.mockReturnValue(null);

      expect(() => addAttributes({ test: 'value' })).not.toThrow();
    });
  });

  describe('recordException', () => {
    it('should record exception to active span', () => {
      const error = new Error('Test error');

      recordException(error);

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    });

    it('should set ERROR status with message', () => {
      const error = new Error('Critical failure');

      recordException(error);

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Critical failure',
      });
    });

    it('should be no-op when no active span', () => {
      mockGetActiveSpan.mockReturnValue(undefined);

      const error = new Error('Test error');
      expect(() => recordException(error)).not.toThrow();
      expect(mockSpan.recordException).not.toHaveBeenCalled();
    });

    it('should handle null active span', () => {
      mockGetActiveSpan.mockReturnValue(null);

      const error = new Error('Test error');
      expect(() => recordException(error)).not.toThrow();
    });
  });

  describe('getTraceId', () => {
    it('should return trace ID from active span', () => {
      const traceId = getTraceId();

      expect(traceId).toBe(mockTraceId);
      expect(mockSpan.spanContext).toHaveBeenCalled();
    });

    it('should return undefined when no active span', () => {
      mockGetActiveSpan.mockReturnValue(undefined);

      const traceId = getTraceId();

      expect(traceId).toBeUndefined();
    });

    it('should return undefined for null active span', () => {
      mockGetActiveSpan.mockReturnValue(null);

      const traceId = getTraceId();

      expect(traceId).toBeUndefined();
    });

    it('should use optional chaining safely', () => {
      mockGetActiveSpan.mockReturnValue(undefined);

      expect(() => getTraceId()).not.toThrow();
    });
  });

  describe('getSpanId', () => {
    it('should return span ID from active span', () => {
      const spanId = getSpanId();

      expect(spanId).toBe(mockSpanId);
      expect(mockSpan.spanContext).toHaveBeenCalled();
    });

    it('should return undefined when no active span', () => {
      mockGetActiveSpan.mockReturnValue(undefined);

      const spanId = getSpanId();

      expect(spanId).toBeUndefined();
    });

    it('should return undefined for null active span', () => {
      mockGetActiveSpan.mockReturnValue(null);

      const spanId = getSpanId();

      expect(spanId).toBeUndefined();
    });

    it('should use optional chaining safely', () => {
      mockGetActiveSpan.mockReturnValue(undefined);

      expect(() => getSpanId()).not.toThrow();
    });
  });

  describe('Trace decorator', () => {
    beforeEach(() => {
      initTracing({ serviceName: 'test-service', enabled: true });
    });

    // Note: TypeScript decorators don't work properly in Vitest test execution
    // due to transpilation issues (descriptor is undefined). These tests use
    // manual decorator application pattern instead.

    it('should return a decorator function', () => {
      const decorator = Trace('custom-span-name');
      expect(typeof decorator).toBe('function');
    });

    it('should apply decorator to method descriptor', async () => {
      const originalMethod = vi.fn(async function (this: any) {
        return 'result';
      });

      const target = { constructor: { name: 'TestClass' } };
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Trace('TestOperation');
      const newDescriptor = decorator(target, 'testMethod', descriptor);

      expect(newDescriptor).toBeDefined();
      expect(typeof newDescriptor.value).toBe('function');
    });

    it('should call trace with custom span name', async () => {
      const originalMethod = vi.fn(async function (this: any) {
        return 'result';
      });

      const target = { constructor: { name: 'TestClass' } };
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Trace('CustomOperation');
      const newDescriptor = decorator(target, 'testMethod', descriptor);

      // Call the wrapped method
      await newDescriptor.value.call({ value: 'test' });

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'CustomOperation',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should auto-generate span name when not provided', async () => {
      const originalMethod = vi.fn(async function (this: any) {
        return 'result';
      });

      const target = { constructor: { name: 'LeadService' } };
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Trace();
      const newDescriptor = decorator(target, 'processLead', descriptor);

      await newDescriptor.value.call({});

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'LeadService.processLead',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should add method and class attributes', async () => {
      const originalMethod = vi.fn(async function (this: any) {
        return 'result';
      });

      const target = { constructor: { name: 'MyService' } };
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Trace();
      const newDescriptor = decorator(target, 'myMethod', descriptor);

      await newDescriptor.value.call({});

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('method', 'myMethod');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('class', 'MyService');
    });

    it('should preserve this context', async () => {
      let capturedThis: any = null;
      const originalMethod = vi.fn(async function (this: any) {
        capturedThis = this;
        return this.value;
      });

      const target = { constructor: { name: 'TestClass' } };
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Trace();
      const newDescriptor = decorator(target, 'testMethod', descriptor);

      const instance = { value: 'test-value' };
      const result = await newDescriptor.value.call(instance);

      expect(capturedThis).toBe(instance);
      expect(result).toBe('test-value');
    });

    it('should pass arguments to original method', async () => {
      const originalMethod = vi.fn(async function (this: any, id: string, count: number) {
        return `${id}-${count}`;
      });

      const target = { constructor: { name: 'TestClass' } };
      const descriptor: PropertyDescriptor = {
        value: originalMethod,
        writable: true,
        enumerable: false,
        configurable: true,
      };

      const decorator = Trace();
      const newDescriptor = decorator(target, 'processItem', descriptor);

      const result = await newDescriptor.value.call({}, 'item-123', 5);

      expect(result).toBe('item-123-5');
      expect(originalMethod).toHaveBeenCalledWith('item-123', 5);
    });
  });

  describe('traceContext', () => {
    beforeEach(() => {
      initTracing({ serviceName: 'test-service', enabled: true });
    });

    describe('with', () => {
      it('should run function with specific span context', () => {
        const customSpan = createMockSpan();
        let executedWithContext = false;

        traceContext.with(customSpan, () => {
          executedWithContext = true;
        });

        expect(executedWithContext).toBe(true);
        expect(mockSetSpan).toHaveBeenCalledWith(mockActiveContext, customSpan);
        expect(mockContextWith).toHaveBeenCalled();
      });

      it('should return function result', () => {
        const customSpan = createMockSpan();

        const result = traceContext.with(customSpan, () => 'result-value');

        expect(result).toBe('result-value');
      });

      it('should propagate exceptions', () => {
        const customSpan = createMockSpan();

        expect(() =>
          traceContext.with(customSpan, () => {
            throw new Error('Context error');
          })
        ).toThrow('Context error');
      });
    });

    describe('active', () => {
      it('should return current active context', () => {
        const ctx = traceContext.active();

        expect(ctx).toBe(mockActiveContext);
      });

      it('should call context.active from OTel API', () => {
        traceContext.active();

        expect(mockContextActive).toHaveBeenCalled();
      });
    });

    describe('extract', () => {
      it('should return active context (placeholder implementation)', () => {
        const carrier = { traceparent: '00-trace-span-01' };

        const ctx = traceContext.extract(carrier);

        expect(ctx).toBe(mockActiveContext);
      });

      it('should handle empty carrier', () => {
        const ctx = traceContext.extract({});

        expect(ctx).toBeDefined();
      });
    });

    describe('inject', () => {
      it('should not throw with carrier object', () => {
        const carrier: Record<string, string> = {};

        expect(() => traceContext.inject(carrier)).not.toThrow();
      });

      it('should be callable with empty carrier', () => {
        expect(() => traceContext.inject({})).not.toThrow();
      });
    });
  });

  describe('SpanKinds', () => {
    it('should export SERVER span kind', () => {
      expect(SpanKinds.SERVER).toBe(1);
    });

    it('should export CLIENT span kind', () => {
      expect(SpanKinds.CLIENT).toBe(2);
    });

    it('should export PRODUCER span kind', () => {
      expect(SpanKinds.PRODUCER).toBe(3);
    });

    it('should export CONSUMER span kind', () => {
      expect(SpanKinds.CONSUMER).toBe(4);
    });

    it('should export INTERNAL span kind', () => {
      expect(SpanKinds.INTERNAL).toBe(0);
    });

    it('should have all five span kinds', () => {
      expect(Object.keys(SpanKinds)).toHaveLength(5);
    });
  });

  describe('SemanticAttributes', () => {
    it('should define USER_ID attribute', () => {
      expect(SemanticAttributes.USER_ID).toBe('user.id');
    });

    it('should define USER_EMAIL attribute', () => {
      expect(SemanticAttributes.USER_EMAIL).toBe('user.email');
    });

    it('should define USER_ROLE attribute', () => {
      expect(SemanticAttributes.USER_ROLE).toBe('user.role');
    });

    it('should define LEAD_ID attribute', () => {
      expect(SemanticAttributes.LEAD_ID).toBe('lead.id');
    });

    it('should define LEAD_SCORE attribute', () => {
      expect(SemanticAttributes.LEAD_SCORE).toBe('lead.score');
    });

    it('should define CONTACT_ID attribute', () => {
      expect(SemanticAttributes.CONTACT_ID).toBe('contact.id');
    });

    it('should define ACCOUNT_ID attribute', () => {
      expect(SemanticAttributes.ACCOUNT_ID).toBe('account.id');
    });

    it('should define OPPORTUNITY_ID attribute', () => {
      expect(SemanticAttributes.OPPORTUNITY_ID).toBe('opportunity.id');
    });

    it('should define AI_MODEL attribute', () => {
      expect(SemanticAttributes.AI_MODEL).toBe('ai.model');
    });

    it('should define AI_MODEL_VERSION attribute', () => {
      expect(SemanticAttributes.AI_MODEL_VERSION).toBe('ai.model.version');
    });

    it('should define AI_CONFIDENCE attribute', () => {
      expect(SemanticAttributes.AI_CONFIDENCE).toBe('ai.confidence');
    });

    it('should define AI_COST attribute', () => {
      expect(SemanticAttributes.AI_COST).toBe('ai.cost');
    });

    it('should define AI_LATENCY attribute', () => {
      expect(SemanticAttributes.AI_LATENCY).toBe('ai.latency');
    });

    it('should define DB_OPERATION attribute', () => {
      expect(SemanticAttributes.DB_OPERATION).toBe('db.operation');
    });

    it('should define DB_TABLE attribute', () => {
      expect(SemanticAttributes.DB_TABLE).toBe('db.table');
    });

    it('should define DB_QUERY_TIME attribute', () => {
      expect(SemanticAttributes.DB_QUERY_TIME).toBe('db.query.time');
    });

    it('should define HTTP_METHOD attribute', () => {
      expect(SemanticAttributes.HTTP_METHOD).toBe('http.method');
    });

    it('should define HTTP_URL attribute', () => {
      expect(SemanticAttributes.HTTP_URL).toBe('http.url');
    });

    it('should define HTTP_STATUS_CODE attribute', () => {
      expect(SemanticAttributes.HTTP_STATUS_CODE).toBe('http.status_code');
    });

    it('should have all semantic attributes defined', () => {
      expect(Object.keys(SemanticAttributes).length).toBeGreaterThanOrEqual(19);
    });
  });

  describe('Integration scenarios', () => {
    beforeEach(() => {
      initTracing({ serviceName: 'test-service', enabled: true });
    });

    it('should support nested traces', async () => {
      await trace('outer-operation', async () => {
        await trace('inner-operation', async () => {
          return 'nested-result';
        });
      });

      expect(mockTracer.startActiveSpan).toHaveBeenCalledTimes(2);
    });

    it('should allow manual span creation within traced function', async () => {
      await trace('parent-operation', async () => {
        const childSpan = createSpan('manual-child');
        childSpan.end();
      });

      expect(mockTracer.startActiveSpan).toHaveBeenCalledTimes(1);
      expect(mockTracer.startSpan).toHaveBeenCalledTimes(1);
    });

    it('should support adding events during traced execution', async () => {
      await trace('operation-with-events', async () => {
        addEvent('step-1-complete');
        addEvent('step-2-complete', { duration: 100 });
      });

      expect(mockSpan.addEvent).toHaveBeenCalledTimes(2);
    });

    it('should support adding attributes during traced execution', async () => {
      await trace('operation-with-attrs', async () => {
        addAttributes({ phase: 'initialization' });
        addAttributes({ phase: 'execution' });
      });

      expect(mockSpan.setAttributes).toHaveBeenCalledTimes(2);
    });

    it('should maintain trace context across async operations', async () => {
      await trace('async-operation', async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        const traceId = getTraceId();
        expect(traceId).toBe(mockTraceId);
      });
    });

    it('should support using semantic attributes', async () => {
      await trace('lead-scoring', async (span) => {
        span.setAttribute(SemanticAttributes.LEAD_ID, 'lead-123');
        span.setAttribute(SemanticAttributes.LEAD_SCORE, 85);
        span.setAttribute(SemanticAttributes.AI_MODEL, 'gpt-4');
        span.setAttribute(SemanticAttributes.AI_CONFIDENCE, 0.95);
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('lead.id', 'lead-123');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('lead.score', 85);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.model', 'gpt-4');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.confidence', 0.95);
    });

    it('should handle errors with context preservation', async () => {
      await expect(
        trace('failing-operation', async () => {
          throw new Error('Intentional error');
        })
      ).rejects.toThrow();

      expect(mockSpan.recordException).toHaveBeenCalled();
    });
  });
});
