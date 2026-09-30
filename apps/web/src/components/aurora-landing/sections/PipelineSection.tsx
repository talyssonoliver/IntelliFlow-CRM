import type { CSSProperties } from 'react';
import './pipeline-section.css';

const bridgeStyle = { '--bridge-accent': 'var(--lavender)' } as CSSProperties;

type Stage = {
  id: string;
  label: string;
  color: string;
  total: string;
  more?: string;
};

const STAGES: Stage[] = [
  { id: 'new', label: 'New', color: '#BCA8FF', total: '£71.9k', more: '+3 more' },
  { id: 'contacted', label: 'Contacted', color: '#28D9D4', total: '£28.4k', more: '+2 more' },
  { id: 'qualified', label: 'Qualified', color: '#2A78F6', total: '£75.3k', more: '+2 more' },
  { id: 'proposal', label: 'Proposal', color: '#7655F6', total: '£51.5k', more: '+1 more' },
  { id: 'negotiation', label: 'Negotiation', color: '#11175B', total: '£38.0k' },
  { id: 'won', label: 'Won', color: '#0A726D', total: '£46.5k', more: '+1 more' },
  { id: 'lost', label: 'Lost', color: '#C43B3B', total: '£12.8k' },
];

/**
 * The pipeline scene: the deal board, moving. Mirrors the real
 * `/deals?view=pipeline` screen — seven stage columns, deal cards with
 * account, deal name, contact, value, close date and a probability bar, a
 * drag handle, plus a nod to lead scoring (hot/warm/cold tiers with factor
 * bars) and to the `/deals/forecast` view one tab away.
 */
