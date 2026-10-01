import type { CSSProperties } from 'react';
import Link from 'next/link';
import { SectionCurve } from './SectionCurve';
import './security-section.css';

/** Security and governance on Navy, entered through the Mist-to-Navy bridge. */
export function SecuritySection() {
  return (
    <>
      <section
        className="security dark aurora-security"
        id="security"
        data-bridge-section
        style={{ '--bridge-accent': 'var(--navy)' } as CSSProperties}
      >
        <SectionCurve above="#F5F7FF" id="curve-security" />
        <div className="wrap feature-grid">
          <div className="feature-copy reveal" data-reveal>
            <p className="eyebrow on-dark">Security</p>
            <h2>Enterprise security, on from day one.</h2>
            <p className="section-lede">
              No AI action goes out without a person&apos;s approval. Each workspace&apos;s data is
              kept apart, multi-factor sign-in is available on every account, and every change is
              logged.
            </p>
            <Link href="/contact" className="btn btn-onDark">
              Request the compliance roadmap
            </Link>
          </div>
          <div className="controls reveal" data-reveal-stagger>
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
              <p>MFA is available on every account.</p>
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
