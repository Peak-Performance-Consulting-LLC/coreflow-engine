import { LogoMark } from '../ui/LogoMark';

export function HomeFooter() {
  return (
    <footer id="contact" className="bg-slate-950 py-12 text-slate-300">
      <div className="section-shell grid gap-8 md:grid-cols-[1.3fr_2fr]">
        <div>
          <LogoMark theme="dark" />
          <p className="mt-4 max-w-xs text-sm leading-6 text-slate-400">
            The modern CRM and AI operations platform for service businesses and fast-moving teams.
          </p>
        </div>

        <div className="grid gap-8 text-sm sm:grid-cols-3">
          <div>
            <p className="font-semibold text-white">Product</p>
            <div className="mt-3 space-y-2 text-slate-400">
              <a href="#features" className="block transition hover:text-white">
                Features
              </a>
              <a href="#industries" className="block transition hover:text-white">
                Industries
              </a>
              <a href="#voice-highlight" className="block transition hover:text-white">
                Voice Ops
              </a>
            </div>
          </div>

          <div>
            <p className="font-semibold text-white">Company</p>
            <div className="mt-3 space-y-2 text-slate-400">
              <a href="#testimonials" className="block transition hover:text-white">
                Customers
              </a>
              <a href="#pricing" className="block transition hover:text-white">
                Pricing
              </a>
              <a href="#contact" className="block transition hover:text-white">
                Contact
              </a>
            </div>
          </div>

          <div>
            <p className="font-semibold text-white">Legal</p>
            <div className="mt-3 space-y-2 text-slate-400">
              <span className="block">Terms</span>
              <span className="block">Privacy</span>
              <span className="block">Cookies</span>
            </div>
          </div>
        </div>
      </div>

      <div className="section-shell mt-8 border-t border-slate-800 pt-6 text-xs text-slate-500">
        © 2026 CoreFlow. All rights reserved.
      </div>
    </footer>
  );
}
