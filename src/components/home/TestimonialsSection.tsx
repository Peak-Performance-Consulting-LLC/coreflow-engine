import { Star } from 'lucide-react';
import { LandingReveal, LandingRevealItem, LandingStagger } from './LandingReveal';

const testimonials = [
  {
    quote:
      "CoreFlow's AI assistant handles most inbound requests in real time, so our team only focuses on high-intent opportunities.",
    name: 'Sarah Jenkins',
    role: 'Director, Prime Properties',
    initials: 'SJ',
  },
  {
    quote:
      'The shared workspace model keeps records, voice calls, and imports aligned for every team in one place.',
    name: 'Michael Shen',
    role: 'Operations Manager, Spectra Services',
    initials: 'MS',
  },
  {
    quote:
      'Number provisioning and CRM mapping now run in one repeatable process without extra engineering involvement.',
    name: 'Emily Rodriguez',
    role: 'COO, BuildWise Group',
    initials: 'ER',
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="section-shell pt-20">
      <LandingReveal className="rounded-3xl border border-slate-300/70 bg-gradient-to-br from-white via-slate-100/80 to-indigo-100/60 p-6 shadow-[0_18px_46px_rgba(15,23,42,0.14)] sm:p-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">Testimonials</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
            What teams say after switching to CoreFlow
          </h2>
        </div>

        <LandingStagger className="mt-8 grid gap-4 lg:grid-cols-3" stagger={0.09}>
          {testimonials.map((testimonial, index) => (
            <LandingRevealItem key={testimonial.name} direction="up" distance={16}>
              <article
                className={`rounded-2xl border p-5 shadow-sm ${
                  index === 1
                    ? 'border-indigo-300 bg-indigo-50/70 shadow-[0_14px_28px_rgba(79,70,229,0.15)]'
                    : 'border-slate-200 bg-white/90'
                }`}
              >
                <div className="mb-3 flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, starIndex) => (
                    <Star key={starIndex} className="h-3.5 w-3.5 fill-current" />
                  ))}
                </div>
                <p className="text-sm leading-6 text-slate-800">"{testimonial.quote}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 text-xs font-semibold text-white">
                    {testimonial.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{testimonial.name}</p>
                    <p className="text-xs text-slate-600">{testimonial.role}</p>
                  </div>
                </div>
              </article>
            </LandingRevealItem>
          ))}
        </LandingStagger>
      </LandingReveal>
    </section>
  );
}
