import { Manrope } from 'next/font/google';
// aurora-landing.css imported FIRST, before any section's own CSS: this repo's
// bundler orders injected stylesheets by import position, so a shared base
// rule and a section's override of it (e.g. .integrations vs the section's
// own .integrations.aurora-integrations) must never end up tied on both
// specificity and source order. Importing the shared file first means a
// section's own CSS always lands later in the cascade, so a section can
// override a shared rule with an equal-specificity compound selector and
// win, as every section's CLAUDE.md-documented pattern already assumes.
import './aurora-landing.css';
import './aurora-motion-system.css';
import { AuroraMotion } from './AuroraMotion';
import { SiteNav } from './sections/SiteNav';
import { StackStage } from './sections/StackStage';
import { ProofStrip } from './sections/ProofStrip';
import { ApprovalSection } from './sections/ApprovalSection';
import { PipelineSection } from './sections/PipelineSection';
import { ServiceSection } from './sections/ServiceSection';
import { InboxCalendarSection } from './sections/InboxCalendarSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { SecuritySection } from './sections/SecuritySection';
import { PricingSection } from './sections/PricingSection';
import { FaqSection } from './sections/FaqSection';
import { FinalCta } from './sections/FinalCta';
import { SiteFooter } from './sections/SiteFooter';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

/**
 * The Aurora landing page (preview). Server-rendered markup; AuroraMotion wires the
 * stack walkthrough and the product scenes onto it once it is on the client.
 * Every product panel shows a labelled sample workspace, never customer data.
 */
export function AuroraLandingPage() {
  return (
    <div id="aurora-page" className={`aurora-page boot ${manrope.variable}`}>
      <SiteNav />
      <main id="aurora-main" tabIndex={-1}>
        <StackStage />
        <ProofStrip />
        <ApprovalSection />
        <PipelineSection />
        <ServiceSection />
        <InboxCalendarSection />
        <IntegrationsSection />
        <SecuritySection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </main>
      <SiteFooter />
      <AuroraMotion />
    </div>
  );
}
