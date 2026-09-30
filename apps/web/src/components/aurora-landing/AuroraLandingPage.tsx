import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Manrope } from 'next/font/google';
import { AuroraBackground } from './AuroraBackground';
import { AuroraMotion } from './AuroraMotion';
import './aurora-landing.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

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

const FAQ = [
  {
    question: 'Will the AI ever act without my approval?',
    answer:
      'No. Every action an agent proposes goes to the approval queue first, with its reasoning and sources attached. You approve, edit or dismiss it.',
  },
  {
    question: 'How is this different from the AI in my current CRM?',
    answer:
      'Aurora was built around its agents from the start, and around a person approving what they do. The agents prepare the work across leads, deals and cases; the approval queue keeps your team in charge of every step.',
  },
  {
    question: 'What does it connect to?',
    answer:
      'Gmail, Outlook, Slack, Microsoft Teams, Stripe, PayPal and Google or Azure sign-in today, plus webhooks, React hooks and a CLI. The TypeScript SDK is in beta.',
  },
  {
    question: 'Where is my data kept separate?',
    answer:
      'Each workspace is isolated in the database with row-level security, and every change is written to an audit log.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Plans are built around your team and the parts of Aurora you use. Ask for a tailored plan and we will walk you through it.',
  },
];

/**
 * The Aurora landing page (preview). Server-rendered markup; AuroraMotion wires the
 * stack walkthrough and the product scenes onto it once it is on the client.
 * Every product panel shows a labelled sample workspace, never customer data.
 */
