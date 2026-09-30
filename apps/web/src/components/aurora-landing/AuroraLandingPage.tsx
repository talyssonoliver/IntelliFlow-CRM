import { Manrope } from 'next/font/google';
import { AuroraMotion } from './AuroraMotion';
import { SiteNav } from './sections/SiteNav';
import { StackStage } from './sections/StackStage';
import { ProofStrip } from './sections/ProofStrip';
import { ApprovalSection } from './sections/ApprovalSection';
import { PipelineSection } from './sections/PipelineSection';
import { ServiceSection } from './sections/ServiceSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { SecuritySection } from './sections/SecuritySection';
import { PricingSection } from './sections/PricingSection';
import { FaqSection } from './sections/FaqSection';
import { FinalCta } from './sections/FinalCta';
import { SiteFooter } from './sections/SiteFooter';
import './aurora-landing.css';

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
