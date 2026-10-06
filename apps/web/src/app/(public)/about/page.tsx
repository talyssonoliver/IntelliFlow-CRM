import * as React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import teamData from '../../../data/team-data.json';
import { OG_IMAGES } from '@/lib/og-images';
import './about.css';

/**
 * About, in the Aurora design. The words are the team's own (owner ruling
 * 2026-10-01: rebrand only); only the name and the look change.
 */

export const metadata: Metadata = {
  title: 'About us',
  description:
    "Learn about Aurora's mission to build modern, AI-first CRM with governance-grade validation. Meet our team and discover our values.",
  openGraph: {
    images: OG_IMAGES,
    title: 'About Aurora: AI-first, governance-grade',
    description:
      'Founded in 2024. Aurora builds AI-first CRM that pairs automation with governance-grade validation. Meet the team building the future of CRM.',
    url: 'https://intelliflow-crm.com/about',
    siteName: 'Aurora',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Aurora: AI-first, governance-grade',
    description:
      'Our mission: AI-powered CRM with transparency and human oversight. Automation with integrity, evidence-driven decisions.',
  },
  alternates: {
    canonical: '/about',
  },
};

const VALUES: ReadonlyArray<{ icon: string; title: string; body: string }> = [
  {
    icon: 'verified',
    title: 'Automation with Integrity',
    body: 'We believe in AI-powered automation, but always with transparency. Every AI decision includes an explanation, confidence score, and human override capability.',
  },
  {
    icon: 'code',
    title: 'Developer-First Thinking',
    body: 'We build with modern technologies and developer-friendly workflows. Our stack is open, observable, and designed for teams that value quality code.',
  },
  {
    icon: 'analytics',
    title: 'Evidence-Driven Decisions',
    body: "We don't guess. We measure. Every feature includes metrics, every process has validation gates, and every decision is backed by data.",
  },
  {
    icon: 'favorite',
    title: 'Customer Success',
    body: 'We build tools teams actually want to use, not tolerate. Our success is measured by how much time we save our customers, not how many features we ship.',
  },
];

export default function AboutPage() {
  return (
    <div className="aurora-about">
      <section className="as-hero">
        <div className="as-wrap">
          <p className="as-eyebrow">About</p>
          <h1 className="as-h1">We&apos;re Building the Future of CRM</h1>
          <p className="as-lede">
            Modern, AI-first CRM that pairs automation with governance-grade validation
          </p>
          <p className="aab-chip">
            <span className="material-symbols-outlined" aria-hidden="true">
              rocket_launch
            </span>
            <span>Founded in 2024</span>
          </p>
        </div>
      </section>

      <section className="aab-section" aria-label="Mission and vision">
        <div className="as-wrap aab-two">
          <article className="as-card aab-card">
            <span className="material-symbols-outlined aab-icon" aria-hidden="true">
              auto_awesome
            </span>
            <h2>Our Mission</h2>
            <p>
              Our mission is to transform how teams manage customer relationships by providing
              modern, AI-first CRM that pairs automation with governance-grade validation, so teams
              can move fast without losing control.
            </p>
          </article>
          <article className="as-card aab-card">
            <span className="material-symbols-outlined aab-icon" aria-hidden="true">
              visibility
            </span>
            <h2>Our Vision</h2>
            <p>
              We envision a future where CRM systems augment human expertise rather than replace it,
              where automation is transparent and trustworthy, and where teams spend their time
              building relationships instead of updating databases.
            </p>
          </article>
        </div>
      </section>

      <section className="aab-section" aria-labelledby="values-heading">
        <div className="as-wrap">
          <div className="aab-head">
            <h2 id="values-heading" className="as-h2">
              Our Core Values
            </h2>
            <p>The principles that guide everything we build</p>
          </div>
          <ul className="aab-grid aab-values">
            {VALUES.map(({ icon, title, body }) => (
              <li key={title} className="as-card aab-card">
                <span className="material-symbols-outlined aab-icon" aria-hidden="true">
                  {icon}
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="aab-section" aria-labelledby="team-heading">
        <div className="as-wrap">
          <div className="aab-head">
            <h2 id="team-heading" className="as-h2">
              Meet the Team
            </h2>
            <p>The people building the future of CRM</p>
          </div>
          <ul className="aab-grid aab-team">
            {teamData.members.map((member) => (
              <li key={member.id} className="as-card aab-member">
                <img src={member.photo} alt={`${member.name}, ${member.role}`} />
                <h3>{member.name}</h3>
                <p className="aab-role">{member.role}</p>
                <p>{member.bio}</p>
                <div className="aab-social">
                  {member.socialLinks.linkedin && (
                    <a
                      href={member.socialLinks.linkedin}
                      aria-label={`${member.name} on LinkedIn`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        work
                      </span>
                    </a>
                  )}
                  {member.socialLinks.twitter && (
                    <a
                      href={member.socialLinks.twitter}
                      aria-label={`${member.name} on Twitter`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        tag
                      </span>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="aab-section" data-testid="cta-section" aria-labelledby="about-close">
        <div className="as-wrap">
          <div className="aab-close">
            <div className="aab-close-art" aria-hidden="true">
              <img src="/brand/aurora/bg/ribbon-right.webp" alt="" />
            </div>
            <h2 id="about-close">Ready to Transform Your Sales?</h2>
            <p>Join modern sales teams using Aurora. Start your free 14-day trial today.</p>
            <div className="aab-close-cta">
              <Link href="/signup" className="as-btn as-btn-primary">
                Start Free Trial
              </Link>
              <Link href="/contact" className="as-btn as-btn-onDark">
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
