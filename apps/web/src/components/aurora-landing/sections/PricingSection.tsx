import type { CSSProperties } from 'react';
import Link from 'next/link';
import './pricing-section.css';

/** What a visitor can tell Aurora they want to run, for the tailored-plan form. */
const RUN_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'approvals', label: 'AI agents and the approval queue' },
  { value: 'pipeline', label: 'Sales pipeline' },
  { value: 'service', label: 'Cases and tickets' },
  { value: 'insights', label: 'Insights' },
  { value: 'inbox', label: 'Email and calendar' },
  { value: 'integrations', label: 'Integrations' },
];

/** Pricing card, straddling the Navy/Mist boundary, with a real tailored-plan form. */
export function PricingSection() {
  return (
    <>
      <section
        className="pricing aurora-pricing"
        id="pricing"
        data-bridge-section
        style={{ '--bridge-accent': 'var(--blue)' } as CSSProperties}
      >
        <div className="wrap">
          <div className="price-card reveal" data-reveal>
            <div className="price-copy">
              <p className="eyebrow">Pricing</p>
              <h2>A plan built around how your team sells.</h2>
              <p className="section-lede">
                Tell us your team size and the parts of Aurora you need. We will put together a plan
                and walk you through it.
              </p>

              <form className="team-form" action="/contact" method="get">
                <div className="field">
                  <label htmlFor="pricing-email">Work email</label>
                  <input
                    id="pricing-email"
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    autoComplete="email"
                    aria-describedby="pricing-email-hint"
                  />
                  <p className="field-hint" id="pricing-email-hint">
                    We will only use this to put your plan together.
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="pricing-size">Team size</label>
                  <select id="pricing-size" name="team_size" required defaultValue="">
                    <option value="" disabled>
                      Select team size
                    </option>
                    <option value="1-5">1–5</option>
                    <option value="6-20">6–20</option>
                    <option value="21-50">21–50</option>
                    <option value="51-200">51–200</option>
                    <option value="200+">200+</option>
                  </select>
                </div>

                <fieldset className="field chips-field">
                  <legend>What do you want to run in Aurora?</legend>
                  <div className="chip-options">
                    {RUN_OPTIONS.map(({ value, label }) => (
                      <label key={value} className="chip-option">
                        <input type="checkbox" name="run" value={value} />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="cta-row">
                  <button type="submit" className="btn btn-primary">
                    Get a tailored plan
                  </button>
                  <Link href="/contact" className="btn btn-secondary">
                    Book a demo
                  </Link>
                </div>
              </form>
            </div>

            <ul className="includes">
              <li>
                <span className="material-symbols-outlined">check</span>15 AI agent types
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
