import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JobDetailTemplate } from '@/components/shared/job-detail-template';
import { ApplicationForm } from '@/components/shared/application-form';
import { jobListings, type JobListing } from '@/data/job-listings';

// Get all job IDs for static generation
export function generateStaticParams() {
  return Object.keys(jobListings).map((id) => ({
    id,
  }));
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>): Promise<Metadata> {
  const { id } = await params;
  const job = jobListings[id];

  if (!job) {
    return {
      title: 'Job Not Found | IntelliFlow Careers',
    };
  }

  return {
    title: `${job.title} | IntelliFlow Careers`,
    description: job.description.slice(0, 160),
    openGraph: {
      title: `${job.title} at IntelliFlow`,
      description: job.description.slice(0, 160),
      type: 'website',
    },
  };
}

// Get related jobs (same department or type)
function getRelatedJobs(currentId: string, department: string): JobListing[] {
  return Object.values(jobListings)
    .filter((job) => job.id !== currentId && job.department === department)
    .slice(0, 3);
}

export default async function CareerDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const job = jobListings[id];

  if (!job) {
    notFound();
  }

  const relatedJobs = getRelatedJobs(id, job.department);
  const allPositions = Object.values(jobListings).map((j) => ({
    id: j.id,
    title: j.title,
  }));

  return (
    <main id="main-content" className="bg-white dark:bg-slate-900 min-h-screen">
      {/* Job Details */}
      <JobDetailTemplate job={job} relatedJobs={relatedJobs} />

      {/* Application Form Section */}
      <section
        id="apply"
        aria-labelledby="apply-heading"
        className="py-16 bg-white dark:bg-slate-900"
      >
        <div className="container px-4 lg:px-6 mx-auto max-w-3xl">
          <h2 id="apply-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Apply for {job.title}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            Ready to join IntelliFlow? Submit your application below and we&apos;ll be in touch
            within 5 business days.
          </p>
          <ApplicationForm positions={allPositions} />
        </div>
      </section>

      {/* Equal Opportunity Section */}
      <section className="py-12 bg-slate-50 dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-3xl text-center">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
            Equal Opportunity Employer
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            IntelliFlow is committed to creating a diverse and inclusive workplace. We welcome
            applications from all qualified candidates regardless of race, color, religion, gender,
            sexual orientation, national origin, age, disability, or veteran status.
          </p>
        </div>
      </section>
    </main>
  );
}
