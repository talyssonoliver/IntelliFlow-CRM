import type { CSSProperties } from 'react';
import Link from 'next/link';
import { FOOTER_COLUMNS } from './footer-links';
import './site-footer.css';

/** Site footer, continuing the Final CTA's Navy with no seam. */
export function SiteFooter() {
  return (
    <footer
      className="footer aurora-footer"
      data-bridge-section
      style={{ '--bridge-accent': 'var(--navy)' } as CSSProperties}
    >
      <div className="wrap foot-row">
        <div>
          <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="foot-word" />
          <p>The AI CRM that asks before it acts.</p>
        </div>
        <nav className="foot-cols" aria-label="Footer">
          {FOOTER_COLUMNS.map(({ title, links }) => (
            <div key={title}>
              <b>{title}</b>
              {links.map((link) =>
                link.section ? (
                  <a key={link.href} href={link.href}>
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                )
              )}
            </div>
          ))}
        </nav>
      </div>
      <div className="wrap foot-legal">© {new Date().getFullYear()} Aurora</div>
    </footer>
  );
}
