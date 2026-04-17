import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export function HowItWorksSection() {
  return (
    <section id="voice-highlight" className="section-shell pt-16">
      <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-card lg:grid-cols-[0.92fr_1.08fr] lg:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Voice Operations Highlight</p>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-slate-900">
            Turn inbound calls into structured CRM data
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600">
            CoreFlow analyzes every inbound call and routes qualified outcomes into records, follow-ups, and
            call-ops queues automatically.
          </p>
          <Link
            to="/voice/ops"
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Open Voice Ops
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {['Calls Loaded', 'Open Review', 'Leads Created'].map((item, index) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">{item}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{index === 0 ? '28' : index === 1 ? '20' : '8'}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-6 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {['Caller', 'Number', 'Assistant', 'Outcome', 'Review', 'Created'].map((header) => (
                  <div key={header} className="px-2 py-2">
                    {header}
                  </div>
                ))}
              </div>
              {Array.from({ length: 4 }).map((_, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-6 border-b border-slate-200 text-xs last:border-b-0">
                  {Array.from({ length: 6 }).map((__, cellIndex) => (
                    <div key={cellIndex} className="px-2 py-2 text-slate-600">
                      {cellIndex === 0 ? '+12105100885' : cellIndex === 3 ? 'review_needed' : '...'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
