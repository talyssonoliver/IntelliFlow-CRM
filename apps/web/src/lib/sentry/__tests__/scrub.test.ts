import { describe, expect, it } from 'vitest';
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';
import { filterBreadcrumb, scrubEvent, stripQuery } from '../scrub';

const event = (partial: Partial<ErrorEvent>): ErrorEvent => ({ type: undefined, ...partial });

describe('stripQuery', () => {
  it('removes query string and fragment', () => {
    expect(stripQuery('/leads?email=a%40b.example#top')).toBe('/leads');
    expect(stripQuery('https://app.example.invalid/a/b?x=1')).toBe(
      'https://app.example.invalid/a/b'
    );
  });

  it('leaves a clean URL alone', () => {
    expect(stripQuery('/leads/42')).toBe('/leads/42');
  });
});

describe('scrubEvent', () => {
  it('strips cookies, query string, body and the URL query from the request', () => {
    const result = scrubEvent(
      event({
        request: {
          url: 'https://app.example.invalid/contacts?q=jane',
          method: 'POST',
          cookies: { session: 'x' },
          query_string: 'q=jane',
          data: { email: 'jane@example.invalid' },
        },
      })
    );
    expect(result.request).toEqual({
      url: 'https://app.example.invalid/contacts',
      method: 'POST',
    });
  });

  it('removes credential headers case-insensitively and keeps benign ones', () => {
    const result = scrubEvent(
      event({
        request: {
          headers: {
            Authorization: 'x',
            Cookie: 'x',
            'X-Api-Key': 'x',
            'user-agent': 'ua',
            accept: '*/*',
          },
        },
      })
    );
    expect(result.request?.headers).toEqual({ 'user-agent': 'ua', accept: '*/*' });
  });

  it('copes with a request that has no url or headers', () => {
    expect(scrubEvent(event({ request: { method: 'GET' } })).request).toEqual({ method: 'GET' });
  });

  it('keeps only the user id', () => {
    const result = scrubEvent(
      event({
        user: { id: 'u1', email: 'a@example.invalid', username: 'a', ip_address: '1.1.1.1' },
      })
    );
    expect(result.user).toEqual({ id: 'u1' });
  });

  it('drops a user object that has no id', () => {
    expect(scrubEvent(event({ user: { email: 'a@example.invalid' } })).user).toEqual({});
  });

  it('strips query strings from breadcrumb urls and leaves other breadcrumbs untouched', () => {
    const plain: Breadcrumb = { category: 'ui.click', message: 'button' };
    const result = scrubEvent(
      event({
        breadcrumbs: [
          { category: 'fetch', data: { url: '/api/leads?email=a', method: 'GET' } },
          { category: 'navigation', data: { from: '/a?x=1', to: '/b?y=2' } },
          { category: 'xhr', data: { url: 42 } },
          plain,
        ],
      })
    );
    expect(result.breadcrumbs).toEqual([
      { category: 'fetch', data: { url: '/api/leads', method: 'GET' } },
      { category: 'navigation', data: { from: '/a', to: '/b' } },
      { category: 'xhr', data: { url: 42 } },
      plain,
    ]);
  });

  it('passes an event with no request, user or breadcrumbs through', () => {
    const bare = event({ message: 'm' });
    expect(scrubEvent(bare)).toEqual({ type: undefined, message: 'm' });
  });
});

describe('filterBreadcrumb', () => {
  it('drops console breadcrumbs', () => {
    expect(filterBreadcrumb({ category: 'console', message: 'secret' })).toBeNull();
  });

  it('keeps others', () => {
    const b = { category: 'fetch' };
    expect(filterBreadcrumb(b)).toBe(b);
  });
});
