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
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8fc]">
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
