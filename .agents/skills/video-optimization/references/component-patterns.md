# Video Background Component Patterns

## Server Component (preferred)

No `"use client"` needed for a plain `<video>` tag. Keeps the JS bundle small.

```tsx
// components/effects/VideoBackground.tsx

export function VideoBackground({
  src,
  opacity = 40,
}: {
  src: string;
  opacity?: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className={`absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover opacity-${opacity}`}
      >
        <source src={src} type="video/webm" />
      </video>
      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/80 to-dark/40" />
    </div>
  );
}
```

## Usage in a page

```tsx
// app/not-found.tsx
import { VideoBackground } from '@/components/effects/VideoBackground';

export default function NotFound() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-dark text-darktext">
      <VideoBackground src="/videos/black-hole.webm" opacity={40} />

      <div className="relative z-10 mx-auto w-full max-w-[96rem] px-6 sm:px-8 lg:px-16">
        {/* Content here — always z-10 or higher to sit above the video */}
      </div>
    </section>
  );
}
```

## Multi-format fallback

For maximum browser compatibility, provide both WebM and MP4:

```tsx
<video autoPlay muted loop playsInline preload="auto" className="...">
  <source src="/videos/bg.webm" type="video/webm" />
  <source src="/videos/bg.mp4" type="video/mp4" />
</video>
```

Browser picks the first supported format. WebM (VP9) is smaller, MP4 (H.264) is
the fallback.

## Reduced motion support

Respect `prefers-reduced-motion` to pause video for users who prefer less
motion:

```tsx
'use client';

import { useEffect, useRef } from 'react';

export function VideoBackground({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches && videoRef.current) {
      videoRef.current.pause();
    }
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) videoRef.current?.pause();
      else videoRef.current?.play();
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover opacity-40"
      >
        <source src={src} type="video/webm" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/80 to-dark/40" />
    </div>
  );
}
```

## Mobile bandwidth optimization

Hide video on small screens to save bandwidth. Use a static gradient or image
instead:

```tsx
<div
  className="pointer-events-none absolute inset-0 overflow-hidden"
  aria-hidden="true"
>
  {/* Static fallback for mobile */}
  <div className="absolute inset-0 bg-gradient-to-br from-dark via-darksurface to-dark md:hidden" />

  {/* Video only on tablet+ */}
  <video
    autoPlay
    muted
    loop
    playsInline
    preload="auto"
    className="absolute left-1/2 top-1/2 hidden min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover opacity-40 md:block"
  >
    <source src="/videos/bg.webm" type="video/webm" />
  </video>

  <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/80 to-dark/40" />
</div>
```

## Compression decision tree

```
Source video
  |
  +-- Is it a background/decorative video?
  |     YES -> 720p, 30fps, CRF 35, VP9 WebM, target <2MB
  |     NO  -> Is it a product demo or showreel?
  |              YES -> 1080p, 30fps, CRF 23-28, VP9 or H.264, target <5MB
  |              NO  -> Keep original quality, lazy-load
  |
  +-- Duration > 15s?
  |     YES -> Consider trimming to a seamless loop segment
  |     NO  -> Compress as-is
  |
  +-- Has audio?
        YES -> Strip with -an (background) or keep (product demo)
        NO  -> Good, no action needed
```
