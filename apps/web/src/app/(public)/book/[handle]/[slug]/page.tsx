/**
 * Public booking page — PG-203 (owner rulings Q1/Q3/Q7, ADR-083).
 *
 * /book/<firm booking handle>/<event type slug>. Server shell only: the
 * booking flow is the BookingContent client component, which talks to the
 * publicBooking tRPC router. The page is never indexed, and its title is
 * generic so the response reveals nothing about whether a handle exists.
 */
import type { Metadata } from 'next';
import BookingContent from './BookingContent';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Book an appointment',
    robots: { index: false, follow: false },
  };
}

export default async function BookPage({
  params,
}: Readonly<{ params: Promise<{ handle: string; slug: string }> }>) {
  const { handle, slug } = await params;
  return <BookingContent handle={handle} slug={slug} />;
}
