import type { CSSProperties } from 'react';

/** After the sale: churn, SLAs, sentiment, case workflows and insights. */
export function ServiceSection() {
  return (
    <>
      <section className="bento-sec">
        <div className="wrap">
          <div className="center reveal">
            <p className="eyebrow">Beyond the pipeline</p>
            <h2>The whole customer, covered.</h2>
            <p className="section-lede">
              The same agents keep watch after the deal closes, so nothing slips between sales and
              service.
            </p>
          </div>
          <div className="bento reveal">
            <article className="bcard span2">
              <div className="bcard-copy">
                <p className="btag" style={{ '--c': '#7655F6' } as CSSProperties}>
                  Churn risk
                </p>
                <h3>Spot the accounts slipping away, weeks early.</h3>
              </div>
              <div className="mini-app">
                <div className="row head">
                  <span>Account</span>
                  <span>Risk</span>
                  <span>Why</span>
                  <span>Usage, 8 weeks</span>
                </div>
                <div className="row">
                  <span className="who2">
                    <i style={{ '--a': '#1BAFAA' } as CSSProperties}>C</i>
                    <b>Contoso</b>
                  </span>
                  <span className="pill high">High</span>
                  <span>Usage down 3 weeks</span>
                  <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <polyline
                      points="0,4 14,4 28,7 42,7 57,11 71,18 85,22 100,26"
                      fill="none"
                      stroke="#d64541"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
                <div className="row">
                  <span className="who2">
                    <i style={{ '--a': '#2A78F6' } as CSSProperties}>L</i>
                    <b>Litware</b>
                  </span>
                  <span className="pill mid">Medium</span>
                  <span>Support tickets up</span>
                  <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <polyline
                      points="0,12 14,8 28,12 42,8 57,12 71,12 85,16 100,16"
                      fill="none"
                      stroke="#b7790d"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
                <div className="row">
                  <span className="who2">
                    <i style={{ '--a': '#11175B' } as CSSProperties}>W</i>
                    <b>Wingtip</b>
                  </span>
                  <span className="pill low">Low</span>
                  <span>Weekly logins steady</span>
                  <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <polyline
                      points="0,24 14,21 28,21 42,17 57,17 71,13 85,13 100,9"
                      fill="none"
                      stroke="#10a39d"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              </div>
            </article>
            <article className="bcard">
              <div className="bcard-copy">
                <p className="btag" style={{ '--c': '#d64541' } as CSSProperties}>
                  Ticket SLAs
                </p>
                <h3>Never miss a first response.</h3>
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
                <div className="sla">
                  <span
                    className="ring"
                    style={{ '--c': '#10a39d', '--p': '100' } as CSSProperties}
                  ></span>
                  <div>
                    <b>Invite email delayed</b>
                    <small>Normal · met</small>
                  </div>
                </div>
              </div>
            </article>
            <article className="bcard">
              <div className="bcard-copy">
                <p className="btag" style={{ '--c': '#2A78F6' } as CSSProperties}>
                  Sentiment
                </p>
                <h3>Know which conversations need a reply first.</h3>
              </div>
              <div className="tone">
                <div className="tone-row">
                  <b>Contoso · billing thread</b>
                  <span className="pill high">Negative</span>
                </div>
                <div className="tone-row">
                  <b>Adatum · onboarding</b>
                  <span className="pill mid">Mixed</span>
                </div>
                <div className="tone-row">
                  <b>Fabrikam · renewal call</b>
                  <span className="pill low">Positive</span>
                </div>
              </div>
            </article>
            <article className="bcard span2">
              <div className="bcard-copy">
                <p className="btag" style={{ '--c': '#12A6A1' } as CSSProperties}>
                  Case workflows
                </p>
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
            </article>
            <article className="bcard span3 insights-card">
              <div className="bcard-copy">
                <p className="btag" style={{ '--c': '#7655F6' } as CSSProperties}>
                  Insights hub
                </p>
                <h3>A short list of what to do next, read from everything above.</h3>
              </div>
              <div className="insights">
                <div className="kpis">
                  <div className="kpi">
                    <b>3</b>
                    <small>Accounts showing churn signals</small>
                  </div>
                  <div className="kpi">
                    <b>Proposal</b>
                    <small>Stage where deals stall most</small>
                  </div>
                  <div className="kpi">
                    <b>Billing</b>
                    <small>Top case topic this week</small>
                  </div>
                </div>
                <div className="chart">
                  <p className="label">Days deals spend in each stage</p>
                  <div className="bars">
                    <div>
                      <i style={{ height: '30%' } as CSSProperties}></i>
                      <span>New</span>
                    </div>
                    <div>
                      <i style={{ height: '44%' } as CSSProperties}></i>
                      <span>Qualified</span>
                    </div>
                    <div>
                      <i className="hi" style={{ height: '90%' } as CSSProperties}></i>
                      <span>Proposal</span>
                    </div>
                    <div>
                      <i style={{ height: '52%' } as CSSProperties}></i>
                      <span>Negotiation</span>
                    </div>
                    <div>
                      <i style={{ height: '20%' } as CSSProperties}></i>
                      <span>Won</span>
                    </div>
                  </div>
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
