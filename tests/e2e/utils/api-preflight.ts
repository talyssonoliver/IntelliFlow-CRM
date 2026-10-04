/**
 * API response preflight for E2E specs.
 *
 * CI post-mortem (.github/ci-pre-ship-remediation.md §4B.4): a smoke run failed
 * with `Unexpected token '<'` because an API call was answered with an HTML page
 * (a Next.js fallback / not-found page, or a base URL pointing at the wrong
 * server) and `response.json()` choked on it. That message names neither the URL
 * nor the status, so the cause had to be guessed. This check runs BEFORE any
 * JSON parse and, on a non-JSON answer, fails with the target URL, HTTP status,
 * content type, configured base URL and a bounded body excerpt.
 */
import type { APIResponse } from '@playwright/test';

const EXCERPT_CHARS = 300;

export interface ResponseFacts {
  url: string;
  status: number;
  contentType: string;
  body: string;
  baseURL: string;
}

/**
 * The diagnostic for a response that is not JSON, or null when it is JSON.
 * Pure, so the wording is deterministic.
 */
export function describeNonJsonResponse(facts: ResponseFacts): string | null {
  const contentType = facts.contentType || '(none)';
  if (/^application\/([\w.+-]+\+)?json\b/i.test(contentType.trim())) return null;

  const excerpt = facts.body.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CHARS);
  const isHtml = /text\/html/i.test(contentType) || /^<(!doctype|html|head|body)\b/i.test(excerpt);
  const cause = isHtml
    ? 'The server answered with an HTML page, not the API route: a fallback/not-found page or a base URL pointing at the wrong server.'
    : 'The response is not JSON.';

  return [
    `API preflight failed: GET ${facts.url} returned HTTP ${facts.status} with content-type "${contentType}" (expected application/json).`,
    cause,
    `Configured base URL: ${facts.baseURL}`,
    `Body excerpt (${EXCERPT_CHARS} chars max): ${excerpt || '(empty)'}`,
  ].join('\n');
}

/**
 * Parse an API response as JSON, or throw a diagnostic naming the URL and
 * status when the server answered with something else (typically HTML).
 * Pass the Playwright `baseURL` fixture so the diagnostic shows the base URL
 * the request actually used, not a re-derivation of the config.
 */
export async function expectJsonResponse(
  response: APIResponse,
  baseURL: string | undefined
): Promise<unknown> {
  const problem = describeNonJsonResponse({
    url: response.url(),
    status: response.status(),
    contentType: response.headers()['content-type'] ?? '',
    body: await response.text(),
    baseURL: baseURL ?? '(no baseURL configured)',
  });
  if (problem) throw new Error(problem);
  return response.json();
}
