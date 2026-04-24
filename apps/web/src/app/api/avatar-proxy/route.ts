import { NextRequest } from 'next/server';

const AVATAR_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24;
const AVATAR_CACHE_STALE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Closed allow-list of exact hostnames we proxy avatars from.
 *
 * Each key is a LITERAL string constant (not derived from any user input).
 * The request-forgery fix pattern is to resolve the user-supplied hostname
 * down to one of these literals via equality check, then reconstruct the
 * outbound URL by concatenating the literal host with only the pathname from
 * the user — never by passing the parsed URL itself through.
 */
const AVATAR_HOST_LITERALS = [
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
  'lh7.googleusercontent.com',
  'avatars.githubusercontent.com',
  'api.dicebear.com',
  'secure.gravatar.com',
  'www.gravatar.com',
  'gravatar.com',
  'images.unsplash.com',
] as const;
type AllowedAvatarHost = (typeof AVATAR_HOST_LITERALS)[number];

function pickAllowedHost(hostname: string): AllowedAvatarHost | null {
  // Iteration over a frozen literal tuple — the returned value (when found)
  // is one of the string LITERALS defined above, not the user-controlled
  // `hostname` argument. CodeQL treats lookups into constant arrays as
  // taint-breaking for request-forgery.
  for (const literal of AVATAR_HOST_LITERALS) {
    if (hostname === literal) return literal;
  }
  return null;
}

// Conservative pathname filter: slash + alphanumeric + a handful of URL-safe
// chars. Anything else is dropped before we concatenate it into the request.
const PATHNAME_SAFE_RE = /[^A-Za-z0-9\-._~!$&'()*+,;=:@/%]/g;

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

  const safeHost = pickAllowedHost(parsedUrl.hostname);
  if (safeHost === null) {
    return new Response('Avatar host is not allowed.', { status: 403 });
  }

  // Build the outbound URL by CONCATENATING a literal base (from the closed
  // `AVATAR_HOST_LITERALS` tuple) with sanitised path and query segments.
  // The `fetch` target is therefore never derived from the raw user URL.
  const safePath =
    parsedUrl.pathname.length > 0
      ? '/' + parsedUrl.pathname.slice(1).replaceAll(PATHNAME_SAFE_RE, '')
      : '/';
  const safeQuery = parsedUrl.search.length > 1 ? parsedUrl.search.slice(0, 2000) : '';
  const safeUrlString = `https://${safeHost}${safePath}${safeQuery}`;

  let upstream: Response;
  try {
    upstream = await fetch(safeUrlString, {
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
