/**
 * Content for the public Data and AI page. Lines come from the facts file
 * `ops/reviews/aurora-data-facts-robert-1122.md` (code and production settings, 22 November 2026),
 * updated for the owner-approved changes of 22 November 2026: Anthropic as the only text provider,
 * Gemini embeddings on a paid project, and OpenRouter removed. Change a line here only when the fact changes, and keep
 * `docs/shared/dpa-content.md` (the sub-processor list on /dpa) in step: a test checks that
 * every name below appears in the DPA.
 */

export const DATA_AND_AI_LAST_UPDATED = '22 November 2026';

export const ANTHROPIC_TERMS_URL = 'https://www.anthropic.com/legal/commercial-terms';
export const ANTHROPIC_RETENTION_URL =
  'https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data';
export const GEMINI_TERMS_URL = 'https://ai.google.dev/gemini-api/terms';

export type SubProcessor = {
  name: string;
  /** The text the DPA uses for this provider, so the two lists can be compared. */
  dpaName: string;
  purpose: string;
  data: string;
  location: string;
  termsLabel: string;
  termsUrl: string;
};

export const SUB_PROCESSORS: readonly SubProcessor[] = [
  {
    name: 'Anthropic',
    dpaName: 'Anthropic, PBC',
    purpose: 'Writes generated text: reply drafts, lead scores and summaries.',
    data: 'For a reply draft, up to 10 emails from the thread (4,000 characters each). For a lead score, the lead’s domain, company, job title, source and activity history.',
    location: 'Not stated by the provider; see its terms.',
    termsLabel: 'Commercial Terms',
    termsUrl: ANTHROPIC_TERMS_URL,
  },
  {
    name: 'Google (Gemini API)',
    dpaName: 'Google LLC',
    purpose: 'Turns contact details into embeddings, used for scoring and search.',
    data: 'A contact’s first and last name, email address and company.',
    location: 'Not stated by the provider; see its terms.',
    termsLabel: 'Gemini API terms',
    termsUrl: GEMINI_TERMS_URL,
  },
  {
    name: 'Supabase',
    dpaName: 'Supabase, Inc.',
    purpose: 'Database, sign-in and private file storage.',
    data: 'Your CRM records, synced email and calendar copies, and files.',
    location: 'AWS eu-central-1, Frankfurt, Germany.',
    termsLabel: 'Data processing addendum',
    termsUrl: 'https://supabase.com/legal/dpa',
  },
  {
    name: 'Railway',
    dpaName: 'Railway Corporation',
    purpose: 'Runs the API, the AI worker and background jobs, with a Redis job queue.',
    data: 'Data passing through requests and queued jobs.',
    location: 'europe-west4, the Netherlands.',
    termsLabel: 'Data processing addendum',
    termsUrl: 'https://railway.com/legal/dpa',
  },
  {
    name: 'Vercel',
    dpaName: 'Vercel Inc.',
    purpose: 'Hosts the web application.',
    data: 'Page requests to the web application.',
    location: 'Configured region: US east (iad1).',
    termsLabel: 'Data processing addendum',
    termsUrl: 'https://vercel.com/legal/dpa',
  },
  {
    name: 'Upstash',
    dpaName: 'Upstash, Inc.',
    purpose: 'Rate limiting on the web application.',
    data: 'Request counters used to limit abuse.',
    location: 'Not stated by the provider; see its terms.',
    termsLabel: 'Data processing addendum',
    termsUrl: 'https://upstash.com/trust/dpa.pdf',
  },
  {
    name: 'Resend',
    dpaName: 'Resend, Inc.',
    purpose: 'Sends Aurora’s own system email.',
    data: 'The recipient and content of system email. Replies to your contacts go through your own mailbox, not Resend.',
    location: 'Not stated by the provider; see its terms.',
    termsLabel: 'Data processing addendum',
    termsUrl: 'https://resend.com/legal/dpa',
  },
  {
    name: 'Sentry',
    dpaName: 'Functional Software, Inc., trading as Sentry',
    purpose: 'Error monitoring.',
    data: 'Error reports. Personal data collection is switched off and reports are scrubbed.',
    location: 'Not stated by the provider; see its terms.',
    termsLabel: 'Data processing addendum',
    termsUrl: 'https://sentry.io/legal/dpa/',
  },
  {
    name: 'Grafana Cloud',
    dpaName: 'Raintank Inc., trading as Grafana Labs',
    purpose: 'Telemetry: logs, traces and metrics from Aurora’s services.',
    data: 'Operational telemetry. Any personal data that appears in a log line is included.',
    location: 'London, United Kingdom (gb-south-1).',
    termsLabel: 'Data processing agreement',
    termsUrl: 'https://grafana.com/legal/data-processing-agreement/',
  },
  {
    name: 'Zoho',
    dpaName: 'Zoho Corporation',
    purpose: 'Mailboxes that receive email sent to Leangency’s own addresses.',
    data: 'Anything you send to those addresses, such as hello@leangency.com.',
    location: 'Not stated by the provider; see its terms.',
    termsLabel: 'Privacy policy',
    termsUrl: 'https://www.zoho.com/privacy.html',
  },
];

