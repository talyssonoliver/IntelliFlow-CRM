import { ImageResponse } from 'next/og';

// IFC-208: root-level Open Graph image. Next.js App Router auto-wires any
// `opengraph-image.tsx` under `app/` into every route's metadata that
// doesn't define its own (docs: "file-based metadata" — special files).
// This is the fix for content-audit finding F-006 (no og:image meta tag —
// social shares of any of the 25 public pages rendered without a preview
// image). Generated at request time via `next/og` (built into Next.js,
// no extra dependency) rather than a static PNG, so the image always
// matches the actual brand tokens defined in `layout.tsx` metadata
// instead of a hand-made asset going stale.

// No `export const runtime = 'edge'`: next.config enables
// `experimental.useCache`, and Next refuses a route-segment `runtime` config
// alongside it ("not compatible with nextConfig.experimental.useCache").
// `next/og` renders on the default Node.js runtime as well.
export const alt = 'Aurora: the CRM that works your pipeline for you';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Aurora brand tokens (components/aurora-site/aurora-site.css): navy ground,
// the blue-violet-cyan aurora gradient, the landing hero's own headline.
export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #11175b 0%, #1b1f73 55%, #2a1f7a 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 520,
          height: 10,
          borderRadius: 10,
          background: 'linear-gradient(90deg, #28d9d4 0%, #2a78f6 50%, #7655f6 100%)',
          marginBottom: 48,
        }}
      />
      <div
        style={{
          display: 'flex',
          fontSize: 96,
          fontWeight: 800,
          color: '#ffffff',
          letterSpacing: -3,
        }}
      >
        Aurora
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 34,
          color: '#c9cdf5',
          marginTop: 20,
          maxWidth: 900,
          textAlign: 'center',
        }}
      >
        The CRM that works your pipeline for you.
      </div>
    </div>,
    { ...size }
  );
}
