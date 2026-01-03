import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@intelliflow/ui';
import { ApplicationForm } from '@/components/shared/application-form';

export const metadata: Metadata = {
  title: 'Careers | IntelliFlow CRM',
  description: 'Join the team building the future of AI-powered CRM. Explore open positions at IntelliFlow.',
  openGraph: {
    title: 'Careers at IntelliFlow CRM',
    description: 'Build the future of AI-first customer relationship management. View open positions.',
    type: 'website',
  },
};

// Job listings (in production, would come from API/CMS)
const jobListings = [
  {
    id: 'sr-fullstack-eng',
    title: 'Senior Full-Stack Engineer',
    department: 'Engineering',
    location: 'Remote (UK/EU)',
    type: 'Full-time',
    description: 'Build and scale our Next.js/tRPC platform with a focus on type safety, performance, and AI integration.',
    requirements: [
      '5+ years full-stack experience',
      'Strong TypeScript/React expertise',
      'Experience with tRPC, Prisma, or similar',
      'Understanding of DDD and clean architecture',
    ],
  },
  {
    id: 'ai-engineer',
    title: 'AI/ML Engineer',
    department: 'AI & Intelligence',
    location: 'Remote (Global)',
    type: 'Full-time',
    description: 'Design and implement AI features including lead scoring, predictive analytics, and RAG-based assistants.',
    requirements: [
      '3+ years ML/AI experience',
      'Experience with LangChain, OpenAI, or similar',
      'Strong Python and TypeScript skills',
      'Understanding of AI safety and governance',
    ],
  },
  {
    id: 'product-designer',
    title: 'Product Designer',
    department: 'Design',
    location: 'London, UK',
    type: 'Full-time',
    description: 'Shape the user experience of our AI-first CRM, balancing automation with human oversight.',
    requirements: [
      '4+ years product design experience',
      'Strong Figma and prototyping skills',
      'Experience with B2B SaaS products',
      'WCAG accessibility knowledge',
    ],
  },
  {
    id: 'devrel-engineer',
    title: 'Developer Relations Engineer',
    department: 'Developer Experience',
    location: 'Remote (US/EU)',
    type: 'Full-time',
    description: 'Build developer community, create technical content, and improve our API documentation.',
    requirements: [
      '3+ years in DevRel or software engineering',
      'Strong technical writing skills',
      'Experience with API documentation',
      'Public speaking experience a plus',
    ],
  },
  {
    id: 'security-engineer',
    title: 'Security Engineer',
    department: 'Platform',
    location: 'Remote (UK/EU)',
    type: 'Full-time',
    description: 'Ensure our platform meets enterprise security standards with focus on zero-trust architecture.',
    requirements: [
      '4+ years security engineering',
      'Experience with cloud security (AWS/GCP)',
      'Knowledge of SOC2, GDPR compliance',
      'Penetration testing experience',
    ],
  },
];

const benefits = [
  {
    icon: 'home',
    title: 'Remote-First',
    description: 'Work from anywhere. We trust our team to deliver without micromanagement.',
  },
  {
    icon: 'health_and_safety',
    title: 'Comprehensive Health',
    description: 'Full medical, dental, and vision coverage for you and your family.',
  },
  {
    icon: 'school',
    title: 'Learning Budget',
    description: 'Annual budget for courses, conferences, and professional development.',
  },
  {
    icon: 'flight',
    title: 'Flexible PTO',
    description: 'Unlimited vacation with a minimum of 25 days per year encouraged.',
  },
  {
    icon: 'trending_up',
    title: 'Equity Package',
    description: 'Meaningful equity stake so you share in our success.',
  },
  {
    icon: 'devices',
    title: 'Equipment Budget',
    description: 'Top-tier equipment and home office setup allowance.',
  },
];

const values = [
  {
    title: 'Ship with evidence',
    description: 'We believe in governance-ready releases. Every feature ships with audit trails, tests, and performance proof.',
  },
  {
    title: 'Automation with safeguards',
    description: 'AI is powerful but needs oversight. We build automation that keeps humans in control.',
  },
  {
    title: 'Accessible by default',
    description: 'WCAG compliance isn\'t an afterthought. We design for everyone from day one.',
  },
];

export default function CareersPage() {
  return (
    <main id="main-content" className="bg-slate-50 dark:bg-slate-900 min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#0f172a] via-[#0d1b2a] to-[#0b1f37] text-white py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-auto">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full text-[#7cc4ff] font-medium backdrop-blur mb-6">
              <span className="material-symbols-outlined text-base" aria-hidden="true">groups</span>
              <span>We&apos;re hiring</span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold mb-4">
              Build the future of AI-first CRM
            </h1>
            <p className="text-lg text-slate-200">
              Join a team that believes automation should be governed, accessible, and human-centered.
              We&apos;re solving hard problems at the intersection of AI, sales, and enterprise software.
            </p>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section aria-labelledby="values-heading" className="py-16 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-auto">
          <h2 id="values-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-8">
            What we believe
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((value) => (
              <div key={value.title} className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {value.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section aria-labelledby="positions-heading" className="py-16">
        <div className="container px-4 lg:px-6 mx-auto max-w-auto">
          <h2 id="positions-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Open Positions
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            {jobListings.length} open roles across our teams
          </p>

          <div className="space-y-4">
            {jobListings.map((job) => (
              <Card
                key={job.id}
                className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-[#137fec] transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {job.title}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#137fec]/10 text-[#137fec]">
                        {job.department}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-sm">
                      {job.description}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-base" aria-hidden="true">location_on</span>
                        <span>{job.location}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-base" aria-hidden="true">schedule</span>
                        <span>{job.type}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Link
                      href={`#apply-${job.id}`}
                      className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-[#137fec] text-white font-medium hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2"
                    >
                      <span>Apply Now</span>
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_forward</span>
                    </Link>
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-[#137fec] hover:underline">
                    View requirements
                  </summary>
                  <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    {job.requirements.map((req) => (
                      <li key={req} className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-base text-[#137fec] mt-0.5" aria-hidden="true">check_circle</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section aria-labelledby="benefits-heading" className="py-16 bg-white dark:bg-slate-800">
        <div className="container px-4 lg:px-6 mx-auto max-w-auto">
          <h2 id="benefits-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-8">
            Benefits & Perks
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="flex items-start gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900"
              >
                <div className="w-10 h-10 rounded-lg bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-xl text-[#137fec]" aria-hidden="true">{benefit.icon}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">
                    {benefit.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application Form Section */}
      <section id="apply" aria-labelledby="apply-heading" className="py-16">
        <div className="container px-4 lg:px-6 mx-auto max-w-3xl">
          <h2 id="apply-heading" className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Apply to IntelliFlow
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            Don&apos;t see the perfect role? We&apos;re always looking for exceptional talent.
            Send us your details and we&apos;ll be in touch.
          </p>
          <ApplicationForm positions={jobListings.map(j => ({ id: j.id, title: j.title }))} />
        </div>
      </section>
    </main>
  );
}
