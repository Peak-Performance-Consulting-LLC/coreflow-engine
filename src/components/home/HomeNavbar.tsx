import { ArrowRight, CircleHelp, FileStack, Gem, LogIn, Menu, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogoMark } from '../ui/LogoMark';

const navLinks = [
  { label: 'Features', href: '#features', icon: FileStack },
  { label: 'Proof', href: '#proof', icon: ShieldCheck },
  { label: 'How It Works', href: '#how-it-works', icon: Sparkles },
  { label: 'Pricing', href: '#pricing', icon: Gem },
  { label: 'FAQ', href: '#faq', icon: CircleHelp },
];

export function HomeNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 shadow-[0_10px_32px_rgba(15,23,42,0.24)]">
      <div
        className="w-full"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.18), transparent 35%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.14), transparent 30%), linear-gradient(180deg, #111827 0%, #0f172a 50%, #0b1120 100%)',
        }}
      >
        <div className="section-shell">
          <div className="flex h-16 items-center justify-between px-1 sm:px-2">
            <div className="flex items-center gap-2.5">
              <LogoMark showSubtitle={false} theme="dark" />
              <span className="hidden rounded-full border border-indigo-300/40 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-100 lg:inline-flex">
                Shared CRM Platform
              </span>
            </div>

            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-200 md:flex">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    className="inline-flex items-center gap-1.5 transition duration-200 hover:text-indigo-200"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{link.label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="flex items-center gap-2.5">
              <Link
                to="/signin"
                className="hidden h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold text-slate-200 transition duration-200 hover:bg-white/10 hover:text-white md:inline-flex"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </Link>
              <Link
                to="/signup"
                className="hidden h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-sm font-semibold text-white shadow-[0_10px_26px_rgba(99,102,241,0.28)] ring-1 ring-indigo-300/40 transition duration-200 hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700 hover:shadow-[0_14px_30px_rgba(99,102,241,0.34)] md:inline-flex"
              >
                Start Free Trial
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-500 bg-white/10 text-slate-100 transition hover:bg-white/15 hover:text-indigo-200 md:hidden"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((open) => !open)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="section-shell md:hidden">
          <div
            className="mt-2 rounded-2xl border border-white/10 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.24)]"
            style={{
              background:
                'radial-gradient(circle at 20% 0%, rgba(99,102,241,0.18), transparent 35%), radial-gradient(circle at 80% 20%, rgba(139,92,246,0.14), transparent 30%), linear-gradient(180deg, #111827 0%, #0f172a 50%, #0b1120 100%)',
            }}
          >
            <nav className="flex flex-col gap-1.5">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-indigo-200"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </a>
                );
              })}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link
                  to="/signin"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-500 bg-white/10 text-sm font-semibold text-slate-100"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(99,102,241,0.28)]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Start Free Trial
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
