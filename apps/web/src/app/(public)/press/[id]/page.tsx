import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import pressData from '@/data/press-releases.json';
import { PressReleaseDetail } from '@/components/press/PressReleaseDetail';
import type { PressRelease } from '@/components/press/PressReleaseDetail';
import { OG_IMAGES } from '@/lib/og-images';

const releases = pressData.releases as PressRelease[];
const releaseMap: Record<string, PressRelease> = {};
for (const release of releases) {
  releaseMap[release.id] = release;
}

// Only published releases have pages; any other id is a plain 404 rather than an
// on-demand render.
export const dynamicParams = false;

export function generateStaticParams() {
  return releases.map((r) => ({ id: r.id }));
}

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>): Promise<Metadata> {
  const { id } = await params;
  const release = releaseMap[id];

  if (!release) {
    return {
      title: 'Press Release Not Found',
    };
  }

  return {
    title: { absolute: `${release.title} | Aurora Press` },
    description: release.summary,
    openGraph: {
      images: OG_IMAGES,
      title: `${release.title} | Aurora Press`,
      description: release.summary,
      url: `https://intelli-flow-crm-web.vercel.app/press/${release.id}`,
      siteName: 'Aurora',
      type: 'article',
      publishedTime: release.date,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${release.title} | Aurora Press`,
      description: release.summary,
    },
  };
}

export default async function PressReleasePage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const release = releaseMap[id];

  if (!release) {
    notFound();
  }

  const relatedReleases = releases.filter((r) => r.id !== id).slice(0, 3);

  // The same public address the contact page uses; no phone line is published.
  const pressContact = {
    name: 'Aurora',
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'crm@leangency.com',
  };

  return (
    <PressReleaseDetail
      release={release}
      relatedReleases={relatedReleases}
      pressContact={pressContact}
    />
  );
}
