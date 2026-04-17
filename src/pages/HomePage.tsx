import { FeaturesSection } from '../components/home/FeaturesSection';
import { FinalCtaSection } from '../components/home/FinalCtaSection';
import { HeroSection } from '../components/home/HeroSection';
import { HomeFooter } from '../components/home/HomeFooter';
import { HomeNavbar } from '../components/home/HomeNavbar';
import { HowItWorksSection } from '../components/home/HowItWorksSection';
import { IndustryModesSection } from '../components/home/IndustryModesSection';
import { TestimonialsSection } from '../components/home/TestimonialsSection';
import { TrustedBySection } from '../components/home/TrustedBySection';

export function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-slate-50/40 to-slate-100/60">
      <HomeNavbar />
      <HeroSection />
      <TrustedBySection />
      <FeaturesSection />
      <IndustryModesSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <FinalCtaSection />
      <HomeFooter />
    </div>
  );
}
