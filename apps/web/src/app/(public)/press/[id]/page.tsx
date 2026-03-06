import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import pressData from '@/data/press-releases.json';
import { PressReleaseDetail } from '@/components/press/PressReleaseDetail';
import type { PressRelease } from '@/components/press/PressReleaseDetail';

const releases = pressData.releases as PressRelease[];
const releaseMap: Record<string, PressRelease> = {};
for (const release of releases) {
  releaseMap[release.id] = release;
}

export function generateStaticParams() {
  return releases.map((r) => ({ id: r.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const release = releaseMap[id];

  if (!release) {
    return {
      title: 'Press Release Not Found | IntelliFlow CRM',
    };
  }

  return {
    title: `${release.title} | IntelliFlow Press`,
    description: release.summary,
    openGraph: {
      title: `${release.title} | IntelliFlow Press`,
      description: release.summary,
      url: `https://intelliflow-crm.com/press/${release.id}`,
      siteName: 'IntelliFlow CRM',
      type: 'article',
      publishedTime: release.date,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${release.title} | IntelliFlow Press`,
      description: release.summary,
    },
  };
}

export default async function PressReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = releaseMap[id];

  if (!release) {
    notFound();
  }

  const relatedReleases = releases.filter((r) => r.id !== id).slice(0, 3);

  const pressContact = {
    name: pressData.pressContact.name,
    email: pressData.pressContact.email,
    phone: pressData.pressContact.phone,
  };

  return (
    <PressReleaseDetail
      release={release}
      relatedReleases={relatedReleases}
      pressContact={pressContact}
    />
  );
}
