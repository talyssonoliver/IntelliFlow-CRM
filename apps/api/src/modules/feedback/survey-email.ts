/**
 * The survey email (MVP-012): one short question and a link. The link carries the single-use token;
 * nothing else about the customer or the tenant beyond the company name is in the message. Every
 * interpolated value is HTML-escaped and the subject loses line breaks (no header injection).
 */
import { escapeHtml, stripLineBreaks } from '../../security/html-escape';
import type { SendableSurveyType } from './survey-scoring';

export interface SurveyEmailDetails {
  companyName: string;
  surveyType: SendableSurveyType;
  link: string;
  /** Where replies go: the user who sent it, when known. */
  replyTo?: string;
  recipientEmail: string;
}

export interface SurveyEmailMessage {
  to: string[];
  subject: string;
  htmlBody: string;
  textBody: string;
  replyTo?: string;
}

const QUESTIONS: Record<SendableSurveyType, (company: string) => string> = {
  NPS: (company) => `How likely are you to recommend ${company} to a friend or colleague?`,
  CSAT: (company) => `How satisfied are you with your recent experience with ${company}?`,
};

const SCALE_HINT: Record<SendableSurveyType, string> = {
  NPS: 'Pick a number from 0 (not at all likely) to 10 (extremely likely).',
  CSAT: 'Pick a number from 1 (very unhappy) to 5 (very happy).',
};

export function buildSurveyEmail(d: SurveyEmailDetails): SurveyEmailMessage {
  const company = stripLineBreaks(d.companyName);
  const question = QUESTIONS[d.surveyType](company);
  const hint = SCALE_HINT[d.surveyType];
  return {
    to: [d.recipientEmail],
    ...(d.replyTo ? { replyTo: d.replyTo } : {}),
    subject: `Quick question from ${company}`,
    textBody: [
      'Hello,',
      '',
      question,
      hint,
      '',
      `Answer here (it takes a few seconds): ${d.link}`,
      '',
      'The link works once and expires in 14 days.',
    ].join('\n'),
    htmlBody: [
      '<p>Hello,</p>',
      `<p><strong>${escapeHtml(question)}</strong></p>`,
      `<p>${escapeHtml(hint)}</p>`,
      `<p><a href="${escapeHtml(d.link)}">Answer in a few seconds</a></p>`,
      '<p>The link works once and expires in 14 days.</p>',
    ].join('\n'),
  };
}
