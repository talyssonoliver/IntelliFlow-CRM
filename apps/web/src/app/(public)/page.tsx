import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-32">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              AI-Powered CRM for{' '}
              <span className="text-primary">Intelligent Sales</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Automate lead scoring, streamline your pipeline, and close deals faster
              with machine learning insights built directly into your workflow.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/signup"
                className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
              >
                Start Free Trial
              </Link>
              <Link
                href="/features"
                className="rounded-md border px-6 py-3 text-sm font-semibold hover:bg-accent transition-colors"
              >
                See Features
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight mb-12">
            Everything you need to grow
          </h2>
          <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
            <FeatureCard
              title="AI Lead Scoring"
              description="Automatically score and prioritize leads using advanced machine learning models."
            />
            <FeatureCard
              title="Smart Pipeline"
              description="Visual deal pipeline with AI-powered insights and automated follow-up reminders."
            />
            <FeatureCard
              title="Analytics & Forecasting"
              description="Real-time analytics with predictive forecasting to guide your sales strategy."
            />
            <FeatureCard
              title="Email Automation"
              description="AI-composed emails with optimal send-time detection and engagement tracking."
            />
            <FeatureCard
              title="Contact Intelligence"
              description="Relationship mapping and enrichment to understand your contacts deeply."
            />
            <FeatureCard
              title="Workflow Engine"
              description="Automate repetitive tasks with a visual workflow builder powered by AI agents."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Ready to transform your sales process?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join teams using IntelliFlow to close more deals with less effort.
          </p>
          <Link
            href="/signup"
            className="inline-flex rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <div className="h-5 w-5 rounded bg-primary/20" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