/** Not a sub-processor: Leangency is the controller of billing data. Shown so the page is complete. */
export const STRIPE_NOTE = {
  name: 'Stripe',
  text: 'Stripe takes payment for your subscription. It receives your billing details only. Leangency is the controller of that data, so Stripe is not a sub-processor under the DPA.',
  termsLabel: 'Stripe privacy policy',
  termsUrl: 'https://stripe.com/privacy',
};

export const REMOVED_NOTES: readonly string[] = [
  'OpenRouter has been removed. It no longer receives any Aurora data.',
  'Twilio is not used. The multi-factor sign-in step that would use it is a stub and sends nothing.',
  'SendGrid, OpenAI and Amazon S3 are supported in the code but are not enabled, so they receive no Aurora data.',
];

export type DataAndAiSection = {
  id: string;
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export const SECTIONS: readonly DataAndAiSection[] = [
  {
    id: 'ai',
    heading: 'How Aurora uses AI',
    paragraphs: [
      'Anthropic is the only provider that writes text for Aurora: reply drafts, lead scores and summaries. Embeddings, which help with scoring and search, come from the Google Gemini API.',
      'Reply drafts are never sent without your approval: Aurora saves a draft, and a person on your team chooses to send it. A separate auto-response feature, which is off by default, can be set up to send without approval.',
      'For reply drafts, contacts who have been erased or restricted are blocked before any prompt is built.',
    ],
  },
  {
    id: 'ai-terms',
    heading: 'What the AI providers do with your data',
    bullets: [
      'Its Commercial Terms say: “Anthropic may not train models on Customer Content from Services.” Its privacy centre says it automatically deletes API inputs and outputs from its backend within 30 days of receipt or generation, except where it needs to keep them longer to enforce its Usage Policy: content it flags can be kept for up to 2 years.',
      'Google does not use prompts or responses from its paid Gemini API to improve its products. Aurora uses a paid, billing-enabled project, so those terms apply.',
      'Read each provider’s own terms for the exceptions and for anything not covered here.',
    ],
  },
  {
    id: 'what-is-sent',
    heading: 'What is sent to the AI providers',
    bullets: [
      'Reply drafts: up to 10 emails from the thread, 4,000 characters each, to Anthropic.',
      'Lead scoring: the lead’s domain, company, job title, source and activity history, to Anthropic.',
      'Embeddings: a contact’s first and last name, email address and company, to Google.',
    ],
  },
  {
    id: 'where',
    heading: 'Where your data is held',
    bullets: [
      'Database: Supabase, on AWS in Frankfurt (eu-central-1).',
      'Application servers: Railway, in the Netherlands (europe-west4).',
      'Web application: Vercel.',
      'Files: a private Supabase Storage bucket.',
      'Telemetry: Grafana Cloud, in London.',
    ],
  },
  {
    id: 'google',
    heading: 'Gmail and Google Calendar',
    paragraphs: [
      'Aurora has no access to your email or calendar until you connect them. If you connect Gmail, Aurora asks Google for these permissions: sign-in details (openid and email), read your mail, send mail, and manage events on your calendar. You can untick the calendar permission, and Aurora can work with send-only access instead. Microsoft mail is also supported, with read, send and sign-in access and no calendar.',
    ],
    bullets: [
      'Copied into Aurora, looking back 90 days: only mail linked to a lead or contact you already have, or a new real enquiry. Aurora keeps the subject, the full text, who it is from, to and cc, and its folder and direction.',
      'Not copied: attachments, personal mail, automated mail and spam.',
      'Calendar: your primary calendar only. Aurora keeps the title, description, location, start and end. Attendees are not copied and private events are skipped.',
      'Stays only in Google: your other calendars, event attendees, attachments, and all mail with no lead or contact.',
      'Google connection (refresh) tokens are encrypted. If you disconnect, Aurora revokes the grant, but mail it has already copied stays in Aurora.',
    ],
  },
  {
    id: 'retention',
    heading: 'Erasure, export and retention',
    paragraphs: [
      'You can ask us to erase or export the data we hold about a person. This is built for leads, contacts, notes, activities, bookings and AI records, and the export is a JSON file. For synced email, tickets, drafts and calendar events, we complete the request by hand.',
      'Aurora does not delete synced email automatically. Bounce receipts and sign-in connection states are kept for 90 days.',
      'There is no whole-workspace export or deletion feature yet. You can export your contacts in bulk as CSV or JSON. To ask for anything else, email hello@leangency.com.',
    ],
  },
  {
    id: 'certifications',
    heading: 'Certifications',
    paragraphs: [
      'Aurora does not hold SOC 2, ISO/IEC 27001 or any other independent security certification.',
    ],
  },
];
