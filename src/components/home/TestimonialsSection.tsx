const testimonials = [
  {
    quote:
      'CoreFlow’s AI assistant handles 90% of our calls instantly, so we can focus only on qualified opportunities.',
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
      'Provisioned numbers and CRM mapping are now managed by one team without needing extra engineering effort.',
    name: 'Emily Rodriguez',
    role: 'COO, BuildWise Group',
    initials: 'ER',
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="section-shell pt-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Testimonials</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-900">What teams say after switching to CoreFlow</h2>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <article key={testimonial.name} className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
              <p className="text-sm leading-6 text-slate-700">“{testimonial.quote}”</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{testimonial.name}</p>
                  <p className="text-xs text-slate-500">{testimonial.role}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
