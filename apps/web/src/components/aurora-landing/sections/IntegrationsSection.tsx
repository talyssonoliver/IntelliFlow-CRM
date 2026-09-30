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

/** Ready integrations and developer surfaces. */
export function IntegrationsSection() {
  return (
    <>
      <section className="integrations">
        <div className="wrap">
          <div className="center reveal">
            <p className="eyebrow">Integrations</p>
            <h2>Plugs into the tools your team already lives in.</h2>
            <p className="section-lede">
              Email, chat, payments and sign-in on day one. Build your own with webhooks, React
              hooks and a CLI.
            </p>
          </div>
          <div className="logos reveal">
            <div className="logo">
              <img src="/brand/aurora/logos/gmail.svg" alt="" />
              <span>Gmail</span>
            </div>
            <div className="logo">
              <img src="/brand/aurora/logos/microsoftoutlook.svg" alt="" />
              <span>Outlook</span>
            </div>
            <div className="logo">
              <img src="/brand/aurora/logos/slack.svg" alt="" />
              <span>Slack</span>
            </div>
            <div className="logo">
              <img src="/brand/aurora/logos/microsoftteams.svg" alt="" />
              <span>Microsoft Teams</span>
            </div>
            <div className="logo">
              <img src="/brand/aurora/logos/stripe.svg" alt="" />
              <span>Stripe</span>
            </div>
            <div className="logo">
              <img src="/brand/aurora/logos/paypal.svg" alt="" />
              <span>PayPal</span>
            </div>
            <div className="logo">
              <img src="/brand/aurora/logos/google.svg" alt="" />
              <span>Google sign-in</span>
            </div>
            <div className="logo">
              <img src="/brand/aurora/logos/microsoftazure.svg" alt="" />
              <span>Azure sign-in</span>
            </div>
          </div>
          <div className="dev-row reveal">
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
      </section>
    </>
  );
}
