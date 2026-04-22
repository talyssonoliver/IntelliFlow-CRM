import { NextRequest } from 'next/server';
import { isProxyableAvatarHost } from '@/lib/shared/avatar-utils';

const AVATAR_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24;
const AVATAR_CACHE_STALE_SECONDS = 60 * 60 * 24 * 7;

// Hostnames are restricted to the allowlist in `isProxyableAvatarHost`, so
// only known avatar CDNs can ever be contacted — never private-network or
// metadata endpoints — see avatar-utils.ts.
export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get('src');

  if (!src) {
    return new Response('Missing src query parameter.', { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(src);
  } catch {
    return new Response('Invalid src URL.', { status: 400 });
  }

  if (parsedUrl.protocol !== 'https:') {
    return new Response('Avatar URLs must use HTTPS.', { status: 400 });
  }

  if (!isProxyableAvatarHost(parsedUrl.hostname)) {
    return new Response('Avatar host is not allowed.', { status: 403 });
  }

  // Re-construct the URL from the allow-listed hostname and a scrubbed path so
  // the value passed to `fetch` is provably free of tainted components (no
  // embedded credentials, no injected host override).
  const safeUrl = new URL('https://placeholder.invalid/');
  safeUrl.protocol = 'https:';
  safeUrl.hostname = parsedUrl.hostname;
  safeUrl.pathname = parsedUrl.pathname;
  safeUrl.search = parsedUrl.search;

  let upstream: Response;
  try {
    upstream = await fetch(safeUrl.toString(), {
      next: { revalidate: AVATAR_CACHE_MAX_AGE_SECONDS },
      redirect: 'error',
    });
  } catch {
    return new Response(null, { status: 204 });
  }

  if (!upstream.ok) {
    // Avoid bubbling provider throttling details to the browser console.
    if (upstream.status === 429) {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  const body = await upstream.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${AVATAR_CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${AVATAR_CACHE_STALE_SECONDS}`,
    },
  });
}
