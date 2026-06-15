/**
 * Helper for the /api/quality-reports/generate route. Lives in a sibling module
 * (not route.ts) because Next.js App Router forbids non-HTTP exports from a
 * route file.
 */

/**
 * Builds the argv for the Lighthouse CLI from a user-supplied URL. The URL is
 * validated (well-formed http/https only) and returned as a discrete argv
 * element so the caller can pass it to `execFile` — never interpolated into a
 * shell string — which closes the command-injection vector (CodeQL
 * js/indirect-command-line-injection #2257): shell metacharacters in the URL can
 * no longer be parsed by a shell.
 */
export function buildLighthouseArgs(url: string, outputPathBase: string): string[] {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error(`Invalid Lighthouse URL: "${url}"`);
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Unsupported Lighthouse URL protocol: "${protocol}"`);
  }
  return [
    'lighthouse',
    url,
    '--output',
    'json',
    '--output',
    'html',
    '--output-path',
    outputPathBase,
    '--chrome-flags=--headless --no-sandbox --disable-gpu',
  ];
}
