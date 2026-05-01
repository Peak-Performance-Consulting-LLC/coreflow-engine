import { ChevronDown } from 'lucide-react';
import { LandingReveal } from './LandingReveal';

const faqs = [
  {
    question: 'How long does setup usually take?',
    answer:
      'Most teams launch their first workflow in under a week. We provide guided setup for records, imports, and voice routing.',
  },
  {
    question: 'Can we use CoreFlow with multiple industries?',
    answer:
      'Yes. You can switch CRM modes and maintain separate workflows for real estate, service teams, retail, and more.',
  },
  {
    question: 'Do you support role-based access control?',
    answer:
      'Absolutely. Workspace owners can assign permissions by role and control access to records, voice ops, and team settings.',
  },
  {
    question: 'Is the voice assistant customizable?',
    answer:
      'You can configure prompts, field mappings, and call actions to align with your lead qualification process.',
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="section-shell pt-20">
      <LandingReveal className="rounded-3xl border border-slate-300/80 bg-gradient-to-b from-white to-slate-100/70 p-6 shadow-[0_14px_34px_rgba(15,23,42,0.12)] sm:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">FAQ</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
            Questions teams ask before rollout
          </h2>
        </div>

        <div className="mx-auto mt-8 max-w-3xl space-y-3">
          {faqs.map((faq) => (
            <details className="group rounded-2xl border border-slate-300/80 bg-white/90 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_12px_28px_rgba(49,46,129,0.12)]" key={faq.question}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-950">
                <span>{faq.question}</span>
                <ChevronDown className="h-4 w-4 text-indigo-600 transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-700">{faq.answer}</p>
            </details>
          ))}
        </div>
      </LandingReveal>
    </section>
  );
}
