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

/** Questions buyers ask. */
export function FaqSection() {
  return (
    <>
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
    </>
  );
}
