import type { CSSProperties } from 'react';
import Link from 'next/link';
import './final-cta.css';

/** Closing call to action, on Navy, with the ribbon artwork rising from the bottom. */
export function FinalCta() {
  return (
    <>
      <section
        className="final aurora-final"
        data-bridge-section
        style={{ '--bridge-accent': 'var(--navy)' } as CSSProperties}
      >
        <img
          src="/brand/aurora/bg/ribbon-left.webp"
          className="final-ribbon left"
          alt=""
          aria-hidden="true"
        />
        <img
          src="/brand/aurora/bg/ribbon-right.webp"
          className="final-ribbon right"
          alt=""
          aria-hidden="true"
        />
        <div className="wrap final-inner reveal" data-reveal>
          <h2>Give your team back the hours they lose to busywork.</h2>
          <p>Aurora prepares the work. Your people make the calls.</p>
          <div className="cta-row center-row">
            <Link href="/signup" className="btn btn-primary">
              Get started
            </Link>
            <Link href="/contact" className="btn btn-onDark">
              Book a demo
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
