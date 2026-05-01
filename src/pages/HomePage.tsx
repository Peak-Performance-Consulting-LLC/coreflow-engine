import { FeaturesSection } from '../components/home/FeaturesSection';
import { FinalCtaSection } from '../components/home/FinalCtaSection';
import { HeroSection } from '../components/home/HeroSection';
import { HomeFooter } from '../components/home/HomeFooter';
import { HomeNavbar } from '../components/home/HomeNavbar';
import { HowItWorksSection } from '../components/home/HowItWorksSection';
import { PricingSection } from '../components/home/PricingSection';
import { SocialProofSection } from '../components/home/SocialProofSection';
import { TestimonialsSection } from '../components/home/TestimonialsSection';

export function HomePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#c7d2fe_0%,_#e2e8f0_34%,_#f8fafc_62%,_#eef2ff_100%)]">
      <HomeNavbar />
      <HeroSection />
      <SocialProofSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <TestimonialsSection />
      <FinalCtaSection />
      <HomeFooter />
    </div>
  );
}
