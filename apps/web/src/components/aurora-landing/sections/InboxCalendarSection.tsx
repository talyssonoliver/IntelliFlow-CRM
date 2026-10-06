import type { CSSProperties } from 'react';

/** Sample-workspace people: initials to portrait (Pexels stock, free licence). */
const PEOPLE: Record<string, string> = { MC: 'maya-chen', JP: 'james-porter', SK: 'simone-king' };
import './inbox-calendar-section.css';

type EventType = 'Meeting' | 'Call' | 'Consultation';

const EVENT_COLOR: Record<EventType, string> = {
  Meeting: '#2A78F6',
  Call: '#28D9D4',
  Consultation: '#7655F6',
};

const EVENTS: Array<{
  when: string;
  type: EventType;
  title: string;
  who: string;
  accent: string;
}> = [
  {
    when: 'Mon 09:00',
    type: 'Meeting',
    title: 'Contoso renewal call',
    who: 'MC',
    accent: '#7655F6',
  },
  {
    when: 'Mon 14:30',
    type: 'Call',
    title: 'Fabrikam demo follow-up',
    who: 'JP',
    accent: '#2A78F6',
  },
  {
    when: 'Tue 10:00',
    type: 'Consultation',
    title: 'Adatum onboarding',
    who: 'SK',
    accent: '#1BAFAA',
  },
  {
    when: 'Wed 11:00',
    type: 'Meeting',
    title: 'Litware quarterly review',
    who: 'MC',
    accent: '#7655F6',
  },
];

/** Real two-pane inbox (/email) and a calendar agenda, inside the CRM. */
export function InboxCalendarSection() {
  return (
    <section
      className="feature showcase inbox-cal-section"
      data-bridge-section
      style={{ '--bridge-accent': '#28D9D4' } as CSSProperties}
    >
      <div className="wrap">
        <div className="center reveal" data-reveal>
          <p className="eyebrow">Inbox &amp; calendar</p>
          <h2>Email and your calendar, inside the CRM.</h2>
          <p className="section-lede">
            Compose, reply and book meetings without leaving the record. No separate inbox tab, no
            missed invite.
          </p>
        </div>
        <div className="ic-grid" data-reveal-stagger>
          <div
            className="scene ic-email-scene"
            data-scene="inbox"
            aria-label="Email inbox in a sample workspace"
          >
            <div className="app tilt-soft ic-app">
              <div className="titlebar">
                <span className="lights">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <span className="url">
                  <span className="material-symbols-outlined">lock</span>app.aurora.io/email
                </span>
              </div>
              <aside className="rail" aria-hidden="true">
                <img src="/brand/aurora/aurora-wave.webp" alt="" className="rail-logo" />
                <span className="material-symbols-outlined">home</span>
                <span className="material-symbols-outlined on">mail</span>
                <span className="material-symbols-outlined">calendar_month</span>
                <span className="material-symbols-outlined">task_alt</span>
                <span className="rail-me">
                  <img src="/brand/aurora/people/you.webp" alt="" width={160} height={160} />
                </span>
              </aside>
              <div className="app-main">
                <div className="ic-email-body">
                  <nav className="ic-folders" aria-label="Mail folders">
                    <div className="ic-folder on">
                      <span className="material-symbols-outlined">inbox</span>Inbox <b>12</b>
                    </div>
                    <div className="ic-folder">
                      <span className="material-symbols-outlined">send</span>Sent
                    </div>
                    <div className="ic-folder">
                      <span className="material-symbols-outlined">edit_note</span>Drafts <b>3</b>
                    </div>
                    <div className="ic-label">
                      <i style={{ '--lc': '#2A78F6' } as CSSProperties}></i>Renewals
                    </div>
                    <div className="ic-label">
                      <i style={{ '--lc': '#7655F6' } as CSSProperties}></i>VIP
                    </div>
                  </nav>
                  <div className="ic-messages">
                    <div className="ic-search">
                      <span className="material-symbols-outlined">search</span>Search mail
                    </div>
                    <div className="ic-msg unread">
                      <span className="ic-msg-who" style={{ '--a': '#7655F6' } as CSSProperties}>
                        <img
                          src="/brand/aurora/people/maya-chen.webp"
                          alt=""
                          width={160}
                          height={160}
                        />
                      </span>
                      <div>
                        <b>Maya Chen</b>
                        <small>Contoso · Re: renewal terms for Q3</small>
                      </div>
                      <em>09:14</em>
                    </div>
                    <div className="ic-msg">
                      <span className="ic-msg-who" style={{ '--a': '#2A78F6' } as CSSProperties}>
                        <img
                          src="/brand/aurora/people/james-porter.webp"
                          alt=""
                          width={160}
                          height={160}
                        />
                      </span>
                      <div>
                        <b>James Porter</b>
                        <small>Fabrikam · Thanks, the recap looks right</small>
                      </div>
                      <em>Yesterday</em>
                    </div>
                    <div className="ic-msg">
                      <span className="ic-msg-who" style={{ '--a': '#1BAFAA' } as CSSProperties}>
                        <img
                          src="/brand/aurora/people/simone-king.webp"
                          alt=""
                          width={160}
                          height={160}
                        />
                      </span>
                      <div>
                        <b>Simone King</b>
                        <small>Adatum · Does Thursday still work?</small>
                      </div>
                      <em>Mon</em>
                    </div>
                  </div>
                  <div className="ic-thread">
                    <header>
                      <b>Maya Chen</b>
                      <small>maya.chen@contoso.example</small>
                    </header>
                    <p>
                      Thanks for sending the updated terms. One question on the renewal date before
                      I sign off internally, could we push it a week?
                    </p>
                    <div className="ic-compose-row">
                      <span className="ic-compose-btn">
                        <span className="material-symbols-outlined">reply</span>Reply
                      </span>
                      <span className="ic-compose-btn ai">
                        <span className="material-symbols-outlined">auto_awesome</span>Draft with AI
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <span className="sample">Sample workspace</span>
          </div>

          <div className="ic-cal-card" aria-label="Calendar in a sample workspace">
            <div className="btag-row">
              <p className="btag" style={{ '--c': '#28D9D4' } as CSSProperties}>
                Calendar
              </p>
              <span className="mini-sample">Sample workspace</span>
            </div>
            <h3>Book meetings straight from the record.</h3>
            <div className="ic-agenda">
              {EVENTS.map((event) => (
                <div className="ic-event" key={event.when + event.title}>
                  <span className="ic-event-when">{event.when}</span>
                  <span
                    className="ic-event-dot"
                    style={{ '--ec': EVENT_COLOR[event.type] } as CSSProperties}
                  ></span>
                  <span className="ic-event-copy">
                    <b>{event.title}</b>
                    <span style={{ '--ec': EVENT_COLOR[event.type] } as CSSProperties}>
                      {event.type}
                    </span>
                  </span>
                  <span className="ic-event-who" style={{ '--a': event.accent } as CSSProperties}>
                    <img
                      src={`/brand/aurora/people/${PEOPLE[event.who]}.webp`}
                      alt=""
                      width={160}
                      height={160}
                    />
                  </span>
                </div>
              ))}
            </div>
            <p className="ic-cal-note">
              <span className="material-symbols-outlined">link</span>Contoso&apos;s renewal call was
              booked straight from Maya Chen&apos;s thread.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
