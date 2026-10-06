import type { CSSProperties } from 'react';
import './proof-strip.css';

const bridgeStyle = { '--bridge-accent': 'var(--navy)' } as CSSProperties;

/**
 * The row of product facts under the stack: a white band with a rounded top that
 * rises over the end of the stage, so the two sections read as one hand-off.
 * Every number here is re-derived from code, not carried over from the old copy
 * (see the "10 agents" / "13 integrations" mismatches this replaces).
 */
export function ProofStrip() {
  return (
    <section className="proof proof-band" data-bridge-section style={bridgeStyle}>
      <div className="wrap proof-row">
        <div className="stat">
          <b>15</b>
          <span>agent types working the CRM, from lead scoring to email drafting</span>
        </div>
        <div className="stat">
          <b>1</b>
          <span>approval queue covering all six kinds of AI work, before anything ships</span>
        </div>
        <div className="stat">
          <b>6</b>
          <span>app connectors ready today, including Gmail, Slack and Stripe</span>
        </div>
        <div className="stat">
          <b>212</b>
          <span>product screens, from first lead to closed case</span>
        </div>
      </div>
    </section>
  );
}
