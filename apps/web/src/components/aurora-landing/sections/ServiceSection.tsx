import type { CSSProperties } from 'react';
import './service-section.css';

type InsightType = 'warning' | 'opportunity' | 'reminder' | 'achievement';

const INSIGHT_STYLE: Record<
  InsightType,
  { icon: string; ic: string; icbg: string; label: string }
> = {
  warning: { icon: 'warning', ic: '#C27C00', icbg: 'rgba(245,160,0,.16)', label: 'Warning' },
  opportunity: {
    icon: 'trending_up',
    ic: '#0A726D',
    icbg: 'rgba(40,217,212,.18)',
    label: 'Opportunity',
  },
  reminder: { icon: 'event', ic: '#2A78F6', icbg: 'rgba(42,120,246,.14)', label: 'Reminder' },
  achievement: {
    icon: 'military_tech',
    ic: '#7655F6',
    icbg: 'rgba(118,85,246,.14)',
    label: 'Achievement',
  },
};

const INSIGHTS: Array<{ type: InsightType; title: string; body: string; action?: string }> = [
  {
    type: 'warning',
    title: 'Contoso: usage down three weeks running',
    body: 'Logins fell after the March renewal call.',
    action: 'Draft a check-in email',
  },
  {
    type: 'opportunity',
    title: 'Fabrikam opened the proposal twice this week',
    body: "No reply since Tuesday's follow-up.",
    action: 'Send a pricing recap',
  },
  {
    type: 'reminder',
    title: "Adatum's onboarding call is unconfirmed",
    body: 'Booked for Thursday, no calendar response yet.',
    action: 'Send a reminder',
  },
  {
    type: 'achievement',
    title: 'Litware hit a 90-day first-response average',
    body: 'Every ticket answered inside SLA this quarter.',
  },
];

const INSIGHT_FILTERS: Array<{ label: string; on?: boolean }> = [
  { label: 'All', on: true },
  { label: 'Warnings' },
  { label: 'Opportunities' },
  { label: 'Reminders' },
  { label: 'Achievements' },
];

