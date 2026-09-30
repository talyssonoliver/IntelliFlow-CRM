import type { CSSProperties } from 'react';
import './approval-section.css';

const bridgeStyle = { '--bridge-accent': 'var(--blue)' } as CSSProperties;

/**
 * The approval queue scene: why before yes. Mirrors the real
 * `/agent-approvals/ai-review` screen — stat row by status, a filter bar, a
 * queue of review cards (left border colour keyed to state, an output-type
 * badge for each of the 6 reviewable AI output types, a confidence
 * indicator, an SLA countdown) and one claimed card expanded with its full
 * reasoning, draft and claim/approve/reject/escalate actions.
 */
export function ApprovalSection() {
  return (
    <section
      className="feature wide approval-section"
      id="agents"
      data-bridge-section
      style={bridgeStyle}
    >
      <div className="wrap feature-grid wide-grid">
        <div className="feature-copy reveal" data-reveal>
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
              <b>3</b>Your call: claim it, then approve, reject or escalate
            </li>
          </ol>
        </div>

        <div
          className="scene stage-violet approval-scene"
          id="approval-scene"
          data-scene="approval"
          aria-label="AI review queue in a sample workspace"
        >
          <div className="app tilt approval-app" data-reveal>
            <div className="titlebar">
              <span className="lights">
                <i></i>
                <i></i>
                <i></i>
              </span>
              <span className="url">
                <span className="material-symbols-outlined">lock</span>
                {'app.aurora.io/agent-approvals/ai-review'}
              </span>
            </div>
            <aside className="rail" aria-hidden="true">
              <img src="/brand/aurora/aurora-wave.webp" alt="" className="rail-logo" />
              <span className="material-symbols-outlined">home</span>
              <span className="material-symbols-outlined">view_kanban</span>
              <span className="material-symbols-outlined on">task_alt</span>
              <span className="material-symbols-outlined">support_agent</span>
              <span className="material-symbols-outlined">monitoring</span>
              <span className="rail-me">
                <img src="/brand/aurora/people/you.webp" alt="" width={160} height={160} />
              </span>
            </aside>
            <div className="app-main">
              <header className="topbar">
                <span className="crumb">
                  Agent approvals <i>/</i> <b>AI review queue</b>
                  <em className="count">6</em>
                </span>
                <span className="search">
                  <span className="material-symbols-outlined">search</span>Search<kbd>⌘K</kbd>
                </span>
              </header>

              <ul className="review-stats" aria-label="Review queue by status">
                <li className="stat-chip stat-chip--waiting">
                  <b>3</b>
                  <span>Waiting</span>
                </li>
                <li className="stat-chip stat-chip--review">
                  <b>2</b>
                  <span>In review</span>
                </li>
                <li className="stat-chip stat-chip--breach">
                  <b>1</b>
                  <span>SLA breached</span>
                </li>
                <li className="stat-chip stat-chip--done">
                  <b>12</b>
                  <span>Approved today</span>
                </li>
              </ul>

              <div className="filters review-filters">
                <span className="fchip on">
                  <span className="material-symbols-outlined">bolt</span>Waiting for you
                </span>
                <span className="fchip">
                  <span className="material-symbols-outlined">category</span>All output types
                </span>
                <span className="fchip">
                  <span className="material-symbols-outlined">swap_vert</span>SLA deadline
                </span>
              </div>

              <div className="ap-grid review-body">
                <ul className="queue review-queue" id="review-queue">
                  <li className="q active" id="q1" data-state="review">
                    <span className="type-badge type-badge--email" aria-hidden="true">
                      <span className="material-symbols-outlined">draft</span>
                    </span>
                    <div>
                      <b>Follow up with Maya Chen</b>
                      <small>Email draft · Northwind</small>
                    </div>
                    <span className="state review" id="review-q1-state">
                      In review
                    </span>
                  </li>
                  <li className="q" data-state="neutral">
                    <span className="type-badge type-badge--lead" aria-hidden="true">
                      <span className="material-symbols-outlined">trending_up</span>
                    </span>
                    <div>
                      <b>Re-score 12 new leads</b>
                      <small>Lead scoring · Batch</small>
                    </div>
                    <button className="mini claim-btn" type="button" tabIndex={-1}>
                      Claim
                    </button>
                  </li>
                  <li className="q" data-state="breach">
                    <span className="type-badge type-badge--churn" aria-hidden="true">
                      <span className="material-symbols-outlined">trending_down</span>
                    </span>
                    <div>
                      <b>Flag Contoso as at risk</b>
                      <small>Churn risk · Contoso</small>
                    </div>
                    <span className="sla-chip sla-chip--red">
                      <span className="material-symbols-outlined">schedule</span>Breached
                    </span>
                  </li>
                  <li className="q" data-state="done">
                    <span className="type-badge type-badge--sentiment" aria-hidden="true">
                      <span className="material-symbols-outlined">sentiment_satisfied</span>
                    </span>
                    <div>
                      <b>Weekly tone summary</b>
                      <small>Sentiment · Adatum</small>
                    </div>
                    <span className="state done">Approved</span>
                  </li>
                  <li className="q" data-state="done">
                    <span className="type-badge type-badge--auto" aria-hidden="true">
                      <span className="material-symbols-outlined">bolt</span>
                    </span>
                    <div>
                      <b>Auto-reply to Tailspin</b>
                      <small>Auto-response · Tailspin</small>
                    </div>
                    <span className="state done">Approved</span>
                  </li>
                  <li className="q" data-state="done">
                    <span className="type-badge type-badge--nba" aria-hidden="true">
                      <span className="material-symbols-outlined">route</span>
                    </span>
                    <div>
                      <b>Next step for Litware</b>
                      <small>Next best action · Litware</small>
                    </div>
                    <span className="state edited">Edited</span>
                  </li>
                </ul>
                <div className="detail review-detail" id="review-detail">
                  <div className="d-head review-detail__head">
                    <span className="type-badge type-badge--email">
                      <span className="material-symbols-outlined">draft</span>Email draft
                    </span>
                    <span className="review-sla" id="review-sla">
                      <span className="material-symbols-outlined">schedule</span>SLA in 4h 12m
                    </span>
                  </div>
                  <p className="d-title review-title">
                    <i className="marker">1</i>Follow up with Maya Chen at Northwind before the
                    renewal.
                  </p>
                  <div className="conf review-confidence">
                    <span className="conf-bar">
                      <i></i>
                    </span>
                    <span>
                      High confidence <b>92%</b>
                    </span>
                  </div>
                  <div className="d-why review-why">
                    <i className="marker">2</i>
                    <p className="label">What it noticed</p>
                    <ul>
                      <li className="why" id="why-renewal">
                        <span className="material-symbols-outlined">event</span>Renewal date is in
                        14 days<em>Contract</em>
                      </li>
                      <li className="why">
                        <span className="material-symbols-outlined">mark_email_unread</span>No reply
                        to the last two emails<em>Inbox</em>
                      </li>
                      <li className="why">
                        <span className="material-symbols-outlined">trending_down</span>Account
                        score dropped this week<em>Scoring</em>
                      </li>
                    </ul>
                  </div>
                  <div className="d-draft review-draft">
                    <p className="label">Draft</p>
                    <p>
                      <span id="review-draft-text">
                        Hi Maya, ahead of your renewal on the 14th I wanted to check the new
                        reporting is working for your team.
                      </span>
                      <span className="caret" id="review-caret"></span>
                    </p>
                  </div>
                  <div className="d-actions review-actions">
                    <i className="marker">3</i>
                    <button
                      className="btn btn-primary btn-sm"
                      id="review-approve-btn"
                      type="button"
                      tabIndex={-1}
                    >
                      <span className="material-symbols-outlined">check</span>Approve
                    </button>
                    <button className="btn btn-secondary btn-sm" type="button" tabIndex={-1}>
                      Reject
                    </button>
                    <button className="btn btn-ghost btn-sm" type="button" tabIndex={-1}>
                      Escalate
                    </button>
                    <span className="hint">Claimed by you</span>
                  </div>
                  <div className="review-notes">
                    <span className="review-note">
                      <span className="material-symbols-outlined">edit_note</span>Reject note
                    </span>
                    <span className="review-note">
                      <span className="material-symbols-outlined">priority_high</span>Escalate
                      reason
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="float f-source review-source" id="review-source">
            <p className="label">Source</p>
            <b>Northwind contract</b>
            <span>Renews 14 Oct · auto-renew off</span>
          </div>
          <div className="float f-toast review-toast" id="review-toast">
            <span className="material-symbols-outlined">check_circle</span>
            <div>
              <b>Approved by you</b>
              <small>Email sent to Maya Chen · 09:14</small>
            </div>
          </div>
          <svg className="cursor" id="review-cursor" viewBox="0 0 24 24" aria-hidden="true">
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
  );
}
