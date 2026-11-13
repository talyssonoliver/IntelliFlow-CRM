import type { Metadata } from 'next';
import { OG_IMAGES } from '@/lib/og-images';
import Link from 'next/link';
import { LiveStatus } from './LiveStatus';
import { StatusMonitor } from '@/components/status/status-monitor';
import './status.css';

/**
 * System status, in the Aurora design. The web app is checked live from the
 * visitor's browser; the API, AI agents and sign-in are checked by the web
 * server (/api/status). A check that cannot run says so, instead of showing a
 * figure nobody measured (CLAUDE.md: never mock data, show pending).
 */

export const metadata: Metadata = {
  title: 'System status',
  description: "A live check of Aurora's web app, run from your browser when you open the page.",
  openGraph: {
    images: OG_IMAGES,
    title: 'Aurora system status',
    description: "A live check of Aurora's web app, run from your browser.",
    type: 'website',
  },
  alternates: {
    canonical: '/status',
  },
};

export default function StatusPage() {
  return (
    // The page carries the aurora-site scope itself: signed-in visitors get the app
    // shell, which has no .aurora-site wrapper, and every status style is scoped under it.
    <div className="aurora-site aurora-status">
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

        <StatusMonitor />

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