export function AuroraLandingPage() {
  return (
    <div id="aurora-page" className={`aurora-page boot ${manrope.variable}`}>
      <a className="skip" href="#aurora-main">
        Skip to content
      </a>
      <header className="nav" id="nav">
        <div className="wrap nav-row">
          <a className="brand" href="#aurora-main" aria-label="Aurora home">
            <img src="/brand/aurora/aurora-wave.webp" alt="" className="brand-mark" />
            <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="brand-word" />
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#platform">Platform</a>
            <a href="#agents">AI agents</a>
            <a href="#security">Security</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="nav-cta">
            <Link href="/login" className="link">
              Log in
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Get started
            </Link>
          </div>
          <details className="nav-menu">
            <summary aria-label="Menu">
              <span className="material-symbols-outlined">menu</span>
            </summary>
            <nav aria-label="Mobile">
              <a href="#platform">Platform</a>
              <a href="#agents">AI agents</a>
              <a href="#security">Security</a>
              <a href="#pricing">Pricing</a>
              <Link href="/login">Log in</Link>
            </nav>
          </details>
        </div>
      </header>

      <main id="aurora-main" tabIndex={-1}>
        <section className="stage">
          <div className="hero-bg">
            <AuroraBackground />
          </div>
          <div className="wrap stage-grid">
            <div className="stage-copy">
              <div className="hero">
                <p className="eyebrow">
                  <span className="pulse"></span>The AI-native CRM
                </p>
                <h1>The CRM that works your pipeline for you.</h1>
                <p className="lede">
                  Aurora&apos;s AI agents score every lead, draft every follow-up and flag every
                  deal going quiet. Then they wait for your yes. Your team spends the day selling,
                  not updating records.
                </p>
                <div className="cta-row">
                  <Link href="/signup" className="btn btn-primary">
                    Get started
                  </Link>
                  <Link href="/contact" className="btn btn-secondary">
                    Book a demo
                  </Link>
                </div>
                <ul className="hero-trust">
                  <li>
                    <span className="material-symbols-outlined">task_alt</span>Human approval on
                    every AI action
                  </li>
                  <li>
                    <span className="material-symbols-outlined">lock</span>Isolated workspace data
                  </li>
                </ul>
              </div>

              <div className="walk" id="platform">
                <p className="eyebrow">How Aurora is built</p>
                <h2>Five layers. One system. You on top.</h2>
                <p className="section-lede">
                  Scroll through the stack. The agents do the heavy lifting, and nothing they
                  prepare goes out without a person&apos;s approval.
                </p>
              </div>
              <article className="layer-step" data-layer="agents">
                <p className="layer-tag" style={{ '--c': '#7655F6' } as CSSProperties}>
                  <span></span>01 · AI agents
                </p>
                <h3>Ten agents working every record, all day.</h3>
                <p>
                  They score leads and accounts, spot churn risk, read the tone of every
                  conversation, summarise cases and draft the next email. Your team starts each
                  morning with the work already prepared.
                </p>
                <ul className="chips">
                  <li>
                    <span className="material-symbols-outlined">insights</span>Lead scoring
                  </li>
                  <li>
                    <span className="material-symbols-outlined">trending_down</span>Churn risk
                  </li>
                  <li>
                    <span className="material-symbols-outlined">edit_note</span>Email drafting
                  </li>
                  <li>
                    <span className="material-symbols-outlined">mood</span>Sentiment
                  </li>
                </ul>
              </article>
              <article className="layer-step" data-layer="control">
                <p className="layer-tag" style={{ '--c': '#12A6A1' } as CSSProperties}>
                  <span style={{ '--c': '#28D9D4' } as CSSProperties}></span>02 · Human approval
                </p>
                <h3>Nothing goes out until you say yes.</h3>
                <p>
                  Every action an agent proposes lands in one approval queue, with its reasoning and
                  sources attached. Approve it, edit it or dismiss it. The AI never acts on its own.
                </p>
                <ul className="chips">
                  <li>
                    <span className="material-symbols-outlined">task_alt</span>Approve
                  </li>
                  <li>
                    <span className="material-symbols-outlined">edit</span>Edit
                  </li>
                  <li>
                    <span className="material-symbols-outlined">close</span>Dismiss
                  </li>
                </ul>
              </article>
              <article className="layer-step" data-layer="pipeline">
                <p className="layer-tag" style={{ '--c': '#2A78F6' } as CSSProperties}>
                  <span></span>03 · Pipeline
                </p>
                <h3>Every deal, and the next move for each.</h3>
                <p>
                  Leads, accounts and a deal board from first touch to signed contract, with the
                  deals that need you today pinned to the top.
                </p>
                <ul className="chips">
                  <li>
                    <span className="material-symbols-outlined">view_kanban</span>Deal board
                  </li>
                  <li>
                    <span className="material-symbols-outlined">person_search</span>Leads
                  </li>
                  <li>
                    <span className="material-symbols-outlined">apartment</span>Accounts
                  </li>
                </ul>
              </article>
              <article className="layer-step" data-layer="service">
                <p className="layer-tag" style={{ '--c': '#7E6BD9' } as CSSProperties}>
                  <span style={{ '--c': '#BCA8FF' } as CSSProperties}></span>04 · Service &amp;
                  insight
                </p>
                <h3>Customers looked after long after the sale.</h3>
                <p>
                  Cases and tickets run on service-level clocks, and the insights hub turns activity
                  across the business into a short list of what to do next.
                </p>
                <ul className="chips">
                  <li>
                    <span className="material-symbols-outlined">support_agent</span>Cases
                  </li>
                  <li>
                    <span className="material-symbols-outlined">timer</span>SLAs
                  </li>
                  <li>
                    <span className="material-symbols-outlined">monitoring</span>Insights hub
                  </li>
                </ul>
              </article>
              <article className="layer-step" data-layer="foundation">
                <p className="layer-tag" style={{ '--c': '#11175B' } as CSSProperties}>
                  <span></span>05 · Foundation
                </p>
                <h3>Enterprise-grade underneath.</h3>
                <p>
                  Each workspace is isolated in the database, sign-in is protected with multi-factor
                  authentication, and every change is written to an audit log.
                </p>
                <ul className="chips">
                  <li>
                    <span className="material-symbols-outlined">lock</span>Tenant isolation
                  </li>
                  <li>
                    <span className="material-symbols-outlined">verified_user</span>MFA
                  </li>
                  <li>
                    <span className="material-symbols-outlined">history</span>Audit log
                  </li>
                </ul>
              </article>
              <div className="stage-end"></div>
            </div>
            <div className="stage-object">
              <div className="object-sticky">
                <canvas id="stack" aria-hidden="true"></canvas>
                <p className="sr-only">
                  The Aurora platform as five stacked layers: AI agents, human approval, pipeline,
                  service and insight, and the foundation underneath.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="proof">
          <div className="wrap proof-row">
            <div className="stat">
              <b>10</b>
              <span>AI agents built in, from lead scoring to email drafting</span>
            </div>
            <div className="stat">
              <b>1</b>
              <span>approval queue where every AI action waits for a person</span>
            </div>
            <div className="stat">
              <b>13</b>
              <span>integrations ready today, from Gmail to Stripe</span>
            </div>
            <div className="stat">
              <b>212</b>
              <span>product screens, from first lead to closed case</span>
            </div>
          </div>
        </section>

        <section className="feature wide" id="agents">
          <div className="wrap feature-grid wide-grid">
            <div className="feature-copy reveal">
              <p className="eyebrow">Approval queue</p>
              <h2>See why before you say yes.</h2>
              <p className="section-lede">
                An agent spots a renewal at risk and drafts the follow-up. You see what it noticed
                and exactly where it looked. Then you decide.
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
                            <span className="material-symbols-outlined">event</span>Renewal date is
                            in 14 days<em>Contract</em>
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

        <section className="feature alt showcase">
          <div className="wrap">
            <div className="center reveal">
              <p className="eyebrow">Pipeline</p>
              <h2>Start every morning with the deals that need you.</h2>
              <p className="section-lede">
                Aurora flags the deals going quiet and suggests the next move for each. Review the
                draft, send it, and watch the deal move forward.
              </p>
            </div>
            <div
              className="scene stage-blue board-stage"
              id="board-scene"
              aria-label="Deal board in a sample workspace"
            >
              <div className="app tilt-soft">
                <div className="titlebar">
                  <span className="lights">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  <span className="url">
                    <span className="material-symbols-outlined">lock</span>app.aurora.io/pipeline
                  </span>
                </div>
                <aside className="rail" aria-hidden="true">
                  <img src="/brand/aurora/aurora-wave.webp" alt="" className="rail-logo" />
                  <span className="material-symbols-outlined">home</span>
                  <span className="material-symbols-outlined on">view_kanban</span>
                  <span className="material-symbols-outlined">task_alt</span>
                  <span className="material-symbols-outlined">support_agent</span>
                  <span className="material-symbols-outlined">monitoring</span>
                  <span className="rail-me">TO</span>
                </aside>
                <div className="app-main">
                  <header className="topbar">
                    <span className="crumb">
                      Pipeline <i>/</i> <b>This quarter</b>
                    </span>
                    <span className="filters">
                      <span className="fchip">
                        <span className="material-symbols-outlined">person</span>All owners
                      </span>
                      <span className="fchip on">
                        <span className="material-symbols-outlined">bolt</span>Needs you today · 2
                      </span>
                    </span>
                    <span className="seg">
                      <b>Board</b>
                      <span>List</span>
                      <span>Forecast</span>
                    </span>
                  </header>
                  <div className="board2" id="board">
                    <div className="col2" data-stage="new">
                      <h4>
                        <span className="sd" style={{ '--c': '#BCA8FF' } as CSSProperties}></span>
                        {'New'}
                        <em>£71.9k</em>
                      </h4>
                      <div className="deal">
                        <b>Northwind</b>
                        <small>£24,000</small>
                        <div className="prob">
                          <i style={{ width: '20%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#7655F6' } as CSSProperties}>
                          MC
                        </span>
                      </div>
                      <div className="deal">
                        <b>Fabrikam</b>
                        <small>£9,500</small>
                        <div className="prob">
                          <i style={{ width: '15%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#2A78F6' } as CSSProperties}>
                          JP
                        </span>
                      </div>
                      <div className="deal">
                        <b>Tailspin</b>
                        <small>£14,200</small>
                        <div className="prob">
                          <i style={{ width: '18%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#1BAFAA' } as CSSProperties}>
                          SK
                        </span>
                      </div>
                      <div className="deal">
                        <b>Coho Winery</b>
                        <small>£24,200</small>
                        <div className="prob">
                          <i style={{ width: '22%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#7655F6' } as CSSProperties}>
                          MC
                        </span>
                      </div>
                    </div>
                    <div className="col2" data-stage="qualified">
                      <h4>
                        <span className="sd" style={{ '--c': '#2A78F6' } as CSSProperties}></span>
                        {'Qualified'}
                        <em>£75.3k</em>
                      </h4>
                      <div className="deal urgent" id="mover">
                        <b>Contoso</b>
                        <small>£41,000</small>
                        <div className="prob">
                          <i style={{ width: '45%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#1BAFAA' } as CSSProperties}>
                          SK
                        </span>
                        <em className="tag cold">
                          <span className="material-symbols-outlined">schedule</span>No reply in 9
                          days
                        </em>
                      </div>
                      <div className="deal">
                        <b>Litware</b>
                        <small>£12,800</small>
                        <div className="prob">
                          <i style={{ width: '40%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#2A78F6' } as CSSProperties}>
                          JP
                        </span>
                      </div>
                      <div className="deal">
                        <b>Woodgrove</b>
                        <small>£21,500</small>
                        <div className="prob">
                          <i style={{ width: '38%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#7655F6' } as CSSProperties}>
                          MC
                        </span>
                      </div>
                    </div>
                    <div className="col2" data-stage="proposal">
                      <h4>
                        <span className="sd" style={{ '--c': '#7655F6' } as CSSProperties}></span>
                        {'Proposal'}
                        <em>£51.5k</em>
                      </h4>
                      <div className="deal">
                        <b>Adatum</b>
                        <small>£33,500</small>
                        <div className="prob">
                          <i style={{ width: '65%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#7655F6' } as CSSProperties}>
                          MC
                        </span>
                      </div>
                      <div className="deal">
                        <b>Proseware</b>
                        <small>£18,000</small>
                        <div className="prob">
                          <i style={{ width: '60%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#1BAFAA' } as CSSProperties}>
                          SK
                        </span>
                      </div>
                    </div>
                    <div className="col2" data-stage="negotiation">
                      <h4>
                        <span className="sd" style={{ '--c': '#11175B' } as CSSProperties}></span>
                        {'Negotiation'}
                        <em>£38.0k</em>
                      </h4>
                      <div className="deal">
                        <b>Blue Yonder</b>
                        <small>£38,000</small>
                        <div className="prob">
                          <i style={{ width: '80%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#2A78F6' } as CSSProperties}>
                          JP
                        </span>
                      </div>
                    </div>
                    <div className="col2" data-stage="won">
                      <h4>
                        <span className="sd" style={{ '--c': '#28D9D4' } as CSSProperties}></span>
                        {'Won'}
                        <em>£46.5k</em>
                      </h4>
                      <div className="deal won">
                        <b>Wingtip</b>
                        <small>£27,000</small>
                        <div className="prob">
                          <i style={{ width: '100%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#2A78F6' } as CSSProperties}>
                          JP
                        </span>
                      </div>
                      <div className="deal won">
                        <b>Lucerne</b>
                        <small>£19,500</small>
                        <div className="prob">
                          <i style={{ width: '100%' } as CSSProperties}></i>
                        </div>
                        <span className="who" style={{ '--a': '#1BAFAA' } as CSSProperties}>
                          SK
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="float f-nba" id="nba">
                <span className="agent-badge">
                  <span className="material-symbols-outlined">auto_awesome</span>Next best action
                </span>
                <b>Send Contoso a pricing recap</b>
                <small>They opened the proposal twice this week and haven&apos;t replied.</small>
                <span className="nba-actions">
                  <span className="mini primary">Review draft</span>
                  <span className="mini">Later</span>
                </span>
              </div>
              <span className="sample">Sample workspace</span>
            </div>
          </div>
        </section>

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
                    <span className="material-symbols-outlined">auto_awesome</span>Priority
                    predicted
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

        <section className="security dark" id="security">
          <div className="wrap feature-grid">
            <div className="feature-copy reveal">
              <p className="eyebrow on-dark">Security and governance</p>
              <h2>Built for teams that answer to someone.</h2>
              <p className="section-lede">
                Control, isolation and a record of every change: the basics your security review
                asks for, built in from day one. Our compliance roadmap is yours on request.
              </p>
              <Link href="/contact" className="btn btn-onDark">
                Request the compliance roadmap
              </Link>
            </div>
            <div className="controls reveal">
              <div className="control">
                <span className="material-symbols-outlined">task_alt</span>
                <b>Human approval</b>
                <p>No AI action runs until a person approves it.</p>
              </div>
              <div className="control">
                <span className="material-symbols-outlined">database</span>
                <b>Tenant isolation</b>
                <p>Row-level security keeps every workspace&apos;s data apart.</p>
              </div>
              <div className="control">
                <span className="material-symbols-outlined">verified_user</span>
                <b>Multi-factor sign-in</b>
                <p>MFA protects every account.</p>
              </div>
              <div className="control">
                <span className="material-symbols-outlined">history</span>
                <b>Audit log</b>
                <p>Who changed what, and when, for every record.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="pricing" id="pricing">
          <div className="wrap">
            <div className="price-card reveal">
              <div>
                <p className="eyebrow">Pricing</p>
                <h2>A plan built around how your team sells.</h2>
                <p className="section-lede">
                  Tell us your team size and the parts of Aurora you need. We will put together a
                  plan and walk you through it.
                </p>
                <div className="cta-row">
                  <Link href="/contact" className="btn btn-primary">
                    Get a tailored plan
                  </Link>
                  <Link href="/contact" className="btn btn-secondary">
                    Book a demo
                  </Link>
                </div>
              </div>
              <ul className="includes">
                <li>
                  <span className="material-symbols-outlined">check</span>All ten AI agents
                </li>
                <li>
                  <span className="material-symbols-outlined">check</span>Approval queue and audit
                  log
                </li>
                <li>
                  <span className="material-symbols-outlined">check</span>Pipeline, leads and
                  accounts
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

        <section className="faq">
          <div className="wrap narrow reveal">
            <h2>Questions buyers ask.</h2>
            {FAQ.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  {question}
                  <span className="material-symbols-outlined">expand_more</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="final">
          <img
            src="/brand/aurora/bg/ribbon-left.webp"
            className="final-ribbon left"
            alt=""
            aria-hidden="true"
          />
          <img
            src="/brand/aurora/bg/ribbon-right.webp"
            className="final-ribbon right"
            alt=""
            aria-hidden="true"
          />
          <div className="wrap final-inner reveal">
            <h2>Give your team back the hours they lose to busywork.</h2>
            <p>Aurora prepares the work. Your people make the calls.</p>
            <div className="cta-row center-row">
              <Link href="/signup" className="btn btn-primary">
                Get started
              </Link>
              <Link href="/contact" className="btn btn-onDark">
                Book a demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap foot-row">
          <div>
            <img src="/brand/aurora/aurora-wordmark.webp" alt="Aurora" className="foot-word" />
            <p>The AI CRM that asks before it acts.</p>
          </div>
          <div className="foot-cols">
            <div>
              <b>Product</b>
              <a href="#platform">Platform</a>
              <a href="#agents">AI agents</a>
              <a href="#pricing">Pricing</a>
            </div>
            <div>
              <b>Trust</b>
              <a href="#security">Security</a>
              <Link href="/privacy">Privacy</Link>
            </div>
            <div>
              <b>Company</b>
              <Link href="/about">About</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </div>
        <div className="wrap foot-legal">© {new Date().getFullYear()} Aurora</div>
      </footer>
      <AuroraMotion />
    </div>
  );
}
