import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingReveal, LandingRevealItem, LandingStagger } from './LandingReveal';

const plans = [
  {
    name: 'Starter',
    price: '$79',
    description: 'For small teams launching shared CRM operations.',
    features: ['Up to 3 team seats', 'Record and import workflows', 'Email support'],
    cta: 'Start Starter Plan',
  },
  {
    name: 'Growth',
    price: '$229',
    description: 'For teams scaling inbound voice and automation.',
    features: ['Up to 15 team seats', 'AI voice assistants + number provisioning', 'Priority support'],
    cta: 'Choose Growth',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For multi-workspace organizations with advanced controls.',
    features: ['Unlimited seats', 'Advanced permissions and governance', 'Dedicated onboarding + SLA'],
    cta: 'Talk to Sales',
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="section-shell pt-20">
      <LandingReveal className="overflow-hidden rounded-3xl border border-slate-600/35 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 shadow-[0_28px_70px_rgba(15,23,42,0.4)] sm:p-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">Pricing</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
            Flexible plans built for operational maturity
          </h2>
        </div>

        <LandingStagger className="mt-8 grid gap-4 lg:grid-cols-3" stagger={0.1}>
          {plans.map((plan) => (
            <LandingRevealItem key={plan.name} direction="up" distance={20}>
              <article
                className={`h-full rounded-2xl border p-5 ${
                  plan.highlighted
                    ? 'relative border-indigo-300/80 bg-gradient-to-b from-indigo-500/30 to-white/10 shadow-[0_18px_38px_rgba(79,70,229,0.42)] ring-1 ring-indigo-200/35 transition duration-200 hover:-translate-y-1 hover:shadow-[0_24px_46px_rgba(79,70,229,0.48)]'
                    : 'border-slate-600/40 bg-white/10 backdrop-blur transition duration-200 hover:-translate-y-1 hover:border-indigo-300/50'
                }`}
              >
                {plan.highlighted ? (
                  <p className="absolute right-4 top-4 rounded-full border border-indigo-200/80 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
                    Most Popular
                  </p>
                ) : null}
                <p className="text-sm font-semibold text-white">{plan.name}</p>
                <div className="mt-3 flex items-end gap-2">
                  <p className="font-display text-4xl font-semibold text-white">{plan.price}</p>
                  {plan.price !== 'Custom' ? <p className="pb-1 text-sm text-slate-300">/ month</p> : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-200">{plan.description}</p>

                <ul className="mt-5 space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-slate-100">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-indigo-200" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/signup"
                  className={`mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold transition ${
                    plan.highlighted
                      ? 'bg-white text-indigo-800 hover:-translate-y-0.5 hover:bg-indigo-50'
                      : 'bg-slate-950 text-white hover:-translate-y-0.5 hover:bg-slate-900'
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            </LandingRevealItem>
          ))}
        </LandingStagger>
      </LandingReveal>
    </section>
  );
}
