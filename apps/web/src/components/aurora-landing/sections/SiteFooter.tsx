import Link from 'next/link';

/** Site footer. */
export function SiteFooter() {
  return (
    <>
      <footer className="footer">
        <div className="wrap foot-row">
          <div>
            <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="foot-word" />
            <p>The AI CRM that asks before it acts.</p>
          </div>
          <div className="foot-cols">
            <div>
              <b>Product</b>
              <a href="#platform">Platform</a>
              <a href="#agents">AI agents</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <b>Trust</b>
              <a href="#security">Security</a>
              <Link href="/privacy">Privacy</Link>
            </div>
            <div>
              <b>Company</b>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </div>
        <div className="wrap foot-legal">© {new Date().getFullYear()} Aurora</div>
      </footer>
    </>
  );
}
