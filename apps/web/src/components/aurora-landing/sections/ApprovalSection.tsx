import type { CSSProperties } from 'react';

/** The approval queue scene: why before yes. */
export function ApprovalSection() {
  return (
    <>
      <section className="feature wide" id="agents">
        <div className="wrap feature-grid wide-grid">
          <div className="feature-copy reveal">
            <p className="eyebrow">Approval queue</p>
            <h2>See why before you say yes.</h2>
            <p className="section-lede">
              An agent spots a renewal at risk and drafts the follow-up. You see what it noticed and
              exactly where it looked. Then you decide.
            </p>
            <ol className="callouts">
              <li>
                <b>1</b>The suggestion, in plain words
              </li>
              <li>
                <b>2</b>What it noticed, with sources you can check
              </li>
              <li>
                <b>3</b>Your call: approve, edit or dismiss
              </li>
            </ol>
          </div>
          <div
            className="scene stage-violet"
            id="approval-scene"
            aria-label="Approval queue in a sample workspace"
          >
            <div className="app tilt">
              <div className="titlebar">
                <span className="lights">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <span className="url">
                  <span className="material-symbols-outlined">lock</span>app.aurora.io/approvals
                </span>
              </div>
              <aside className="rail" aria-hidden="true">
                <img src="/brand/aurora/aurora-wave.webp" alt="" className="rail-logo" />
                <span className="material-symbols-outlined">home</span>
                <span className="material-symbols-outlined">view_kanban</span>
                <span className="material-symbols-outlined on">task_alt</span>
                <span className="material-symbols-outlined">support_agent</span>
                <span className="material-symbols-outlined">monitoring</span>
                <span className="rail-me">TO</span>
              </aside>
              <div className="app-main">
                <header className="topbar">
                  <span className="crumb">
                    Approvals <i>/</i> <b>Waiting for you</b>
                    <em className="count">3</em>
                  </span>
                  <span className="search">
                    <span className="material-symbols-outlined">search</span>Search<kbd>⌘K</kbd>
                  </span>
                  <span className="avatars">
                    <i style={{ '--a': '#7655F6' } as CSSProperties}>MC</i>
                    <i style={{ '--a': '#2A78F6' } as CSSProperties}>JP</i>
                    <i style={{ '--a': '#1BAFAA' } as CSSProperties}>SK</i>
                  </span>
                </header>
                <div className="ap-grid">
                  <ul className="queue">
                    <li className="q active urgent" id="q1">
                      <span className="qdot" style={{ '--c': '#7655F6' } as CSSProperties}></span>
                      <div>
                        <b>Follow up with Maya Chen</b>
                        <small>Follow-up agent · 2m</small>
                      </div>
                      <span className="state pending" id="q1-state">
                        Pending
                      </span>
                    </li>
                    <li className="q">
                      <span className="qdot" style={{ '--c': '#2A78F6' } as CSSProperties}></span>
                      <div>
                        <b>Re-score 12 new leads</b>
                        <small>Lead scoring · 8m</small>
                      </div>
                      <span className="state pending">Pending</span>
                    </li>
                    <li className="q">
                      <span className="qdot" style={{ '--c': '#7655F6' } as CSSProperties}></span>
                      <div>
                        <b>Draft reply to Adatum</b>
                        <small>Email writer · 12m</small>
                      </div>
                      <span className="state pending">Pending</span>
                    </li>
                    <li className="q">
                      <span className="qdot" style={{ '--c': '#28D9D4' } as CSSProperties}></span>
                      <div>
                        <b>Summarise case 4821</b>
                        <small>Case summary · 21m</small>
                      </div>
                      <span className="state done">Approved</span>
                    </li>
                    <li className="q">
                      <span className="qdot" style={{ '--c': '#BCA8FF' } as CSSProperties}></span>
                      <div>
                        <b>Flag Contoso as at risk</b>
                        <small>Churn risk · 1h</small>
                      </div>
                      <span className="state done">Approved</span>
                    </li>
                    <li className="q">
                      <span className="qdot" style={{ '--c': '#2A78F6' } as CSSProperties}></span>
                      <div>
                        <b>Qualify Tailspin lead</b>
                        <small>Qualification · 2h</small>
                      </div>
                      <span className="state done">Approved</span>
                    </li>
                    <li className="q">
                      <span className="qdot" style={{ '--c': '#7655F6' } as CSSProperties}></span>
                      <div>
                        <b>Next step for Litware</b>
                        <small>Next best action · 3h</small>
                      </div>
                      <span className="state edited">Edited</span>
                    </li>
                  </ul>
                  <div className="detail">
                    <div className="d-head">
                      <span className="agent-badge">
                        <span className="material-symbols-outlined">auto_awesome</span>Follow-up
                        agent
                      </span>
                      <span className="conf">
                        <span className="conf-bar">
                          <i></i>
                        </span>
                        <span>High confidence</span>
                      </span>
                    </div>
                    <p className="d-title">
                      <i className="marker">1</i>Follow up with Maya Chen at Northwind before the
                      renewal.
                    </p>
                    <div className="d-why">
                      <i className="marker">2</i>
                      <p className="label">What it noticed</p>
                      <ul>
                        <li className="why" id="why-renewal">
                          <span className="material-symbols-outlined">event</span>Renewal date is in
                          14 days<em>Contract</em>
                        </li>
                        <li className="why">
                          <span className="material-symbols-outlined">mark_email_unread</span>No
                          reply to the last two emails<em>Inbox</em>
                        </li>
                        <li className="why">
                          <span className="material-symbols-outlined">trending_down</span>Account
                          score dropped this week<em>Scoring</em>
                        </li>
                      </ul>
                    </div>
                    <div className="d-draft">
                      <p className="label">Draft</p>
                      <p>
                        <span id="typed">
                          Hi Maya, ahead of your renewal on the 14th I wanted to check the new
                          reporting is working for your team.
                        </span>
                        <span className="caret"></span>
                      </p>
                    </div>
                    <div className="d-actions">
                      <i className="marker">3</i>
                      <button className="btn btn-primary btn-sm" id="approve-btn" tabIndex={-1}>
                        <span className="material-symbols-outlined">check</span>Approve
                      </button>
                      <button className="btn btn-secondary btn-sm" tabIndex={-1}>
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-sm" tabIndex={-1}>
                        Dismiss
                      </button>
                      <span className="hint">You decide</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="float f-source" id="fsource">
              <p className="label">Source</p>
              <b>Northwind contract</b>
              <span>Renews 14 Oct · auto-renew off</span>
            </div>
            <div className="float f-toast" id="toast">
              <span className="material-symbols-outlined">check_circle</span>
              <div>
                <b>Approved by you</b>
                <small>Email sent to Maya Chen · 09:14</small>
              </div>
            </div>
            <svg className="cursor" id="cursor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 2l15 9-6.5 1.6L9.8 19z"
                fill="#11175B"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span className="sample">Sample workspace</span>
          </div>
        </div>
      </section>
    </>
  );
}
