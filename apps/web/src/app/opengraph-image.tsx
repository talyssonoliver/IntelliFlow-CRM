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

export const runtime = 'edge';
export const alt = 'IntelliFlow CRM — AI-Powered Customer Relationship Management';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
        background: '#0f172a',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 140,
          height: 140,
          borderRadius: 28,
          background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)',
          marginBottom: 40,
        }}
      >
        <span style={{ fontSize: 72, fontWeight: 700, color: '#0f172a', letterSpacing: -3 }}>
          IF
        </span>
      </div>
      <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: '#f8fafc' }}>
        IntelliFlow CRM
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 28,
          color: '#94a3b8',
          marginTop: 16,
          maxWidth: 820,
          textAlign: 'center',
        }}
      >
        AI-powered lead scoring, pipeline analytics, and automated workflows
      </div>
    </div>,
    { ...size }
  );
}
