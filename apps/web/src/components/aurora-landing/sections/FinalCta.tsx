import Link from 'next/link';

/** Closing call to action. */
export function FinalCta() {
  return (
    <>
      <section className="final">
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
        <div className="wrap final-inner reveal">
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
