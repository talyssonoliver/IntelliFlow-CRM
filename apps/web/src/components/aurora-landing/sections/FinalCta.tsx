import type { CSSProperties } from 'react';
import pricingData from '@/data/pricing-data.json';
import { SectionCurve } from './SectionCurve';
import './final-cta.css';

/** Three small moments from a sample workspace that drift on the ribbons around the pitch. */
const MOMENTS: ReadonlyArray<{ icon: string; label: string; detail: string; tone: string }> = [
  {
    icon: 'task_alt',
    label: 'Follow-up approved',
    detail: 'Maya Chen · Northwind',
    tone: '#28D9D4',
  },
  {
    icon: 'view_kanban',
    label: 'Deal moved to Proposal',
    detail: 'Contoso · £41,000',
    tone: '#2A78F6',
  },
  { icon: 'insights', label: 'Lead scored 92', detail: 'Acme Ltd · hot', tone: '#BCA8FF' },
];

/** The trial length, from the same data the pricing page and FAQ read. */
const trialDays = pricingData.metadata.freeTrialDays;

/**
 * Closing call to action on Navy. The aurora ribbons flow through it and on
 * into the footer as one piece; one field starts the free trial.
 */
export function FinalCta() {
  return (
    <>
      <section
        className="final aurora-final"
        data-bridge-section
        style={{ '--bridge-accent': 'var(--navy)' } as CSSProperties}
      >
        <SectionCurve above="#F5F7FF" id="curve-final" />
        <div className="final-ribbons" aria-hidden="true">
          <img src="/brand/aurora/bg/ribbon-left.webp" className="final-ribbon left" alt="" />
          <img src="/brand/aurora/bg/ribbon-right.webp" className="final-ribbon right" alt="" />
        </div>
        <ul className="final-moments" aria-label="Aurora at work in a sample workspace">
          {MOMENTS.map(({ icon, label, detail, tone }) => (
            <li key={label} className="final-moment" style={{ '--tone': tone } as CSSProperties}>
              <span className="material-symbols-outlined">{icon}</span>
              <span>
                <b>{label}</b>
                <small>{detail}</small>
              </span>
            </li>
          ))}
        </ul>
        <div className="wrap final-inner reveal" data-reveal>
          <h2>
            Your first {trialDays} days with Aurora are free. Your team will feel it by Friday.
          </h2>
          <p>
            The agents start work as soon as your leads and deals are in, and nothing goes out
            without your yes.
          </p>
          <form className="final-form" action="/signup" method="get">
            <label htmlFor="final-email" className="sr-only">
              Work email
            </label>
            <input
              id="final-email"
              name="email"
              type="email"
              placeholder="Your work email"
              autoComplete="email"
              required
            />
            <button type="submit" className="btn btn-primary">
              Start free
            </button>
          </form>
          <p className="final-trust">
            <span>{trialDays} days free</span>
            <span aria-hidden="true">·</span>
            <span>No credit card</span>
            <span aria-hidden="true">·</span>
            <span>Every AI action waits for your yes</span>
          </p>
        </div>
      </section>
    </>
  );
}
