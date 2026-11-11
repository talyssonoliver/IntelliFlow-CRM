/**
 * The prompts the ai-worker chains send when a tenant has no usable saved chain version.
 *
 * The chains build their prompts from these (apps/ai-worker/src/chains/*.chain.ts), and the
 * API shows them on the AI Chains page (chainVersion.getEffective), so the page shows exactly
 * what is sent. Edit a prompt here, not in the chain.
 *
 * Each worker chain reads the saved version of one chain type (several share a type). A saved
 * version replaces a chain's template only when it has a slot for every input the chain fills;
 * auto-response instead uses a saved EMAIL_WRITER prompt as the tenant's custom instructions.
 */

import type { ChainType } from '@intelliflow/domain';

/** The ai-worker chains that read saved chain versions. */
export const WORKER_CHAIN_KEYS = [
  'LEAD_SCORING',
  'CHURN_RISK',
  'INSIGHT_GENERATION',
  'SENTIMENT_ANALYSIS',
  'TICKET_ROUTING',
  'AUTO_RESPONSE',
] as const;
export type WorkerChainKey = (typeof WORKER_CHAIN_KEYS)[number];

/** The model purpose each chain asks the LLM factory for (tenant model pins are per purpose). */
export type ChainPurpose = 'scoring' | 'reasoning' | 'structured' | 'email';

export interface BuiltinChain {
  key: WorkerChainKey;
  name: string;
  chainType: ChainType;
  purpose: ChainPurpose;
  /** Fixed temperature, or null when the chain uses the platform default (OPENAI_TEMPERATURE). */
  temperature: number | null;
  /** The inputs the chain fills; a saved prompt must have a slot for each to replace the template. */
  inputVariables: readonly string[];
  /** How a saved version of chainType is used: as the template, or as custom instructions. */
  savedVersionUse: 'template' | 'instructions';
}

