import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingReveal } from './LandingReveal';

export function FinalCtaSection() {
  return (
    <section id="final-cta" className="section-shell pt-20">
      <LandingReveal className="relative overflow-hidden rounded-3xl border border-indigo-300/50 bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 p-8 text-center shadow-[0_28px_66px_rgba(49,46,129,0.38)] sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(147,197,253,0.18),transparent_42%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-100">Final CTA</p>
        <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
          Ready to run your operations from one system of record?
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-indigo-100">
          Start with records, imports, and AI voice workflows in a single modern platform built for fast teams.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-indigo-700 transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-50"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/signin"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-700/40 px-5 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-indigo-700/70"
          >
            Schedule Demo
          </Link>
        </div>

        <p className="mt-5 text-sm font-medium text-indigo-100">Join 400+ teams scaling operations with CoreFlow. No credit card required.</p>
      </LandingReveal>
    </section>
  );
}
