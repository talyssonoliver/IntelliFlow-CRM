import type { CSSProperties } from 'react';
import pricingData from '@/data/pricing-data.json';
import './faq-section.css';

const { tiers, metadata } = pricingData;
/** The lowest published price: the cheapest plan, billed annually. */
const fromPrice = Math.min(
  ...tiers.flatMap((t) => (typeof t.price.annual === 'number' ? [t.price.annual] : []))
);

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
    answer: `Every plan starts with a ${metadata.freeTrialDays}-day free trial, no credit card needed. Plans start at £${fromPrice} per user per month, billed annually, and every plan is on the pricing page.`,
  },
];

/** Questions buyers ask. */
export function FaqSection() {
  return (
    <>
      <section
        className="faq aurora-faq"
        id="faq"
        data-bridge-section
        style={{ '--bridge-accent': 'var(--violet)' } as CSSProperties}
      >
        <div className="wrap narrow reveal" data-reveal>
          <h2>Questions buyers ask.</h2>
          <div data-reveal-stagger>
            {FAQ.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  {question}
                  <span className="material-symbols-outlined">expand_more</span>
                </summary>
                <div className="faq-content">
                  <p>{answer}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
