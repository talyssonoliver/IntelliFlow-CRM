import * as React from 'react';
import Link from 'next/link';
import { Button, Card } from '@intelliflow/ui';
import teamData from '../../../data/team-data.json';

export const metadata = {
  title: 'About Us - Modern AI-First CRM | IntelliFlow',
  description:
    "Learn about IntelliFlow CRM's mission to build modern, AI-first CRM with governance-grade validation. Meet our team and discover our values.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-[#f6f7f8] dark:from-[#1e2936] dark:to-[#101922] py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
              We're Building the Future of CRM
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
              Modern, AI-first CRM that pairs automation with governance-grade
              validation
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-full">
              <span className="material-symbols-outlined text-[#137fec] text-sm">
                rocket_launch
              </span>
              <span className="text-sm font-medium text-[#137fec]">
                Founded in 2024
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision Section */}
      <section className="py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Mission Card */}
            <Card className="p-8">
              <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-[#137fec]">
                  auto_awesome
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Our Mission
              </h2>
              <p className="text-base text-slate-600 dark:text-slate-400">
                Our mission is to transform how teams manage customer
                relationships by providing modern, AI-first CRM that pairs
                automation with governance-grade validation, so teams can move
                fast without losing control.
              </p>
            </Card>

            {/* Vision Card */}
            <Card className="p-8">
              <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-[#137fec]">
                  visibility
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">
                Our Vision
              </h2>
              <p className="text-base text-slate-600 dark:text-slate-400">
                We envision a future where CRM systems augment human expertise
                rather than replace it, where automation is transparent and
                trustworthy, and where teams spend their time building
                relationships instead of updating databases.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Core Values Section */}
      <section className="py-16 lg:py-24 bg-slate-50 dark:bg-slate-900">
        <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Our Core Values
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-400">
              The principles that guide everything we build
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {/* Value 1: Automation with Integrity */}
            <Card className="p-6 hover:border-[#137fec] hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-[#137fec]">
                  verified
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Automation with Integrity
              </h3>
              <p className="text-base text-slate-600 dark:text-slate-400">
                We believe in AI-powered automation, but always with
                transparency. Every AI decision includes an explanation,
                confidence score, and human override capability.
              </p>
            </Card>

            {/* Value 2: Developer-First Thinking */}
            <Card className="p-6 hover:border-[#137fec] hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-[#137fec]">
                  code
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Developer-First Thinking
              </h3>
              <p className="text-base text-slate-600 dark:text-slate-400">
                We build with modern technologies and developer-friendly
                workflows. Our stack is open, observable, and designed for
                teams that value quality code.
              </p>
            </Card>

            {/* Value 3: Evidence-Driven Decisions */}
            <Card className="p-6 hover:border-[#137fec] hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-[#137fec]">
                  analytics
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Evidence-Driven Decisions
              </h3>
              <p className="text-base text-slate-600 dark:text-slate-400">
                We don't guess—we measure. Every feature includes metrics,
                every process has validation gates, and every decision is
                backed by data.
              </p>
            </Card>

            {/* Value 4: Customer Success */}
            <Card className="p-6 hover:border-[#137fec] hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-2xl text-[#137fec]">
                  favorite
                </span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Customer Success
              </h3>
              <p className="text-base text-slate-600 dark:text-slate-400">
                We build tools teams actually want to use, not tolerate. Our
                success is measured by how much time we save our customers, not
                how many features we ship.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-16 lg:py-24">
        <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              Meet the Team
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-400">
              The people building the future of CRM
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {teamData.members.map((member) => (
              <Card key={member.id} className="p-6 text-center">
                {/* Circular photo */}
                <div className="w-32 h-32 rounded-full overflow-hidden mx-auto mb-4 ring-2 ring-[#137fec]/20">
                  <img
                    src={member.photo}
                    alt={`${member.name}, ${member.role}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  {member.name}
                </h3>
                <p className="text-sm text-[#137fec] mb-3">{member.role}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  {member.bio}
                </p>

                {/* Social links */}
                <div className="flex items-center justify-center gap-2">
                  {member.socialLinks.linkedin && (
                    <a
                      href={member.socialLinks.linkedin}
                      className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
                      aria-label={`${member.name} on LinkedIn`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined text-xl">
                        work
                      </span>
                    </a>
                  )}
                  {member.socialLinks.twitter && (
                    <a
                      href={member.socialLinks.twitter}
                      className="text-slate-600 dark:text-slate-400 hover:text-[#137fec] dark:hover:text-[#137fec] transition-colors"
                      aria-label={`${member.name} on Twitter`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined text-xl">
                        tag
                      </span>
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section
        data-testid="cta-section"
        className="py-16 lg:py-24 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]"
      >
        <div className="container px-4 lg:px-6 mx-auto max-w-4xl text-center">
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
            Ready to Transform Your Sales?
          </h2>
          <p className="text-lg text-white/90 mb-8">
            Join modern sales teams using IntelliFlow CRM. Start your free
            14-day trial today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-white text-[#137fec] hover:bg-white/90 min-w-[200px]"
            >
              <Link href="/sign-up">Start Free Trial</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white text-white hover:bg-white/10 min-w-[200px]"
            >
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