/** Built-in templates (PromptTemplate f-strings) of the chains that use one. */
export const BUILTIN_CHAIN_TEMPLATES = {
  LEAD_SCORING: `You are an expert lead scoring AI for a CRM system. Analyze the provided lead information and assign a score from 0-100 based on the lead's quality and conversion potential.

Consider the following factors:
1. Contact Information Completeness (0-25 points)
   - Email quality and domain
   - Phone number availability
   - Professional title
   - Company information

2. Engagement Indicators (0-25 points)
   - Replies from the lead: a reply, above all one asking about price or next steps, is the strongest signal
   - Recent activity, pipeline stage and how recently the lead was contacted
   - Source quality (direct website > referral > social > cold call)
   - Email domain (corporate email > free email)

3. Qualification Signals (0-25 points)
   - Job title indicates decision-making authority
   - Company size and industry indicators
   - Professional email domain

4. Data Quality (0-25 points)
   - Completeness of profile
   - Consistency of information
   - Recency indicators

Lead Information:
{lead_info}

Respond with a structured JSON object containing the score, confidence, factors, and modelVersion fields.
List at least one factor, each with the points it adds or removes and the lead information behind it.
Confidence is how sure you are that the score is right, above 0 and at most 1: near 1 when the lead information clearly supports the score, 0.5 or below when it is thin or mixed. Never answer confidence 0; when the information is thin, give your best score with a low confidence.`,
  CHURN_RISK: `You are an expert customer success analyst specializing in churn prediction for a CRM system.
Analyze the following customer data to predict their churn risk.

CUSTOMER DATA:
Entity Type: {entityType}
Entity ID: {entityId}

ENGAGEMENT METRICS:
{engagementData}

BEHAVIORAL PATTERNS:
{behavioralData}

TRANSACTION HISTORY:
{transactionData}

SUPPORT INTERACTIONS:
{supportData}

ACCOUNT ATTRIBUTES:
{accountData}

ANALYSIS INSTRUCTIONS:

1. RISK SCORE (0.0 to 1.0):
   - 0.8-1.0: Critical risk - Immediate intervention required
   - 0.6-0.79: High risk - Urgent attention needed
   - 0.4-0.59: Medium risk - Proactive engagement recommended
   - 0.2-0.39: Low risk - Standard monitoring
   - 0.0-0.19: Minimal risk - Customer is healthy

2. RISK FACTORS:
   - Identify the top 3-5 factors contributing to churn risk
   - Classify each factor's impact as high, medium, or low
   - Provide specific reasoning for each factor

3. RECOMMENDATIONS:
   - Provide 3-5 actionable recommendations
   - Prioritize by impact and urgency
   - Be specific and actionable

4. PRIMARY ACTION:
   - State the single most important action to take
   - This should be immediately executable

5. CONFIDENCE:
   - 0.9-1.0: Very high confidence (comprehensive data)
   - 0.7-0.89: High confidence (good data coverage)
   - 0.5-0.69: Moderate confidence (some data gaps)
   - Below 0.5: Low confidence (significant data missing)

Respond with a structured JSON object containing riskScore, confidence, topRiskFactors, explanation, recommendations, and primaryAction.`,
  INSIGHT_GENERATION: `You are an expert CRM sales coach analyzing a user's pipeline health. Based on the data below, generate actionable insights that explain WHY items need attention and WHAT specific actions to take.

CRM DATA SNAPSHOT:

DEALS AT RISK (no interaction in 14+ days):
{dealsData}

HOT LEADS (score >= 80, not yet converted):
{leadsData}

OVERDUE TASKS: {overdueTasksCount}

STALE CONTACTS (30+ days without contact, with open opportunities):
{contactsData}

ANALYSIS INSTRUCTIONS:

1. For each flagged item, produce ONE insight explaining:
   - WHY it matters (not just "it's been X days" — explain the business impact)
   - WHAT specific action to take (not generic "follow up")
   - Confidence (0.7-0.95 for LLM analysis, based on data quality)

2. Insight types:
   - "warning": Deal/contact at risk — explain revenue impact
   - "opportunity": Hot lead — explain buying signals
   - "reminder": Overdue tasks — explain priority

3. Priority levels:
   - "critical": Immediate action required (large deal, high-score lead)
   - "high": Action within 24 hours
   - "medium": Action within a week
   - "low": Informational

4. suggestedActions: Provide up to 3 specific, actionable steps

5. If no items are flagged, return an empty insights array. Never write reassurance such as "everything looks good": an empty result is not evidence that all is well

6. Every insight MUST include:
   - entityId: string or null
   - entityType: one of opportunity|lead|contact|task|deal, or null
   - suggestedActions: an array (use [] when no action is needed)
   - reasoning: one short sentence explaining why the insight was generated

Respond with a structured JSON object containing an insights array.`,
  SENTIMENT_ANALYSIS: `You are an expert sentiment analyst for a CRM system. Analyze the following text for sentiment, emotions, and business urgency.

TEXT TO ANALYZE:
{text}

CONTEXT (if provided):
{context}

SOURCE TYPE: {source}

ANALYSIS INSTRUCTIONS:

1. SENTIMENT CLASSIFICATION:
   - VERY_POSITIVE: Enthusiastic, delighted, highly satisfied
   - POSITIVE: Satisfied, pleased, agreeable
   - NEUTRAL: Factual, informational, no clear emotion
   - NEGATIVE: Dissatisfied, concerned, unhappy
   - VERY_NEGATIVE: Angry, frustrated, threatening to leave

2. EMOTION DETECTION:
   - Identify 1-3 primary emotions from: JOY, TRUST, ANTICIPATION, SURPRISE, SADNESS, FEAR, ANGER, DISGUST, NEUTRAL
   - Rate intensity from 0.0 (barely detectable) to 1.0 (very strong)

3. URGENCY ASSESSMENT:
   - CRITICAL: Immediate action required, escalation threats
   - HIGH: Same-day response needed, significant concerns
   - MEDIUM: Response within 2-3 days acceptable
   - LOW: No time pressure, general inquiry
   - NONE: Purely informational, no action required

4. KEY PHRASES:
   - Extract 2-5 phrases that strongly indicate sentiment
   - Classify each phrase as positive, neutral, or negative

5. CONFIDENCE:
   - 0.9-1.0: Very clear sentiment signals
   - 0.7-0.9: Clear with some ambiguity
   - 0.5-0.7: Mixed signals
   - Below 0.5: Highly ambiguous

Respond with a structured JSON object containing sentiment, sentimentScore, emotions, primaryEmotion, urgency, urgencyScore, keyPhrases, confidence, and reasoning.`,
  TICKET_ROUTING: `You are a ticket routing specialist for a CRM system.
Classify the support ticket into one of these categories: {categories}

TICKET:
Subject: {subject}
Description: {description}
Priority: {priority}

AVAILABLE AGENTS:
{agentList}

INSTRUCTIONS:
1. Classify the ticket into the most appropriate category.
2. Select the best agent based on their skills and current load.
3. Provide a confidence score (0-1) for your classification.
4. Assess escalation risk (low/medium/high).
5. Explain your reasoning briefly.

IMPORTANT: The assigneeId MUST be one of the agent IDs listed above.

Respond with a structured JSON object containing inferredCategory, assigneeId, reason, confidence, and escalationRisk.`,
} as const;

