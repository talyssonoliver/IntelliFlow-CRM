import type { CSSProperties } from 'react';
import './integrations-section.css';

/** Mailbox connection through mail server settings, the connectors still planned,
 * and sign-in. Google sign-in works; Microsoft sign-in has never worked in production,
 * so it is planned. SAP is registered in code but not ready and must never appear here
 * (see product-truth.md §3.1 / §6). */
const CONNECTORS: ReadonlyArray<{ label: string; logo: string; status: string }> = [
  { label: 'Gmail', logo: '/brand/aurora/logos/gmail.svg', status: 'Mail settings' },
  // Microsoft 365 work mailboxes only: personal Outlook, Hotmail and Live addresses
  // need Microsoft sign-in, which is planned.
  { label: 'Outlook', logo: '/brand/aurora/logos/microsoftoutlook.svg', status: 'Work mail' },
  { label: 'Slack', logo: '/brand/aurora/logos/slack.svg', status: 'Planned' },
  { label: 'Microsoft Teams', logo: '/brand/aurora/logos/microsoftteams.svg', status: 'Planned' },
  { label: 'Stripe', logo: '/brand/aurora/logos/stripe.svg', status: 'Planned' },
  { label: 'PayPal', logo: '/brand/aurora/logos/paypal.svg', status: 'Planned' },
  { label: 'Google sign-in', logo: '/brand/aurora/logos/google.svg', status: 'Sign-in' },
  { label: 'Azure sign-in', logo: '/brand/aurora/logos/microsoftazure.svg', status: 'Planned' },
];

/** Developer surfaces: ready unless marked beta (built, not final), planned or soon (not built yet). */
const DEV_CHIPS: ReadonlyArray<{
  label: string;
  icon?: string;
  logo?: string;
  status?: 'beta' | 'soon' | 'planned';
}> = [
  { label: 'Inbound webhooks', icon: 'call_received', status: 'planned' },
  { label: 'Outbound webhooks', icon: 'call_made', status: 'planned' },
  { label: 'React hooks', logo: '/brand/aurora/logos/react.svg', status: 'planned' },
  { label: 'CLI', icon: 'terminal', status: 'planned' },
  { label: 'JWT', logo: '/brand/aurora/logos/jsonwebtokens.svg' },
  { label: 'MFA', icon: 'verified_user', status: 'planned' },
  { label: 'TypeScript SDK', logo: '/brand/aurora/logos/typescript.svg', status: 'beta' },
  { label: 'API keys', icon: 'vpn_key', status: 'soon' },
];

const DEV_STATUS_LABEL = { beta: 'Beta', soon: 'Coming soon', planned: 'Planned' } as const;
const DEV_STATUS_CLASS = { beta: 'beta', soon: 'soon', planned: 'soon' } as const;

/** Integrations and developer surfaces with their true status, wired to one Aurora core rather than a flat logo grid. */
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
          <h2>Connect your mailbox, with more tools to come.</h2>
          <p className="section-lede">
            Connect your own mailbox and sign in with Google. Microsoft sign-in, Slack, Teams,
            Stripe and PayPal are planned.
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
          <p className="dev-label">Developer tools</p>
          <div className="dev-row" data-reveal-stagger>
            {DEV_CHIPS.map(({ label, icon, logo, status }) => (
              <span key={label} className={status ? `dev ${DEV_STATUS_CLASS[status]}` : 'dev'}>
                {logo ? (
                  <img src={logo} alt="" />
                ) : (
                  <span className="material-symbols-outlined">{icon}</span>
                )}
                {label}
                {status && <em>{DEV_STATUS_LABEL[status]}</em>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
