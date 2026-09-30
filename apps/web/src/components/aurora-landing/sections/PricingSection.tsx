import Link from 'next/link';

/** Pricing card. */
export function PricingSection() {
  return (
    <>
      <section className="pricing" id="pricing">
        <div className="wrap">
          <div className="price-card reveal">
            <div>
              <p className="eyebrow">Pricing</p>
              <h2>A plan built around how your team sells.</h2>
              <p className="section-lede">
                Tell us your team size and the parts of Aurora you need. We will put together a plan
                and walk you through it.
              </p>
              <div className="cta-row">
                <Link href="/contact" className="btn btn-primary">
                  Get a tailored plan
                </Link>
                <Link href="/contact" className="btn btn-secondary">
                  Book a demo
                </Link>
              </div>
            </div>
            <ul className="includes">
              <li>
                <span className="material-symbols-outlined">check</span>All ten AI agents
              </li>
              <li>
                <span className="material-symbols-outlined">check</span>Approval queue and audit log
              </li>
              <li>
                <span className="material-symbols-outlined">check</span>Pipeline, leads and accounts
              </li>
              <li>
                <span className="material-symbols-outlined">check</span>Cases, tickets and SLAs
              </li>
              <li>
                <span className="material-symbols-outlined">check</span>Insights hub
              </li>
              <li>
                <span className="material-symbols-outlined">check</span>Gmail, Outlook, Slack and
                Teams
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
