import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JobDetailTemplate, type JobListing } from '@/components/shared/job-detail-template';
import { ApplicationForm } from '@/components/shared/application-form';

// Full job listings data (in production, fetch from CMS/API)
const jobListings: Record<string, JobListing> = {
  'sr-fullstack-eng': {
    id: 'sr-fullstack-eng',
    title: 'Senior Full-Stack Engineer',
    department: 'Engineering',
    location: 'Remote (UK/EU)',
    type: 'Full-time',
    description:
      'We are looking for a Senior Full-Stack Engineer to join our core platform team. You will work on building and scaling our Next.js/tRPC platform with a focus on type safety, performance, and AI integration. This is a hands-on role where you will have significant impact on the architecture and technical direction of IntelliFlow.',
    responsibilities: [
      'Design and implement new features across the full stack using TypeScript, Next.js, and tRPC',
      'Lead technical design discussions and make architectural decisions',
      'Mentor junior engineers and conduct code reviews',
      'Collaborate with product and design teams to deliver excellent user experiences',
      'Improve system reliability, performance, and observability',
      'Contribute to our open-source tools and developer documentation',
    ],
    requirements: [
      '5+ years of professional software engineering experience',
      'Strong proficiency in TypeScript and React',
      'Experience with Node.js backend development',
      'Familiarity with tRPC, Prisma, or similar type-safe tools',
      'Understanding of DDD and clean architecture principles',
      'Experience with PostgreSQL or similar relational databases',
      'Strong communication skills and ability to work in a remote team',
    ],
    niceToHave: [
      'Experience with AI/ML integrations (LangChain, OpenAI)',
      'Contributions to open-source projects',
      'Experience with Supabase or Firebase',
      'Background in enterprise SaaS products',
      'Experience with observability tools (OpenTelemetry, Grafana)',
    ],
    benefits: [
      'Competitive salary + equity',
      'Remote-first culture',
      'Flexible working hours',
      'Learning & development budget',
      'Health insurance',
      'Home office setup allowance',
      '25+ days PTO',
      'Team offsites 2x/year',
    ],
    salary: { min: 90000, max: 130000, currency: 'GBP' },
    postedAt: '2025-12-15',
  },
  'ai-engineer': {
    id: 'ai-engineer',
    title: 'AI/ML Engineer',
    department: 'AI & Intelligence',
    location: 'Remote (Global)',
    type: 'Full-time',
    description:
      'Join our AI team to design and implement intelligent features that power IntelliFlow\'s AI-first CRM. You will work on lead scoring, predictive analytics, RAG-based assistants, and other ML-powered features. We prioritize responsible AI with human oversight built into every system.',
    responsibilities: [
      'Design and implement AI features including lead scoring and predictive analytics',
      'Build and maintain RAG-based AI assistants using LangChain',
      'Develop evaluation frameworks for AI model quality and safety',
      'Collaborate with product team to identify AI opportunities',
      'Implement human-in-the-loop workflows for AI oversight',
      'Monitor and improve AI system performance and costs',
    ],
    requirements: [
      '3+ years of ML/AI engineering experience',
      'Strong experience with LangChain, OpenAI API, or similar LLM frameworks',
      'Proficiency in Python and TypeScript',
      'Experience building production ML systems',
      'Understanding of AI safety and responsible AI practices',
      'Familiarity with vector databases (Pinecone, pgvector)',
    ],
    niceToHave: [
      'Experience with fine-tuning LLMs',
      'Background in NLP or information retrieval',
      'Experience with AI governance frameworks (ISO 42001)',
      'Publications or open-source AI contributions',
      'Experience with multi-agent systems (CrewAI)',
    ],
    benefits: [
      'Competitive salary + equity',
      'Remote-first culture',
      'GPU compute budget for experiments',
      'Conference attendance budget',
      'Health insurance',
      'Flexible hours across timezones',
      '25+ days PTO',
      'Direct access to frontier AI models',
    ],
    salary: { min: 100000, max: 150000, currency: 'USD' },
    postedAt: '2025-12-10',
  },
  'product-designer': {
    id: 'product-designer',
    title: 'Product Designer',
    department: 'Design',
    location: 'London, UK',
    type: 'Full-time',
    description:
      'We\'re looking for a Product Designer to shape the user experience of our AI-first CRM. You will balance automation with human oversight, ensuring users stay in control while benefiting from AI assistance. This role involves end-to-end design work from research to production handoff.',
    responsibilities: [
      'Lead end-to-end design for new features and product areas',
      'Conduct user research and usability testing',
      'Create wireframes, prototypes, and high-fidelity designs',
      'Collaborate closely with engineering on implementation',
      'Maintain and evolve our design system',
      'Advocate for accessibility and inclusive design',
    ],
    requirements: [
      '4+ years of product design experience',
      'Strong portfolio demonstrating B2B SaaS work',
      'Expert-level Figma skills',
      'Experience with design systems',
      'Knowledge of WCAG accessibility guidelines',
      'Experience with user research methods',
    ],
    niceToHave: [
      'Experience designing AI-powered products',
      'Background in CRM or sales tools',
      'Motion design skills',
      'Frontend development experience',
      'Experience with governance or compliance products',
    ],
    benefits: [
      'Competitive salary + equity',
      'Hybrid work (2 days/week in London office)',
      'Latest design tools and hardware',
      'Conference and workshop budget',
      'Health & dental insurance',
      'WeWork membership',
      '25+ days PTO',
      'Design team socials',
    ],
    salary: { min: 70000, max: 95000, currency: 'GBP' },
    postedAt: '2025-12-18',
  },
  'devrel-engineer': {
    id: 'devrel-engineer',
    title: 'Developer Relations Engineer',
    department: 'Developer Experience',
    location: 'Remote (US/EU)',
    type: 'Full-time',
    description:
      'Help developers succeed with IntelliFlow by creating technical content, improving documentation, and building developer community. You will work at the intersection of engineering and developer advocacy, ensuring our APIs and SDKs are world-class.',
    responsibilities: [
      'Create technical tutorials, guides, and video content',
      'Build sample applications and integrations',
      'Engage with developer community on Discord and GitHub',
      'Improve API documentation and developer experience',
      'Represent IntelliFlow at conferences and meetups',
      'Gather feedback from developers to improve products',
    ],
    requirements: [
      '3+ years in DevRel, technical writing, or software engineering',
      'Strong technical writing and communication skills',
      'Experience with API documentation (OpenAPI, Docusaurus)',
      'Ability to write code in TypeScript/JavaScript',
      'Public speaking experience (meetups, podcasts, videos)',
      'Active presence in developer communities',
    ],
    niceToHave: [
      'Experience with CRM or sales automation tools',
      'YouTube or technical blogging following',
      'Experience organizing developer events',
      'Background in AI/ML developer tools',
      'Multi-language skills (code or spoken)',
    ],
    benefits: [
      'Competitive salary + equity',
      'Remote-first culture',
      'Conference travel budget',
      'Content creation equipment budget',
      'Health insurance',
      'Flexible schedule',
      '25+ days PTO',
      'Co-working space membership',
    ],
    salary: { min: 85000, max: 120000, currency: 'USD' },
    postedAt: '2025-12-12',
  },
  'security-engineer': {
    id: 'security-engineer',
    title: 'Security Engineer',
    department: 'Platform',
    location: 'Remote (UK/EU)',
    type: 'Full-time',
    description:
      'Ensure IntelliFlow meets enterprise security standards with a focus on zero-trust architecture. You will work across the stack to identify vulnerabilities, implement security controls, and ensure compliance with SOC 2, GDPR, and ISO standards.',
    responsibilities: [
      'Design and implement security controls across the platform',
      'Conduct security reviews and threat modeling',
      'Manage vulnerability scanning and penetration testing',
      'Lead SOC 2 and ISO 27001 compliance efforts',
      'Implement and maintain secrets management (HashiCorp Vault)',
      'Build security into CI/CD pipelines',
    ],
    requirements: [
      '4+ years of security engineering experience',
      'Experience with cloud security (AWS or GCP)',
      'Knowledge of SOC 2, GDPR, and ISO 27001 requirements',
      'Experience with penetration testing and vulnerability assessment',
      'Familiarity with zero-trust architecture principles',
      'Strong understanding of authentication and authorization',
    ],
    niceToHave: [
      'Experience with AI/ML security considerations',
      'Security certifications (CISSP, CEH, OSCP)',
      'Experience with Supabase or PostgreSQL security',
      'Background in multi-tenant SaaS security',
      'Bug bounty program experience',
    ],
    benefits: [
      'Competitive salary + equity',
      'Remote-first culture',
      'Security certification budget',
      'Conference attendance',
      'Health insurance',
      'Home office setup',
      '25+ days PTO',
      'Security team training events',
    ],
    salary: { min: 80000, max: 110000, currency: 'GBP' },
    postedAt: '2025-12-20',
  },
};

// Get all job IDs for static generation
export function generateStaticParams() {
  return Object.keys(jobListings).map((id) => ({
    id,
  }));
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
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
    .filter(job => job.id !== currentId && job.department === department)
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
  const allPositions = Object.values(jobListings).map(j => ({
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
          <h2
            id="apply-heading"
            className="text-2xl font-bold text-slate-900 dark:text-white mb-2"
          >
            Apply for {job.title}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-8">
            Ready to join IntelliFlow? Submit your application below and we&apos;ll
            be in touch within 5 business days.
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
            IntelliFlow is committed to creating a diverse and inclusive workplace.
            We welcome applications from all qualified candidates regardless of race,
            color, religion, gender, sexual orientation, national origin, age,
            disability, or veteran status.
          </p>
        </div>
      </section>
    </main>
  );
}
