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
    <header className="sticky top-0 z-50 w-full px-3 py-3">
      <div className="mx-auto w-full max-w-[calc(100vw-1.5rem)] lg:max-w-7xl">
        <div className="relative flex h-14 min-w-0 items-center justify-between rounded-2xl border border-white/75 bg-white/[0.92] px-3 shadow-[0_18px_50px_rgba(15,23,42,0.16)] backdrop-blur-xl sm:px-4">
          <div className="flex items-center gap-2.5">
            <LogoMark showSubtitle={false} />
            <span className="hidden rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-700 lg:inline-flex">
              Shared CRM Platform
            </span>
          </div>

          <nav className="hidden items-center gap-1.5 text-[13px] font-semibold text-slate-600 lg:flex">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 transition duration-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{link.label}</span>
                </a>
              );
            })}
          </nav>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            <Link
              to="/signin"
              className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-slate-700 transition duration-200 hover:bg-slate-100 hover:text-indigo-700 lg:inline-flex"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign In
            </Link>
            <Link
              to="/signup"
              className="hidden h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 text-[13px] font-semibold text-white shadow-[0_12px_28px_rgba(99,102,241,0.3)] ring-1 ring-indigo-300/40 transition duration-200 hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700 lg:inline-flex"
            >
              Start Free Trial
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              className="fixed right-5 top-5 z-[60] inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-white shadow-sm transition hover:bg-indigo-700 lg:hidden"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="mx-auto max-w-7xl lg:hidden">
          <div className="mt-2 rounded-2xl border border-white/75 bg-white/95 p-4 shadow-[0_16px_38px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <nav className="flex flex-col gap-1.5">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
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
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700"
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
