/**
 * Public survey answer page (MVP-012): /feedback/<token>, opened from the survey email.
 *
 * Server shell only: the scale and the comment box are the FeedbackAnswerContent client component,
 * which talks to the publicSurvey tRPC router. Never indexed, and the title is generic so the response
 * reveals nothing about whether a link is real.
 */
import type { Metadata } from 'next';
import FeedbackAnswerContent from './FeedbackAnswerContent';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Quick question',
    robots: { index: false, follow: false },
  };
}

export default async function FeedbackAnswerPage({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  return <FeedbackAnswerContent token={token} />;
}
