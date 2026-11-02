/**
 * IFC-117 hallucination alert (2026-11-01): 78 of 93 lead-scoring outputs flagged
 * ["unsupported_claim","context_drift"] at score 0.40.
 *
 * The real checker is run on realistic lead-scoring traffic: the context the chain
 * passes (the formatted prompt, rubric + lead info) and factor reasoning in the
 * shape extractText produces. Grounded reasoning must not flag; the ungrounded
 * control must, at the unchanged 0.3 threshold.
 */

import { describe, it, expect, vi } from 'vitest';
import { PromptTemplate } from '@langchain/core/prompts';

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../lib/llm-factory', () => ({ createLLM: vi.fn(), createLLMForTenant: vi.fn() }));

import { LeadScoringChain } from '../scoring.chain';
import {
  HallucinationChecker,
  defaultHallucinationConfig,
} from '../../monitoring/hallucination-checker';

type Factor = { name: string; reasoning: string };
interface GroundingCase {
  label: string;
  leadInfo: string;
  factors: Factor[];
}

const GROUNDED: GroundingCase[] = [
  {
    label: 'corporate VP from the website',
    leadInfo:
      'Email Domain: northwind.example\nHas Email: Yes\nHas Name: Yes\nCompany: Northwind Logistics\nTitle: VP of Operations\nSource: WEBSITE',
    factors: [
      {
        name: 'Contact Completeness',
        reasoning:
          'The lead has a name, a corporate email and a company, so the profile is fairly complete.',
      },
      {
        name: 'Engagement Indicators',
        reasoning: 'Source is the website, which is a high quality inbound channel.',
      },
      {
        name: 'Qualification Signals',
        reasoning: 'A VP of Operations title indicates decision-making authority.',
      },
      {
        name: 'Data Quality',
        reasoning: 'Information is consistent but there is no phone number.',
      },
    ],
  },
  {
    label: 'free email from a referral',
    leadInfo: 'Email Domain: mail.example\nHas Email: Yes\nHas Name: Yes\nSource: REFERRAL',
    factors: [
      {
        name: 'Contact Completeness',
        reasoning: 'Name and email are present but company and title are missing.',
      },
      {
        name: 'Engagement Indicators',
        reasoning: 'Referral is a moderate quality source and the email is a free provider.',
      },
      {
        name: 'Qualification Signals',
        reasoning: 'Without a job title there is no evidence of decision-making authority.',
      },
      { name: 'Data Quality', reasoning: 'The profile is incomplete, which lowers confidence.' },
    ],
  },
  {
    label: 'restaurant owner from a cold call',
    leadInfo:
      'Email Domain: lacucina.example\nHas Email: Yes\nHas Name: Yes\nCompany: La Cucina Bristol\nTitle: Owner\nPhone: Available\nSource: COLD_CALL',
    factors: [
      {
        name: 'Contact Completeness',
        reasoning: 'All contact fields are available including phone.',
      },
      {
        name: 'Engagement Indicators',
        reasoning:
          'Cold call is the lowest quality source, though the business email domain is professional.',
      },
      {
        name: 'Qualification Signals',
        reasoning: 'As the owner the contact is the decision maker for a small business.',
      },
      { name: 'Data Quality', reasoning: 'The data is complete and consistent.' },
    ],
  },
  {
    label: 'engineer from social',
    leadInfo:
      'Email Domain: contoso.example\nHas Email: Yes\nCompany: Contoso\nTitle: Software Engineer\nSource: SOCIAL',
    factors: [
      {
        name: 'Contact Completeness',
        reasoning: 'Email, company and title are present; name is not provided.',
      },
      {
        name: 'Engagement Indicators',
        reasoning: 'Social media leads are lower intent than direct website visits.',
      },
      {
        name: 'Qualification Signals',
        reasoning: 'An individual contributor role has limited purchasing authority.',
      },
      { name: 'Data Quality', reasoning: 'Moderately complete profile with a corporate domain.' },
    ],
  },
  {
    label: 'CEO from an event',
    leadInfo:
      'Email Domain: fabrikam.example\nHas Email: Yes\nHas Name: Yes\nCompany: Fabrikam Inc\nTitle: CEO\nPhone: Available\nSource: EVENT',
    factors: [
      {
        name: 'Contact Completeness',
        reasoning: 'Complete profile with name, email, phone, company and title.',
      },
      { name: 'Engagement Indicators', reasoning: 'Met at an event, which shows active interest.' },
      { name: 'Qualification Signals', reasoning: 'The CEO is the final decision maker.' },
      { name: 'Data Quality', reasoning: 'Data is consistent across all fields.' },
    ],
  },
  {
    label: 'source-only lead',
    leadInfo: 'Source: WEBSITE',
    factors: [
      {
        name: 'Contact Completeness',
        reasoning: 'Almost no contact information is available.',
      },
      {
        name: 'Engagement Indicators',
        reasoning: 'The website is a good source but nothing else is known.',
      },
      { name: 'Qualification Signals', reasoning: 'There are no qualification signals.' },
      { name: 'Data Quality', reasoning: 'Data quality is very low.' },
    ],
  },
];

// Control: invents figures, history and a source that appear nowhere in the prompt.
const UNGROUNDED: GroundingCase = {
  label: 'ungrounded control',
  leadInfo:
    'Email Domain: northwind.example\nHas Email: Yes\nCompany: Northwind Logistics\nTitle: VP of Operations\nSource: WEBSITE',
  factors: [
    {
      name: 'Company Size',
      reasoning: 'Northwind Logistics has 4,500 employees and raised $40M in 2024.',
    },
    {
      name: 'Intent',
      reasoning:
        'The lead visited the pricing page seven times last week and downloaded the whitepaper.',
    },
    {
      name: 'Budget',
      reasoning: 'Their annual software budget is $2,000,000 according to Gartner.',
    },
  ],
};

/** The context the chain hands the monitor: the prompt the model actually saw. */
async function chainContext(leadInfo: string): Promise<string> {
  const prompt = new PromptTemplate({
    template: LeadScoringChain.DEFAULT_PROMPT,
    inputVariables: ['lead_info'],
  });
  return prompt.format({ lead_info: leadInfo });
}

/** The text extractText produces from factors[]. */
function factorText(factors: Factor[]): string {
  return factors.map((f) => `${f.name}: ${f.reasoning}`).join('\n');
}

async function check(c: GroundingCase) {
  const checker = new HallucinationChecker(defaultHallucinationConfig);
  return checker.checkOutput({
    id: c.label,
    model: 'scoring-free',
    inputContext: await chainContext(c.leadInfo),
    output: factorText(c.factors),
  });
}

describe('lead-scoring hallucination grounding (IFC-117 alert)', () => {
  it.each(GROUNDED.map((c) => [c.label, c] as const))(
    'does not flag grounded reasoning: %s',
    async (_label, c) => {
      const result = await check(c);
      expect(result.hallucinationTypes).not.toContain('context_drift');
      expect(result.score).toBeLessThan(defaultHallucinationConfig.confidenceThreshold);
      expect(result.hallucinated).toBe(false);
    }
  );

  it('still flags reasoning that invents figures absent from the prompt', async () => {
    const result = await check(UNGROUNDED);
    expect(result.hallucinated).toBe(true);
    expect(result.hallucinationTypes).toContain('unsupported_claim');
    expect(result.evidence.join('\n')).toContain('4,500 employees');
    expect(result.evidence.join('\n')).toContain('$2,000,000');
  });

  it('keeps the 0.3 threshold', () => {
    expect(defaultHallucinationConfig.confidenceThreshold).toBe(0.3);
  });
});
