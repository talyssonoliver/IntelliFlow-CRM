import Link from 'next/link';
import { NavSheet } from './NavSheet';
import { NAV_LINKS, type FooterLink } from './footer-links';
import './site-nav.css';

/** A header link: a plain anchor for a section of this page, a Link for a page. */
const navLink = (link: FooterLink) =>
  link.section ? (
    <a key={link.href} href={link.href}>
      {link.label}
    </a>
  ) : (
    <Link key={link.href} href={link.href}>
      {link.label}
    </Link>
  );

/** Skip link and the fixed site header, with the phone menu. */
export function SiteNav() {
  return (
    <>
      <a className="skip" href="#aurora-main">
        Skip to content
      </a>
      <header className="nav" id="nav">
        <div className="wrap nav-row">
          <a className="brand" href="#aurora-main" aria-label="Aurora home">
            <img src="/brand/aurora/aurora-wave.webp" alt="" className="brand-mark" />
            <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="brand-word" />
          </a>
          <nav className="nav-links" aria-label="Primary">
            {NAV_LINKS.map(navLink)}
          </nav>
          <div className="nav-cta">
            <Link href="/login" className="link">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Get started
            </Link>
          </div>
          <NavSheet>
            {NAV_LINKS.map(navLink)}
            <Link href="/login">Log in</Link>
          </NavSheet>
        </div>
      </header>
    </>
  );
}
