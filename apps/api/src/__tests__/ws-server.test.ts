/**
 * WebSocket Server Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockOn, mockClose, mockBroadcast } = vi.hoisted(() => ({
  mockOn: vi.fn(),
  mockClose: vi.fn((cb?: () => void) => {
    if (cb) cb();
  }),
  mockBroadcast: vi.fn(),
}));

vi.mock('ws', () => {
  function FakeWebSocketServer(this: any) {
    this.on = mockOn;
    this.close = mockClose;
  }
  return { WebSocketServer: FakeWebSocketServer };
});

vi.mock('@trpc/server/adapters/ws', () => ({
  applyWSSHandler: vi.fn(() => ({
    broadcastReconnectNotification: mockBroadcast,
  })),
}));

vi.mock('../router', () => ({ appRouter: {} }));
vi.mock('../context', () => ({
  createWSContext: vi.fn().mockResolvedValue({
    user: { userId: 'u1', tenantId: 't1' },
    prisma: {},
  }),
}));

import { createWebSocketServer, WS_PORT } from '../ws-server';
import { applyWSSHandler } from '@trpc/server/adapters/ws';

describe('WS_PORT', () => {
  it('should export WS_PORT as number', () => {
    expect(typeof WS_PORT).toBe('number');
  });
});

describe('createWebSocketServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should apply tRPC WS handler', () => {
    createWebSocketServer(4000);
    expect(applyWSSHandler).toHaveBeenCalledWith(
      expect.objectContaining({ router: expect.anything() })
    );
  });

  it('should register connection handler', () => {
    createWebSocketServer(4000);
    expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function));
  });

  it('should register listening handler', () => {
    createWebSocketServer(4000);
    expect(mockOn).toHaveBeenCalledWith('listening', expect.any(Function));
  });

  it('should register error handler', () => {
    createWebSocketServer(4000);
    expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should return the wss instance with on method', () => {
    const result = createWebSocketServer(4000);
    expect(result).toBeDefined();
    expect(result.on).toBe(mockOn);
  });
});

describe('connection handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log client connection and register ws handlers', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createWebSocketServer(4000);
    const connHandler = mockOn.mock.calls.find((c: any[]) => c[0] === 'connection')?.[1];
    expect(connHandler).toBeDefined();
    const mockWs = { on: vi.fn() };
    const mockReq = { headers: { 'sec-websocket-key': 'test-key' } };
    connHandler!(mockWs, mockReq);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('test-key'));
    expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
    spy.mockRestore();
  });

  it('should handle missing sec-websocket-key', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createWebSocketServer(4000);
    const connHandler = mockOn.mock.calls.find((c: any[]) => c[0] === 'connection')?.[1];
    const mockWs = { on: vi.fn() };
    connHandler!(mockWs, { headers: {} });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown'));
    spy.mockRestore();
  });

  it('should log disconnect on ws close', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createWebSocketServer(4000);
    const connHandler = mockOn.mock.calls.find((c: any[]) => c[0] === 'connection')?.[1];
    const mockWs = { on: vi.fn() };
    connHandler!(mockWs, { headers: { 'sec-websocket-key': 'k2' } });
    const closeHandler = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'close')?.[1];
    closeHandler!();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('disconnected'));
    spy.mockRestore();
  });

  it('should log error on ws error', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createWebSocketServer(4000);
    const connHandler = mockOn.mock.calls.find((c: any[]) => c[0] === 'connection')?.[1];
    const mockWs = { on: vi.fn() };
    connHandler!(mockWs, { headers: { 'sec-websocket-key': 'k3' } });
    const errHandler = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'error')?.[1];
    errHandler!(new Error('test error'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('k3'), 'test error');
    vi.restoreAllMocks();
  });
});

describe('server lifecycle handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log on listening', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createWebSocketServer(4000);
    const handler = mockOn.mock.calls.find((c: any[]) => c[0] === 'listening')?.[1];
    handler!();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('4000'));
    spy.mockRestore();
  });

  it('should log on server error', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createWebSocketServer(4000);
    const handler = mockOn.mock.calls.find((c: any[]) => c[0] === 'error')?.[1];
    handler!(new Error('bind fail'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Server error'), expect.any(Error));
    vi.restoreAllMocks();
  });
});