export function PipelineSection() {
  return (
    <section
      className="feature alt showcase pipeline-section"
      data-bridge-section
      style={bridgeStyle}
    >
      <div className="wrap">
        <div className="center reveal" data-reveal>
          <p className="eyebrow">Pipeline</p>
          <h2>Start every morning with the deals that need you.</h2>
          <p className="section-lede">
            Aurora flags the deals going quiet and suggests the next move for each. Review the
            draft, send it, and watch the deal move stage. The board, the list and the forecast are
            the same pipeline, one tab apart.
          </p>
        </div>

        <div
          className="scene stage-blue board-stage pipeline-scene"
          id="board-scene"
          data-scene="pipeline"
          aria-label="Deal pipeline in a sample workspace"
        >
          <div className="app tilt-soft pipeline-app" data-reveal>
            <div className="titlebar">
              <span className="lights">
                <i></i>
                <i></i>
                <i></i>
              </span>
              <span className="url">
                <span className="material-symbols-outlined">lock</span>
                {'app.aurora.io/deals?view=pipeline'}
              </span>
            </div>
            <aside className="rail" aria-hidden="true">
              <img src="/brand/aurora/aurora-wave.webp" alt="" className="rail-logo" />
              <span className="material-symbols-outlined">home</span>
              <span className="material-symbols-outlined on">view_kanban</span>
              <span className="material-symbols-outlined">task_alt</span>
              <span className="material-symbols-outlined">support_agent</span>
              <span className="material-symbols-outlined">monitoring</span>
              <span className="rail-me">
                <img src="/brand/aurora/people/you.webp" alt="" width={160} height={160} />
              </span>
            </aside>
            <div className="app-main">
              <header className="topbar">
                <span className="crumb">
                  Deals <i>/</i> <b>Pipeline</b>
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
                  <span>List</span>
                  <b>Board</b>
                  <span>Forecast</span>
                </span>
              </header>

              <ul className="deal-stats" aria-label="Pipeline totals">
                <li className="stat-chip stat-chip--open">
                  <b>£268k</b>
                  <span>Open pipeline</span>
                </li>
                <li className="stat-chip stat-chip--weighted">
                  <b>£121k</b>
                  <span>Weighted forecast</span>
                </li>
                <li className="stat-chip stat-chip--attention">
                  <b>2</b>
                  <span>Needs you today</span>
                </li>
              </ul>
              <p className="deal-forecast-hint">
                <span className="material-symbols-outlined">trending_up</span>Forecast: 62% win rate
                this quarter, from the Forecast tab above.
              </p>

              <div className="deal-board" id="board">
                {STAGES.map((stage) => (
                  <div className="deal-col" data-stage={stage.id} key={stage.id}>
                    <h4>
                      <span className="sd" style={{ '--c': stage.color } as CSSProperties}></span>
                      {stage.label}
                      <em>{stage.total}</em>
                    </h4>
                    {stage.id === 'new' && (
                      <DealCard
                        account="Northwind"
                        name="Platform rollout"
                        value="£24,000"
                        date="30 Nov"
                        prob={20}
                        who={{ initials: 'MC', color: '#7655F6' }}
                      />
                    )}
                    {stage.id === 'contacted' && (
                      <DealCard
                        account="Fabrikam"
                        name="Support tier upgrade"
                        value="£9,500"
                        date="22 Nov"
                        prob={28}
                        who={{ initials: 'JP', color: '#2A78F6' }}
                      />
                    )}
                    {stage.id === 'qualified' && (
                      <DealCard
                        id="deal-mover"
                        urgent
                        account="Contoso"
                        name="Renewal expansion"
                        value="£41,000"
                        date="14 Nov"
                        prob={45}
                        who={{ initials: 'SK', color: '#1BAFAA' }}
                        tag={{ icon: 'schedule', text: 'No reply in 9 days', tone: 'cold' }}
                      />
                    )}
                    {stage.id === 'proposal' && (
                      <DealCard
                        account="Adatum"
                        name="Multi-team seats"
                        value="£33,500"
                        date="6 Nov"
                        prob={65}
                        who={{ initials: 'MC', color: '#7655F6' }}
                      />
                    )}
                    {stage.id === 'negotiation' && (
                      <DealCard
                        account="Tailspin"
                        name="Annual contract"
                        value="£38,000"
                        date="30 Oct"
                        prob={80}
                        who={{ initials: 'JP', color: '#2A78F6' }}
                      />
                    )}
                    {stage.id === 'won' && (
                      <DealCard
                        won
                        account="Woodgrove"
                        name="Team expansion"
                        value="£27,000"
                        date="18 Oct"
                        prob={100}
                        who={{ initials: 'SK', color: '#1BAFAA' }}
                      />
                    )}
                    {stage.id === 'lost' && (
                      <DealCard
                        lost
                        account="Litware"
                        name="Pilot renewal"
                        value="£12,800"
                        date="12 Oct"
                        prob={0}
                        who={{ initials: 'MC', color: '#7655F6' }}
                        tag={{ icon: 'block', text: 'Reason: budget', tone: 'lost' }}
                      />
                    )}
                    {stage.more && <span className="deal-col__more">{stage.more}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="board-scroll-hint" aria-hidden="true">
            <span className="material-symbols-outlined">swipe</span>Swipe for more stages
          </div>

          <div
            className="float lead-panel"
            id="lead-panel"
            aria-label="Lead scoring, a sample workspace panel"
          >
            <p className="label">Lead scoring</p>
            <div className="lead-tiers">
              <span className="lead-tier lead-tier--hot">Hot</span>
              <span className="lead-tier lead-tier--warm">Warm</span>
              <span className="lead-tier lead-tier--cold">Cold</span>
            </div>
            <b>Blue Yonder · 91</b>
            <div className="lead-factors">
              <div className="lead-factor">
                <span>Engagement</span>
                <i style={{ width: '86%' } as CSSProperties}></i>
              </div>
              <div className="lead-factor">
                <span>Fit</span>
                <i style={{ width: '74%' } as CSSProperties}></i>
              </div>
              <div className="lead-factor">
                <span>Intent</span>
                <i style={{ width: '92%' } as CSSProperties}></i>
              </div>
            </div>
          </div>

          <div className="float f-nba deal-nba" id="deal-nba">
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
  );
}

/** Sample-workspace people: initials to portrait (Pexels stock, free licence). */
const PEOPLE: Record<string, string> = { MC: 'maya-chen', JP: 'james-porter', SK: 'simone-king' };

function DealCard(props: {
  id?: string;
  account: string;
  name: string;
  value: string;
  date: string;
  prob: number;
  who: { initials: string; color: string };
  urgent?: boolean;
  won?: boolean;
  lost?: boolean;
  tag?: { icon: string; text: string; tone: 'cold' | 'sent' | 'lost' };
}) {
  const classes = ['deal', 'deal-card'];
  if (props.urgent) classes.push('urgent');
  if (props.won) classes.push('won');
  if (props.lost) classes.push('deal-card--lost');
  return (
    <div className={classes.join(' ')} id={props.id}>
      <span className="deal-handle material-symbols-outlined" aria-hidden="true">
        drag_indicator
      </span>
      <b>{props.account}</b>
      <small className="deal-name">{props.name}</small>
      <span className="deal-meta">
        {props.value} · closes {props.date}
      </span>
      <div className="prob">
        <i style={{ width: `${props.prob}%` } as CSSProperties}></i>
      </div>
      <span className="who" style={{ '--a': props.who.color } as CSSProperties}>
        <img
          src={`/brand/aurora/people/${PEOPLE[props.who.initials]}.webp`}
          alt=""
          width={160}
          height={160}
        />
      </span>
      {props.tag && (
        <em className={`tag ${props.tag.tone}`}>
          <span className="material-symbols-outlined">{props.tag.icon}</span>
          {props.tag.text}
        </em>
      )}
    </div>
  );
}
