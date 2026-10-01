import type { Metadata } from 'next';
import Link from 'next/link';
import { LiveStatus } from './LiveStatus';
import './status.css';

/**
 * System status, in the Aurora design. The web app is checked live from the
 * visitor's browser; services that have no public check yet say so, instead of
 * showing a figure nobody measured (CLAUDE.md: never mock data, show pending).
 */

export const metadata: Metadata = {
  title: 'System status',
  description: "A live check of Aurora's web app, run from your browser when you open the page.",
  openGraph: {
    title: 'Aurora system status',
    description: "A live check of Aurora's web app, run from your browser.",
    type: 'website',
  },
  alternates: {
    canonical: '/status',
  },
};

/** Services with no public health check yet. */
const PENDING: ReadonlyArray<{ name: string; detail: string }> = [
  { name: 'API', detail: 'The CRM data and actions behind the app' },
  { name: 'AI agents', detail: 'Lead scoring, drafts and the approval queue' },
  { name: 'Sign-in', detail: 'Email, Google, Microsoft and single sign-on' },
];

export default function StatusPage() {
  return (
    <div className="aurora-status">
      <section className="as-hero">
        <div className="as-wrap">
          <p className="as-eyebrow">Status</p>
          <h1 className="as-h1">System status</h1>
          <p className="as-lede">
            A live check, run from your browser when you open this page. We only show what we can
            measure.
          </p>
        </div>
      </section>

      <section className="as-wrap ast-body" aria-label="Service status">
        <LiveStatus />

        <ul className="ast-pending">
          {PENDING.map(({ name, detail }) => (
            <li key={name} className="as-card">
              <span className="ast-dot ast-pending-dot" aria-hidden="true" />
              <div>
                <h2>{name}</h2>
                <p>{detail}</p>
              </div>
              <span className="ast-tag">Pending: no public check yet</span>
            </li>
          ))}
        </ul>

        <div className="as-card ast-note">
          <h2>Incident history</h2>
          <p>
            No incident history is published yet. If something is not working for you, tell us and
            we will look into it.
          </p>
          <Link href="/contact" className="as-btn as-btn-primary">
            Report a problem
          </Link>
        </div>
      </section>
    </div>
  );
}
