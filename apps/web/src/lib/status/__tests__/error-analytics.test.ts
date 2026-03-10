// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildNotFoundAnalyticsPayload,
  trackNotFoundPageView,
} from '../error-analytics';

describe('error-analytics', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.dataLayer = undefined as unknown as Array<Record<string, unknown>>;
  });

  it('builds a stable analytics payload', () => {
    const payload = buildNotFoundAnalyticsPayload({
      missingPath: '/reports/missing',
      referrer: 'https://intelliflow-crm.com/dashboard',
      suggestionCount: 3,
      navigationType: 'navigate',
      timestamp: '2026-03-10T12:00:00.000Z',
    });

    expect(payload).toEqual({
      event: 'not_found_page_view',
      missingPath: '/reports/missing',
      referrerPath: '/dashboard',
      suggestionCount: 3,
      navigationType: 'navigate',
      timestamp: '2026-03-10T12:00:00.000Z',
    });
  });

  it('pushes payloads to window.dataLayer when available', () => {
    const dataLayer: Array<Record<string, unknown>> = [];
    window.dataLayer = dataLayer as typeof window.dataLayer;

    trackNotFoundPageView({
      missingPath: '/missing',
      suggestionCount: 2,
      referrer: 'https://intelliflow-crm.com/',
      navigationType: 'reload',
      timestamp: '2026-03-10T12:00:00.000Z',
    });

    expect(dataLayer).toHaveLength(1);
    expect(dataLayer[0]).toMatchObject({
      event: 'not_found_page_view',
      missingPath: '/missing',
      suggestionCount: 2,
    });
  });

  it('dispatches a browser event for local listeners', () => {
    const listener = vi.fn();
    window.addEventListener('intelliflow:not-found', listener);

    trackNotFoundPageView({
      missingPath: '/missing',
      suggestionCount: 1,
      referrer: '',
      navigationType: null,
      timestamp: '2026-03-10T12:00:00.000Z',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({
      event: 'not_found_page_view',
      missingPath: '/missing',
    });
  });
});