export const BUILTIN_CHAINS: Readonly<Record<WorkerChainKey, BuiltinChain>> = {
  LEAD_SCORING: {
    key: 'LEAD_SCORING',
    name: 'Lead scoring',
    chainType: 'SCORING',
    purpose: 'scoring',
    temperature: null,
    inputVariables: ['lead_info'],
    savedVersionUse: 'template',
  },
  CHURN_RISK: {
    key: 'CHURN_RISK',
    name: 'Churn risk',
    chainType: 'SCORING',
    purpose: 'scoring',
    temperature: 0.3,
    inputVariables: [
      'entityType',
      'entityId',
      'engagementData',
      'behavioralData',
      'transactionData',
      'supportData',
      'accountData',
    ],
    savedVersionUse: 'template',
  },
  INSIGHT_GENERATION: {
    key: 'INSIGHT_GENERATION',
    name: 'Insight generation',
    chainType: 'QUALIFICATION',
    purpose: 'reasoning',
    temperature: 0.4,
    inputVariables: ['dealsData', 'leadsData', 'overdueTasksCount', 'contactsData'],
    savedVersionUse: 'template',
  },
  SENTIMENT_ANALYSIS: {
    key: 'SENTIMENT_ANALYSIS',
    name: 'Sentiment analysis',
    chainType: 'EMAIL_WRITER',
    purpose: 'structured',
    temperature: 0.1,
    inputVariables: ['text', 'context', 'source'],
    savedVersionUse: 'template',
  },
  TICKET_ROUTING: {
    key: 'TICKET_ROUTING',
    name: 'Ticket routing',
    chainType: 'FOLLOWUP',
    purpose: 'structured',
    temperature: 0.1,
    inputVariables: ['subject', 'description', 'priority', 'categories', 'agentList'],
    savedVersionUse: 'template',
  },
  AUTO_RESPONSE: {
    key: 'AUTO_RESPONSE',
    name: 'Auto-response',
    chainType: 'EMAIL_WRITER',
    purpose: 'email',
    temperature: null,
    inputVariables: [],
    savedVersionUse: 'instructions',
  },
};

/** The values the auto-response prompt is built from (already sanitised by the chain). */
export interface AutoResponsePromptParts {
  companyName: string;
  leadName: string;
  leadEmail: string;
  company: string;
  status: string;
  contextSection: string;
  tone: string;
  /** The tenant's custom instructions, or a saved EMAIL_WRITER version's prompt. */
  customInstructions?: string;
  /** The signature with {companyName} already filled in. */
  signature?: string;
}

