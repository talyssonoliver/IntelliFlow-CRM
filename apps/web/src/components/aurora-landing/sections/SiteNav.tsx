import Link from 'next/link';

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
            <a href="#platform">Platform</a>
            <a href="#agents">AI agents</a>
            <a href="#security">Security</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="nav-cta">
            <Link href="/login" className="link">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Get started
            </Link>
          </div>
          <details className="nav-menu">
            <summary aria-label="Menu">
              <span className="material-symbols-outlined">menu</span>
            </summary>
            <nav aria-label="Mobile">
              <a href="#platform">Platform</a>
              <a href="#agents">AI agents</a>
              <a href="#security">Security</a>
              <a href="#pricing">Pricing</a>
              <Link href="/login">Log in</Link>
            </nav>
          </details>
        </div>
      </header>
    </>
  );
}
