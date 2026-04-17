import { Link } from 'react-router-dom';

export function HeroSection() {
  return (
    <section className="section-shell pt-14 md:pt-20">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-indigo-600">Shared CRM Platform</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          One CRM workspace for operations, records, and AI voice workflows.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">
          CoreFlow helps teams manage leads, imports, and inbound call automation in one clean system.
        </p>

        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/signup"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Book a Demo
          </Link>
          <Link
            to="/signin"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Start Free Trial
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-5xl rounded-2xl border border-slate-200 bg-white p-3 shadow-panel">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="h-3 w-24 rounded-full bg-slate-200" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-8 rounded-md bg-slate-100" />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                {['Open Records', 'Open Review', 'Leads Created'].map((label, index) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{index === 0 ? '128' : index === 1 ? '20' : '97'}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="h-8 rounded-md bg-slate-100" />
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="grid grid-cols-5 gap-2">
                      {Array.from({ length: 5 }).map((__, cellIndex) => (
                        <div key={cellIndex} className="h-7 rounded bg-slate-100" />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
