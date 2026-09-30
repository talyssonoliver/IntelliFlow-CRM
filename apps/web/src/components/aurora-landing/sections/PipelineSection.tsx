import type { CSSProperties } from 'react';

/** The deal board scene. */
export function PipelineSection() {
  return (
    <>
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
    </>
  );
}
