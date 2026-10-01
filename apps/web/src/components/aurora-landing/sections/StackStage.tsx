import { AuroraBackground } from '../AuroraBackground';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import './stack-stage.css';

const bridgeStyle = { '--bridge-accent': 'var(--blue)' } as CSSProperties;

/**
 * Hero and the five-layer stack walkthrough, over the pinned live waves.
 *
 * `.hero`, `.stage-copy` (the walk + five `.layer-step`s) and `.stage-object` (the
 * isometric stack canvas) are three siblings inside `.stage-grid`, not one blob: on
 * desktop the stack spans both rows beside the copy (unchanged from before); on
 * mobile the hero gets its own full screen first, then `.stage-copy` and
 * `.stage-object` share a second grid cell so the sticky canvas can stay pinned
 * behind the whole walk while the copy scrolls through it — see stack-stage.css.
 */
export function StackStage() {
  return (
    <>
      <section className="stage" data-bridge-section style={bridgeStyle}>
        <div className="hero-bg wave-pin">
          <AuroraBackground />
        </div>
        <div className="wrap stage-grid stage-grid-v2">
          <div className="hero">
            <p className="eyebrow">
              <span className="pulse"></span>The AI-native CRM
            </p>
            <h1>The CRM that works your pipeline for you.</h1>
            <p className="lede">
              Aurora&apos;s AI agents score every lead, draft every follow-up and flag every deal
              going quiet. Then they wait for your yes. Your team spends the day selling, not
              updating records.
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
                <span className="material-symbols-outlined">task_alt</span>Human approval on every
                AI action
              </li>
              <li>
                <span className="material-symbols-outlined">lock</span>Isolated workspace data
              </li>
            </ul>
          </div>

          <div className="stage-copy">
            <div className="walk walk-card" id="platform">
              <div className="layer-step-inner">
                <p className="eyebrow">How Aurora is built</p>
                <h2>Five layers. One system. You on top.</h2>
                <p className="section-lede">
                  Scroll through the stack. The agents do the heavy lifting, and nothing they
                  prepare goes out without a person&apos;s approval.
                </p>
              </div>
            </div>
            <article className="layer-step layer-card" data-layer="agents">
              <div className="layer-step-inner">
                <p className="layer-tag" style={{ '--c': '#7655F6' } as CSSProperties}>
                  <span></span>01 · AI agents
                </p>
                <h3>15 agent types, working every record.</h3>
                <p>
                  They score leads and accounts, read the tone of every conversation, spot churn
                  risk and draft the next email. Your team starts each morning with the work already
                  prepared.
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
                  <li>
                    <span className="material-symbols-outlined">insights</span>Insights
                  </li>
                  <li>
                    <span className="material-symbols-outlined">tune</span>Customise your agents
                  </li>
                  <li>
                    <span className="material-symbols-outlined">build</span>Tools
                  </li>
                </ul>
              </div>
            </article>
            <article className="layer-step layer-card" data-layer="control">
              <div className="layer-step-inner">
                <p className="layer-tag" style={{ '--c': '#12A6A1' } as CSSProperties}>
                  <span style={{ '--c': '#28D9D4' } as CSSProperties}></span>02 · Human approval
                </p>
                <h3>Nothing goes out until you say yes.</h3>
                <p>
                  Every one of the six kinds of AI work: lead scores, sentiment reads,
                  auto-responses, churn flags, email drafts and next-best actions, lands in one
                  approval queue, with its reasoning attached. Approve it, edit it or dismiss it.
                  The AI never acts on its own.
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
              </div>
            </article>
            <article className="layer-step layer-card" data-layer="pipeline">
              <div className="layer-step-inner">
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
              </div>
            </article>
            <article className="layer-step layer-card" data-layer="service">
              <div className="layer-step-inner">
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
              </div>
            </article>
            <article className="layer-step layer-card" data-layer="foundation">
              <div className="layer-step-inner">
                <p className="layer-tag" style={{ '--c': '#11175B' } as CSSProperties}>
                  <span></span>05 · Enterprise-grade
                </p>
                <h3>Enterprise-grade tools, priced and built for growing businesses.</h3>
                <p>
                  The protections large companies pay extra for, in every workspace from day one.
                  Each workspace&apos;s data is kept apart, multi-factor sign-in is available on
                  every account, and every change is written to an audit log.
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
              </div>
            </article>
            <div className="stage-end"></div>
          </div>
          <div className="stage-object stack-visual">
            <div className="object-sticky stack-inner">
              <canvas id="stack" aria-hidden="true"></canvas>
              <p className="sr-only">
                The Aurora platform as five stacked layers: AI agents, human approval, pipeline,
                service and insight, and enterprise-grade protection underneath.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
