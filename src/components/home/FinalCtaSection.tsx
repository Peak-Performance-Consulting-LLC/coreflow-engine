import { Link } from 'react-router-dom';

export function FinalCtaSection() {
  return (
    <section id="pricing" className="pt-16">
      <div className="bg-indigo-950 py-14">
        <div className="section-shell text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">Final CTA</p>
          <h2 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
            Ready to run your operations in one workspace?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-indigo-100">
            Start with records, imports, and AI voice workflows in a single modern platform.
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-white px-5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
            >
              Book a Demo
            </Link>
            <Link
              to="/signin"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-indigo-300 bg-indigo-900 px-5 text-sm font-semibold text-white transition hover:bg-indigo-800"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
