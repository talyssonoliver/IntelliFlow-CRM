'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavSheet } from '@/components/aurora-landing/sections/NavSheet';
import { NAV_LINKS, hrefFromElsewhere } from '@/components/aurora-landing/sections/footer-links';

/** The landing header's links, addressed from another page. */
export const SITE_LINKS: ReadonlyArray<{ href: string; label: string }> = NAV_LINKS.map((link) => ({
  href: hrefFromElsewhere(link),
  label: link.label,
}));

/**
 * The fixed Aurora header every public page shares with the landing page:
 * the wordmark home, the main destinations, Log in and Get started, and the
 * phone menu. It fills in once the page scrolls.
 */
export function AuroraSiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const current = (href: string) => (pathname === href ? 'page' : undefined);

  return (
    <>
      <a className="as-skip" href="#aurora-site-main">
        Skip to content
      </a>
      <header className={`as-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="as-wrap as-nav-row">
          <Link className="as-brand" href="/" aria-label="Aurora home">
            <img src="/brand/aurora/aurora-wave.webp" alt="" className="as-brand-mark" />
            <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="as-brand-word" />
          </Link>
          <nav className="as-nav-links" aria-label="Primary">
            {SITE_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={current(href)}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="as-nav-cta">
            <Link href="/login" className="as-login">
              Log in
            </Link>
            <Link href="/signup" className="as-btn as-btn-primary">
              Get started
            </Link>
          </div>
          <NavSheet>
            {SITE_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={current(href)}>
                {label}
              </Link>
            ))}
            <Link href="/login">Log in</Link>
          </NavSheet>
        </div>
      </header>
    </>
  );
}
