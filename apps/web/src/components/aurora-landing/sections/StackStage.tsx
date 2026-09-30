import { AuroraBackground } from '../AuroraBackground';
import type { CSSProperties } from 'react';
import Link from 'next/link';

/** Hero and the five-layer stack walkthrough, over the pinned live waves. */
export function StackStage() {
  return (
    <>
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

            <div className="walk" id="platform">
              <p className="eyebrow">How Aurora is built</p>
              <h2>Five layers. One system. You on top.</h2>
              <p className="section-lede">
                Scroll through the stack. The agents do the heavy lifting, and nothing they prepare
                goes out without a person&apos;s approval.
              </p>
            </div>
            <article className="layer-step" data-layer="agents">
              <p className="layer-tag" style={{ '--c': '#7655F6' } as CSSProperties}>
                <span></span>01 · AI agents
              </p>
              <h3>Ten agents working every record, all day.</h3>
              <p>
                They score leads and accounts, spot churn risk, read the tone of every conversation,
                summarise cases and draft the next email. Your team starts each morning with the
                work already prepared.
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
                Leads, accounts and a deal board from first touch to signed contract, with the deals
                that need you today pinned to the top.
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
    </>
  );
}
