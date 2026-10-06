import Link from 'next/link';
import { SectionCurve } from '@/components/aurora-landing/sections/SectionCurve';
import {
  FOOTER_COLUMNS as SHARED_COLUMNS,
  hrefFromElsewhere,
} from '@/components/aurora-landing/sections/footer-links';

/** The landing footer's columns, addressed from another page. */
export const FOOTER_COLUMNS: ReadonlyArray<{
  title: string;
  links: ReadonlyArray<{ href: string; label: string }>;
}> = SHARED_COLUMNS.map(({ title, links }) => ({
  title,
  links: links.map((link) => ({ href: hrefFromElsewhere(link), label: link.label })),
}));

/** The Aurora footer: Navy under a ribbon-traced curve, with the aurora ribbons rising behind it. */
export function AuroraSiteFooter() {
  return (
    <footer className="as-footer">
      <SectionCurve above="#F5F7FF" id="curve-site-footer" />
      <div className="as-footer-ribbons" aria-hidden="true">
        <img src="/brand/aurora/bg/ribbon-left.webp" className="left" alt="" />
        <img src="/brand/aurora/bg/ribbon-right.webp" className="right" alt="" />
      </div>
      <div className="as-wrap as-foot-row">
        <div>
          <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="as-foot-word" />
          <p>The AI CRM that asks before it acts.</p>
        </div>
        <nav className="as-foot-cols" aria-label="Footer">
          {FOOTER_COLUMNS.map(({ title, links }) => (
            <div key={title}>
              <b>{title}</b>
              {links.map(({ href, label }) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className="as-wrap as-foot-legal">© {new Date().getFullYear()} Aurora</div>
    </footer>
  );
}