/** After the sale: real SLAs, case workflows, churn health and the AI insights feed. */
export function ServiceSection() {
  return (
    <>
      <section
        className="bento-sec service-section"
        data-bridge-section
        style={{ '--bridge-accent': '#28D9D4' } as CSSProperties}
      >
        <div className="wrap">
          <div className="center reveal" data-reveal>
            <p className="eyebrow">Beyond the pipeline</p>
            <h2>The whole customer, covered.</h2>
            <p className="section-lede">
              The same agents keep watch after the deal closes, so nothing slips between sales and
              service.
            </p>
          </div>
          <div className="bento reveal" data-reveal-stagger>
            <article
              className="bcard span2 insight-feed-card"
              aria-label="AI insights feed in a sample workspace"
            >
              <div className="bcard-copy">
                <div className="btag-row">
                  <p className="btag" style={{ '--c': '#7655F6' } as CSSProperties}>
                    Insights
                  </p>
                  <span className="mini-sample">Sample workspace</span>
                </div>
                <h3>A short list of what to do next, read from everything above.</h3>
              </div>
              <div className="insight-toolbar">
                {INSIGHT_FILTERS.map((f) => (
                  <span key={f.label} className={`fchip${f.on ? ' on' : ''}`}>
                    {f.label}
                  </span>
                ))}
                <span className="search">
                  <span className="material-symbols-outlined">search</span>Search insights
                </span>
              </div>
              <div className="insight-feed">
                {INSIGHTS.map((insight) => {
                  const style = INSIGHT_STYLE[insight.type];
                  return (
                    <div className="insight-row" key={insight.title}>
                      <span
                        className="insight-icon"
                        style={{ '--ic': style.ic, '--icbg': style.icbg } as CSSProperties}
                      >
                        <span className="material-symbols-outlined">{style.icon}</span>
                      </span>
                      <div className="insight-copy">
                        <span
                          className="insight-type"
                          style={{ '--ic': style.ic } as CSSProperties}
                        >
                          {style.label}
                        </span>
                        <b>{insight.title}</b>
                        <p>
                          {insight.body}
                          {insight.action && (
                            <span className="insight-action"> Suggested: {insight.action}.</span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>

            <article
              className="bcard ticket-card"
              aria-label="Support tickets in a sample workspace"
            >
              <div className="bcard-copy">
                <div className="btag-row">
                  <p className="btag" style={{ '--c': '#d64541' } as CSSProperties}>
                    Ticket SLAs
                  </p>
                  <span className="mini-sample">Sample workspace</span>
                </div>
                <h3>Never miss a first response.</h3>
              </div>
              <div className="kpis ticket-stats">
                <div className="kpi">
                  <b>6</b>
                  <small>Open</small>
                </div>
                <div className="kpi">
                  <b>4</b>
                  <small>In progress</small>
                </div>
                <div className="kpi breached">
                  <b>1</b>
                  <small>Breached</small>
                </div>
                <div className="kpi resolved">
                  <b>9</b>
                  <small>Resolved today</small>
                </div>
              </div>
              <div className="sla-list">
                <div className="sla">
                  <span
                    className="ring"
                    style={{ '--c': '#d64541', '--p': '82' } as CSSProperties}
                  ></span>
                  <div>
                    <b>Login loop on mobile</b>
                    <small>Urgent · 38 min left</small>
                  </div>
                </div>
                <div className="sla">
                  <span
                    className="ring"
                    style={{ '--c': '#b7790d', '--p': '45' } as CSSProperties}
                  ></span>
                  <div>
                    <b>Export missing columns</b>
                    <small>High · 4 h left</small>
                  </div>
                </div>
              </div>
            </article>

            <article
              className="bcard span2"
              aria-label="Case workflow builder in a sample workspace"
            >
              <div className="bcard-copy">
                <div className="btag-row">
                  <p className="btag" style={{ '--c': '#12A6A1' } as CSSProperties}>
                    Case workflows
                  </p>
                  <span className="mini-sample">Sample workspace</span>
                </div>
                <h3>Cases routed, prioritised and summarised, with you signing off.</h3>
              </div>
              <div className="flow2">
                <div className="fnode">
                  <span className="material-symbols-outlined">inbox</span>Case opened
                </div>
                <div className="fnode ai">
                  <span className="material-symbols-outlined">auto_awesome</span>Priority predicted
                </div>
                <div className="fnode">
                  <span className="material-symbols-outlined">person</span>Routed to owner
                </div>
                <div className="fnode ai">
                  <span className="material-symbols-outlined">summarize</span>Summary drafted
                </div>
                <div className="fnode done">
                  <span className="material-symbols-outlined">task_alt</span>Resolved
                </div>
              </div>
              <div className="kpis case-stats">
                <div className="kpi">
                  <b>14</b>
                  <small>Open</small>
                </div>
                <div className="kpi">
                  <b>8</b>
                  <small>In progress</small>
                </div>
                <div className="kpi">
                  <b>2</b>
                  <small>Overdue</small>
                </div>
                <div className="kpi">
                  <b>31</b>
                  <small>Closed this month</small>
                </div>
              </div>
            </article>

            <article
              className="bcard health-card"
              aria-label="Churn risk and sentiment in a sample workspace"
            >
              <div className="bcard-copy">
                <div className="btag-row">
                  <p className="btag" style={{ '--c': '#7655F6' } as CSSProperties}>
                    Customer health
                  </p>
                  <span className="mini-sample">Sample workspace</span>
                </div>
                <h3>
                  Spot the accounts slipping away, and the conversations that need a reply first.
                </h3>
              </div>
              <div className="health-gauge-row">
                <svg
                  className="health-gauge"
                  width="120"
                  height="68"
                  viewBox="0 0 120 68"
                  aria-hidden="true"
                >
                  <path
                    d="M 16 54 A 44 44 0 1 1 104 54"
                    fill="none"
                    stroke="rgba(17,23,91,.09)"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 16 54 A 44 44 0 0 1 38.9 15.4"
                    fill="none"
                    stroke="#c43b3b"
                    strokeWidth="10"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="health-gauge-copy">
                  <small>Health score</small>
                  <span className="score" style={{ color: '#c43b3b' }}>
                    34
                  </span>
                  <b>Contoso</b>
                </div>
              </div>
              <div className="risk-bars">
                <div className="risk-bar">
                  <span>High</span>
                  <span className="risk-bar-track">
                    <span
                      className="risk-bar-fill"
                      style={{ '--rc': '#c43b3b', width: '20%' } as CSSProperties}
                    ></span>
                  </span>
                  <span>20%</span>
                </div>
                <div className="risk-bar">
                  <span>Medium</span>
                  <span className="risk-bar-track">
                    <span
                      className="risk-bar-fill"
                      style={{ '--rc': '#c27c00', width: '35%' } as CSSProperties}
                    ></span>
                  </span>
                  <span>35%</span>
                </div>
                <div className="risk-bar">
                  <span>Low</span>
                  <span className="risk-bar-track">
                    <span
                      className="risk-bar-fill"
                      style={{ '--rc': '#0a726d', width: '45%' } as CSSProperties}
                    ></span>
                  </span>
                  <span>45%</span>
                </div>
              </div>
              <div className="tone-mini">
                <div className="tone-row">
                  <b>Contoso · billing thread</b>
                  <span className="pill high">Negative</span>
                </div>
                <div className="tone-row">
                  <b>Fabrikam · renewal call</b>
                  <span className="pill low">Positive</span>
                </div>
              </div>
            </article>
          </div>
          <p className="bento-note">Sample workspace data</p>
        </div>
      </section>
    </>
  );
}
