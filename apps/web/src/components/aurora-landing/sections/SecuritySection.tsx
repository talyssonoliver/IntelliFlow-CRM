import Link from 'next/link';

/** Security and governance on navy. */
export function SecuritySection() {
  return (
    <>
      <section className="security dark" id="security">
        <div className="wrap feature-grid">
          <div className="feature-copy reveal">
            <p className="eyebrow on-dark">Security and governance</p>
            <h2>Built for teams that answer to someone.</h2>
            <p className="section-lede">
              Control, isolation and a record of every change: the basics your security review asks
              for, built in from day one. Our compliance roadmap is yours on request.
            </p>
            <Link href="/contact" className="btn btn-onDark">
              Request the compliance roadmap
            </Link>
          </div>
          <div className="controls reveal">
            <div className="control">
              <span className="material-symbols-outlined">task_alt</span>
              <b>Human approval</b>
              <p>No AI action runs until a person approves it.</p>
            </div>
            <div className="control">
              <span className="material-symbols-outlined">database</span>
              <b>Tenant isolation</b>
              <p>Row-level security keeps every workspace&apos;s data apart.</p>
            </div>
            <div className="control">
              <span className="material-symbols-outlined">verified_user</span>
              <b>Multi-factor sign-in</b>
              <p>MFA protects every account.</p>
            </div>
            <div className="control">
              <span className="material-symbols-outlined">history</span>
              <b>Audit log</b>
              <p>Who changed what, and when, for every record.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