/** The auto-response prompt. The chain builds each prompt with this; the page shows it with labels. */
export function renderAutoResponsePrompt(p: AutoResponsePromptParts): string {
  return `You are an AI assistant for ${p.companyName}, generating professional email responses.

LEAD INFORMATION:
- Name: ${p.leadName}
- Email: ${p.leadEmail}
- Company: ${p.company}
- Status: ${p.status}

CONTEXT:
${p.contextSection}

TONE: ${p.tone}
${p.customInstructions ? `CUSTOM INSTRUCTIONS: ${p.customInstructions}` : ''}

Generate a response in JSON format with the following structure:
{
  "subject": "Email subject line (max 100 characters)",
  "body": "Email body (max 2000 characters)",
  "confidence": 0.0 to 1.0 confidence score,
  "tone": "detected tone of generated response",
  "suggestedFollowUp": "suggested follow-up timing"
}

Requirements:
- Subject must be concise and relevant (max 100 chars)
- Body must be professional and helpful (max 2000 chars)
- Include a clear call to action
- Match the specified tone
- Be personalized to the lead's context
${p.signature ? '- End with signature: ' + p.signature : ''}`;
}

/** The auto-response prompt as the AI Chains page shows it: each value named, not filled in. */
export function autoResponsePromptForDisplay(customInstructions?: string): string {
  return renderAutoResponsePrompt({
    companyName: '{companyName}',
    leadName: '{leadName}',
    leadEmail: '{leadEmail}',
    company: '{leadCompany}',
    status: '{leadStatus}',
    contextSection: '{context}',
    tone: '{tone}',
    customInstructions: customInstructions ?? '{customInstructions}',
    signature: '{signature}',
  });
}

/** The worker chains that read each chain type's saved version, in display order. */
export function chainsForType(chainType: ChainType): BuiltinChain[] {
  return WORKER_CHAIN_KEYS.map((key) => BUILTIN_CHAINS[key]).filter(
    (chain) => chain.chainType === chainType
  );
}

/**
 * The input slots of an f-string prompt, read the way LangChain's PromptTemplate reads it:
 * `{name}` is a slot, `{{` and `}}` are literal braces. Null when the prompt cannot be parsed
 * (an unmatched brace), which PromptTemplate would reject. Kept here so the API can tell, without
 * LangChain, which chains a saved prompt can feed; the ai-worker tests hold it to LangChain's parser.
 */
export function promptSlots(template: string): string[] | null {
  const slots = new Set<string>();
  let i = 0;
  while (i < template.length) {
    const next = readSlotStep(template, i, slots);
    if (next === null) return null;
    i = next;
  }
  return [...slots];
}

/** One scanning step of promptSlots: the next index, or null when the template is malformed. */
function readSlotStep(template: string, i: number, slots: Set<string>): number | null {
  const ch = template[i];
  if (ch !== '{' && ch !== '}') return i + 1;
  if (template[i + 1] === ch) return i + 2; // `{{` or `}}`: a literal brace
  if (ch === '}') return null; // a lone closing brace
  const close = template.indexOf('}', i + 1);
  if (close < 0) return null;
  const name = template.slice(i + 1, close);
  if (name.includes('{')) return null;
  slots.add(name);
  return close + 1;
}

/**
 * Whether a saved prompt can replace this chain's template: it parses, fills every input the
 * chain provides and asks for nothing else. Mirrors usableVersionedPrompt in the ai-worker.
 */
export function savedPromptFitsChain(chain: BuiltinChain, prompt: string): boolean {
  if (chain.savedVersionUse === 'instructions') return prompt.trim().length > 0;
  const slots = promptSlots(prompt);
  if (!slots) return false;
  return (
    slots.every((slot) => chain.inputVariables.includes(slot)) &&
    chain.inputVariables.every((name) => slots.includes(name))
  );
}

/** The built-in prompt a chain sends, as the AI Chains page shows it. */
export function builtinPromptText(key: WorkerChainKey): string {
  return key === 'AUTO_RESPONSE' ? autoResponsePromptForDisplay() : BUILTIN_CHAIN_TEMPLATES[key];
}
