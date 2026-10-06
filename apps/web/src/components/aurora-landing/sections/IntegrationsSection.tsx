import type { CSSProperties } from 'react';
import './integrations-section.css';

/** The 6 connectors that are actually registered and ready today, plus the two
 * OAuth sign-in providers. SAP is registered in code but not ready and must
 * never appear here (see product-truth.md §3.1 / §6). */
const CONNECTORS: ReadonlyArray<{ label: string; logo: string; status: string }> = [
  { label: 'Gmail', logo: '/brand/aurora/logos/gmail.svg', status: 'Ready' },
  { label: 'Outlook', logo: '/brand/aurora/logos/microsoftoutlook.svg', status: 'Ready' },
  { label: 'Slack', logo: '/brand/aurora/logos/slack.svg', status: 'Ready' },
  { label: 'Microsoft Teams', logo: '/brand/aurora/logos/microsoftteams.svg', status: 'Ready' },
  { label: 'Stripe', logo: '/brand/aurora/logos/stripe.svg', status: 'Ready' },
  { label: 'PayPal', logo: '/brand/aurora/logos/paypal.svg', status: 'Ready' },
  { label: 'Google sign-in', logo: '/brand/aurora/logos/google.svg', status: 'Sign-in' },
  { label: 'Azure sign-in', logo: '/brand/aurora/logos/microsoftazure.svg', status: 'Sign-in' },
];

/** Developer surfaces: ready unless marked beta (built, not final) or soon (not built yet). */
const DEV_CHIPS: ReadonlyArray<{
  label: string;
  icon?: string;
  logo?: string;
  status?: 'beta' | 'soon';
}> = [
  { label: 'Inbound webhooks', icon: 'call_received' },
  { label: 'Outbound webhooks', icon: 'call_made' },
  { label: 'React hooks', logo: '/brand/aurora/logos/react.svg' },
  { label: 'CLI', icon: 'terminal' },
  { label: 'JWT', logo: '/brand/aurora/logos/jsonwebtokens.svg' },
  { label: 'MFA', icon: 'verified_user' },
  { label: 'TypeScript SDK', logo: '/brand/aurora/logos/typescript.svg', status: 'beta' },
  { label: 'API keys', icon: 'vpn_key', status: 'soon' },
];

/** Ready integrations and developer surfaces, wired to one Aurora core rather than a flat logo grid. */
export function IntegrationsSection() {
  return (
    <section
      className="integrations aurora-integrations"
      id="integrations"
      data-bridge-section
      style={{ '--bridge-accent': 'var(--cyan)' } as CSSProperties}
    >
      <div className="wrap">
        <div className="center reveal" data-reveal>
          <p className="eyebrow">Integrations</p>
          <h2>Plugs into the tools your team already lives in.</h2>
          <p className="section-lede">
            Email, chat, payments and sign-in on day one. Build your own with webhooks, React hooks
            and a CLI.
          </p>
        </div>

        <div className="integration-system reveal" data-reveal>
          <div className="core-node">
            <span className="core-ring" aria-hidden="true" />
            <img src="/brand/aurora/aurora-wave.webp" className="core-mark" alt="" />
            <span>Aurora core</span>
          </div>
          <span className="core-stem" aria-hidden="true" />

          <div className="logos" data-reveal-stagger>
            {CONNECTORS.map(({ label, logo, status }) => (
              <div className="logo" key={label}>
                <img src={logo} alt="" />
                <span>{label}</span>
                <span className="wire-status">{status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dev-panel reveal" data-reveal>
          <p className="dev-label">Build your own on the same connectors</p>
          <div className="dev-row" data-reveal-stagger>
            {DEV_CHIPS.map(({ label, icon, logo, status }) => (
              <span key={label} className={status ? `dev ${status}` : 'dev'}>
                {logo ? (
                  <img src={logo} alt="" />
                ) : (
                  <span className="material-symbols-outlined">{icon}</span>
                )}
                {label}
                {status && <em>{status === 'beta' ? 'Beta' : 'Coming soon'}</em>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
