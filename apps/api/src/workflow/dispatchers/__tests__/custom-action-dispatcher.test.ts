import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { dispatchCustomAction } from '../custom-action-dispatcher';
import {
  getCustomActionHandlerRegistry,
  resetCustomActionHandlerRegistry,
} from '../../registries/custom-action-handler-registry';

const TENANT = 't-1';

function makePrisma() {
  return {
    customActionHandler: { findMany: async () => [] },
  } as never;
}

describe('dispatchCustomAction', () => {
  beforeEach(() => resetCustomActionHandlerRegistry());
  afterEach(() => vi.restoreAllMocks());

  it('returns error when handler not registered', async () => {
    const result = await dispatchCustomAction(makePrisma(), {
      tenantId: TENANT,
      customActionId: 'missing',
      params: {},
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/No custom action handler/);
  });

  it('POSTs parsed params to endpointUrl', async () => {
    const registry = getCustomActionHandlerRegistry();
    registry.register(TENANT, {
      id: 'abc',
      actionTypeId: 'hubspot_sync',
      label: 'HubSpot',
      endpointUrl: 'https://httpbin.org/post',
      timeoutMs: 5000,
      inputSchema: [{ key: 'email', label: 'Email', type: 'string', required: true }],
      outputSchema: [],
      isActive: true,
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ received: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchCustomAction(makePrisma(), {
      tenantId: TENANT,
      customActionId: 'abc',
      params: { email: 'a@b.com', ignoredExtra: 123 },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ received: true });
    // params must have been sent
    const bodySent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(bodySent.email).toBe('a@b.com');
  });

  it('fails closed on input-schema validation error', async () => {
    const registry = getCustomActionHandlerRegistry();
    registry.register(TENANT, {
      id: 'abc',
      actionTypeId: 'strict',
      label: 'Strict',
      endpointUrl: 'https://httpbin.org/post',
      timeoutMs: 5000,
      inputSchema: [
        { key: 'count', label: 'Count', type: 'number', required: true },
      ],
      outputSchema: [],
      isActive: true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchCustomAction(makePrisma(), {
      tenantId: TENANT,
      customActionId: 'abc',
      params: { count: 'not-a-number' },
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/Input validation failed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects private-IP endpoints (SSRF)', async () => {
    const registry = getCustomActionHandlerRegistry();
    registry.register(TENANT, {
      id: 'abc',
      actionTypeId: 'bad',
      label: 'Bad',
      endpointUrl: 'http://192.168.1.1/hook',
      timeoutMs: 5000,
      inputSchema: [],
      outputSchema: [],
      isActive: true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchCustomAction(makePrisma(), {
      tenantId: TENANT,
      customActionId: 'abc',
      params: {},
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/SSRF/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses deactivated handler', async () => {
    const registry = getCustomActionHandlerRegistry();
    registry.register(TENANT, {
      id: 'abc',
      actionTypeId: 'sleep',
      label: 'Sleep',
      endpointUrl: 'https://httpbin.org/post',
      timeoutMs: 5000,
      inputSchema: [],
      outputSchema: [],
      isActive: false,
    });

    const result = await dispatchCustomAction(makePrisma(), {
      tenantId: TENANT,
      customActionId: 'abc',
      params: {},
    });
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toMatch(/deactivated/);
  });
});
