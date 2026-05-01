import { CircleHelp, FileStack, Gavel, Gem, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { LogoMark } from '../ui/LogoMark';

export function HomeFooter() {
  return (
    <footer
      id="contact"
      className="relative mt-20 overflow-hidden border-t border-white/10 py-16 text-slate-300"
      style={{
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        background:
          'radial-gradient(circle at 20% 10%, rgba(99,102,241,0.18), transparent 28%), radial-gradient(circle at 80% 0%, rgba(139,92,246,0.14), transparent 30%), linear-gradient(180deg, #111827 0%, #0f172a 55%, #090f1f 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/50 to-transparent" />
      <div className="pointer-events-none absolute -left-20 top-16 h-56 w-56 rounded-full bg-indigo-400/12 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-24 h-56 w-56 rounded-full bg-violet-400/12 blur-3xl" />

      <div className="relative mx-auto w-full max-w-[1120px] px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.24)] transition duration-200 hover:scale-[1.02]">
              <LogoMark theme="dark" />
            </div>
            <p className="mt-5 max-w-xs text-sm leading-6 text-slate-400">
              The premium CRM and AI operations platform for service businesses and fast-moving teams.
            </p>
            <p className="mt-4 text-sm text-slate-400">No credit card required · Secure workspace · Fast onboarding</p>
          </div>

          <div className="grid gap-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="inline-flex items-center gap-2 font-semibold text-slate-50">
                <FileStack className="h-4 w-4 text-indigo-200" />
                <span>Product</span>
              </p>
              <div className="mt-3 space-y-2 text-slate-400">
                <a href="#features" className="inline-flex items-center gap-2 transition duration-200 hover:translate-x-0.5 hover:text-white">
                  <FileStack className="h-3.5 w-3.5 text-slate-500" />
                  <span>Features</span>
                </a>
                <a href="#how-it-works" className="inline-flex items-center gap-2 transition duration-200 hover:translate-x-0.5 hover:text-white">
                  <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                  <span>How It Works</span>
                </a>
                <a href="#proof" className="inline-flex items-center gap-2 transition duration-200 hover:translate-x-0.5 hover:text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                  <span>Social Proof</span>
                </a>
              </div>
            </div>

            <div>
              <p className="inline-flex items-center gap-2 font-semibold text-slate-50">
                <Users className="h-4 w-4 text-indigo-200" />
                <span>Company</span>
              </p>
              <div className="mt-3 space-y-2 text-slate-400">
                <a href="#testimonials" className="inline-flex items-center gap-2 transition duration-200 hover:translate-x-0.5 hover:text-white">
                  <Users className="h-3.5 w-3.5 text-slate-500" />
                  <span>Customers</span>
                </a>
                <a href="#pricing" className="inline-flex items-center gap-2 transition duration-200 hover:translate-x-0.5 hover:text-white">
                  <Gem className="h-3.5 w-3.5 text-slate-500" />
                  <span>Pricing</span>
                </a>
                <a href="#faq" className="inline-flex items-center gap-2 transition duration-200 hover:translate-x-0.5 hover:text-white">
                  <CircleHelp className="h-3.5 w-3.5 text-slate-500" />
                  <span>FAQ</span>
                </a>
              </div>
            </div>

            <div>
              <p className="inline-flex items-center gap-2 font-semibold text-slate-50">
                <Gavel className="h-4 w-4 text-indigo-200" />
                <span>Legal</span>
              </p>
              <div className="mt-3 space-y-2 text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <Gavel className="h-3.5 w-3.5 text-slate-500" />
                  <span>Terms</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                  <span>Privacy</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <CircleHelp className="h-3.5 w-3.5 text-slate-500" />
                  <span>Cookies</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-10 pt-7 text-xs text-slate-500">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          (c) 2026 CoreFlow. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
