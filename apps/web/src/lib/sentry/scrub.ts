/**
 * Sentry event scrubbing for the customer-facing web app.
 *
 * IntelliFlow is a CRM: URLs, headers, request bodies and user objects can all
 * carry customer PII or credentials. Everything here is deny-by-default for the
 * request envelope — we keep the method and the path, nothing else.
 */
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

const REDACTED_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-supabase-auth',
]);

/** Drop the query string and fragment from a URL or relative path. */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  const scrubbed: Record<string, unknown> = { ...data };
  for (const key of ['url', 'from', 'to']) {
    if (typeof scrubbed[key] === 'string') scrubbed[key] = stripQuery(scrubbed[key]);
  }
  return { ...breadcrumb, data: scrubbed };
}

function scrubRequest(request: NonNullable<ErrorEvent['request']>): void {
  delete request.cookies;
  delete request.query_string;
  delete request.data;
  if (request.url) request.url = stripQuery(request.url);
  if (!request.headers) return;
  for (const name of Object.keys(request.headers)) {
    if (REDACTED_HEADERS.has(name.toLowerCase())) delete request.headers[name];
  }
}

/** Keep the opaque id so an error can be tied to an account; drop the rest. */
function scrubUser(user: NonNullable<ErrorEvent['user']>): NonNullable<ErrorEvent['user']> {
  return user.id === undefined ? {} : { id: user.id };
}

/** `beforeSend` hook: strips cookies, auth headers, query strings, bodies and user PII. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) scrubRequest(event.request);
  if (event.user) event.user = scrubUser(event.user);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  return event;
}

/** `beforeBreadcrumb` hook: console output in a CRM can contain anything. */
export function filterBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return breadcrumb.category === 'console' ? null : breadcrumb;
}
