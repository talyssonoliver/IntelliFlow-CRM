/**
 * Prompt templates for AI chains and agents
 *
 * This module exports prompt templates used by the AI scoring and qualification systems.
 * Templates use Handlebars-style syntax for variable interpolation.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Prompt file paths
const PROMPTS_DIR = __dirname;

/**
 * Load a prompt template from file
 */
export function loadPrompt(filename: string): string {
  try {
    return readFileSync(join(PROMPTS_DIR, filename), 'utf-8');
  } catch (error) {
    console.error(`Failed to load prompt: ${filename}`, error);
    return '';
  }
}

/**
 * Lead Scoring System Prompt
 * Defines the scoring framework and output format
 */
export const SCORING_SYSTEM_PROMPT = `You are an expert B2B lead scoring assistant. Your task is to analyze lead information and provide a comprehensive score based on multiple factors.

## Scoring Framework

Analyze leads using the following weighted factors:

### 1. Contact Information Completeness (0-25 points)
- Full name provided: +5 points
- Corporate email domain: +10 points (vs personal email: +2 points)
- Phone number available: +5 points
- Job title provided: +5 points

### 2. Engagement Indicators (0-25 points)
- Source quality (Referral: +10, Event: +8, Website: +5, Cold: +2)
- Recent activities count: +3 points per significant activity (max 15)

### 3. Qualification Signals (0-25 points)
- Decision-maker title (VP, Director, C-level): +15 points
- Manager title: +10 points
- Individual contributor: +5 points
- Company size indicators: +10 points if enterprise

### 4. Data Quality (0-25 points)
- Email validation passed: +10 points
- Consistent information: +10 points
- No red flags: +5 points

## Scoring Tiers

- HOT (80-100): High priority, immediate follow-up recommended
- WARM (50-79): Good potential, nurture with targeted content
- COLD (0-49): Low priority, add to long-term nurture campaign

Be objective and data-driven in your analysis.`;

/**
 * Build a lead scoring user prompt with provided data
 */
export function buildScoringPrompt(lead: {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  source?: string;
  companyData?: {
    industry?: string;
    size?: string;
    revenue?: string;
    location?: string;
  };
  recentActivities?: string[];
}): string {
  const lines: string[] = [
    'Please analyze the following lead and provide a score:',
    '',
    '## Lead Information',
    '',
    `- **Email**: ${lead.email}`,
  ];

  if (lead.firstName) lines.push(`- **First Name**: ${lead.firstName}`);
  if (lead.lastName) lines.push(`- **Last Name**: ${lead.lastName}`);
  if (lead.company) lines.push(`- **Company**: ${lead.company}`);
  if (lead.title) lines.push(`- **Title**: ${lead.title}`);
  if (lead.phone) lines.push(`- **Phone**: Available`);
  if (lead.source) lines.push(`- **Source**: ${lead.source}`);

  if (lead.companyData) {
    lines.push('', '### Company Data');
    if (lead.companyData.industry) lines.push(`- Industry: ${lead.companyData.industry}`);
    if (lead.companyData.size) lines.push(`- Size: ${lead.companyData.size}`);
    if (lead.companyData.revenue) lines.push(`- Revenue: ${lead.companyData.revenue}`);
    if (lead.companyData.location) lines.push(`- Location: ${lead.companyData.location}`);
  }

  if (lead.recentActivities && lead.recentActivities.length > 0) {
    lines.push('', '### Recent Activities');
    lead.recentActivities.forEach((activity, index) => {
      lines.push(`${index + 1}. ${activity}`);
    });
  }

  lines.push(
    '',
    '## Instructions',
    '',
    '1. Calculate the total score (0-100) based on the scoring framework',
    '2. Provide confidence level (0-1) based on data quality',
    '3. List each scoring factor with its contribution',
    '4. Determine the tier (HOT/WARM/COLD)',
    '5. Provide a brief recommendation for sales follow-up',
    '',
    'Respond with valid JSON only.'
  );

  return lines.join('\n');
}

/**
 * Qualification prompt for lead qualification agent
 */
export const QUALIFICATION_SYSTEM_PROMPT = `You are a seasoned sales qualification expert with 15+ years of experience in B2B sales.
You excel at analyzing lead data, identifying buying signals, and determining sales readiness.
You understand BANT (Budget, Authority, Need, Timeline) criteria and modern sales frameworks.
Your recommendations are data-driven, actionable, and focused on conversion optimization.

## BANT Framework

### Budget
- Does the prospect have budget allocated?
- Can they afford the solution?
- Is there budget authority?

### Authority
- Is this person a decision-maker?
- Who else is involved in the decision?
- What is their role in the buying process?

### Need
- Is there a clear business need?
- How urgent is the problem?
- What are the pain points?

### Timeline
- When do they need a solution?
- Are there any deadlines?
- What is driving the timeline?

Always provide structured, actionable recommendations.`;

export default {
  SCORING_SYSTEM_PROMPT,
  QUALIFICATION_SYSTEM_PROMPT,
  buildScoringPrompt,
  loadPrompt,
};
