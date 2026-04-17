import { motion } from 'framer-motion';
import { ArrowUpRight, CalendarDays, Clock3, MoreHorizontal, Plus, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dashboardCopy } from '../../lib/constants';
import type { WorkspaceSummary } from '../../lib/types';
import { Card } from '../ui/Card';
import { buttonStyles } from '../ui/Button';
import { WorkspaceLayout } from './WorkspaceLayout';

interface DashboardShellProps {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
}

const chartHeights = [28, 46, 38, 62, 54, 82, 70, 94, 76, 104, 88, 112];

export function DashboardShell({ workspace, onSignOut }: DashboardShellProps) {
  const copy = dashboardCopy[workspace.crmType];
  const statValues = ['128', '24', '89%'];

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={onSignOut}>
      <div className="space-y-4">

        {/* ── Row 1: Hero + Today's Focus ── */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="grid gap-4 xl:grid-cols-[1fr_300px]"
        >
          {/* Hero card */}
          <Card className="overflow-hidden p-5 sm:p-6">
            <div className="absolute inset-0 bg-hero-radial opacity-60" />
            <div className="relative">
              {/* Label pill */}
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-600">
                Dashboard shell
              </span>

              {/* Headline */}
              <h2 className="mt-3 font-display text-2xl font-semibold leading-tight text-slate-900 sm:text-3xl">
                {copy.headline}
              </h2>

              {/* CTA buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/records" className={buttonStyles('primary', 'sm')}>
                  Open records
                </Link>
                <Link
                  to="/records"
                  state={{ openCreateRecord: true }}
                  className={buttonStyles('secondary', 'sm')}
                >
                  Create record
                </Link>
                <Link to="/imports" className={buttonStyles('ghost', 'sm')}>
                  Import leads
                </Link>
              </div>

              {/* Stat cards */}
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {copy.statLabels.map((label, index) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      {label}
                    </p>
                    <div className="mt-3 flex items-end justify-between">
                      <span className="font-display text-2xl font-semibold text-slate-900">
                        {statValues[index]}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-500">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        +12%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Today's Focus card */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Welcome block
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">
                  Today&apos;s focus
                </h3>
              </div>
              <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600">
                <Zap className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {copy.quickActions.map((action) => (
                <button
                  key={action}
                  className="group flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                >
                  <span className="font-medium group-hover:text-indigo-700">{action}</span>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm group-hover:bg-indigo-700">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </motion.section>

        {/* ── Row 2: Recent Activity + Performance Pulse + Placeholder Widgets ── */}
        <section className="grid gap-4 xl:grid-cols-[1fr_300px]">
          {/* Recent Activity */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Recent activity
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">
                  What moved in your workspace
                </h3>
              </div>
              <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50">
                <Clock3 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {copy.activity.map((item, index) => (
                <div
                  key={item}
                  className="flex items-start gap-3.5 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3.5 transition hover:border-slate-200 hover:bg-white"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-[11px] font-bold text-indigo-600">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{item}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Placeholder activity feed tailored to the selected CRM type.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            {/* Performance Pulse */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Widget area
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">
                    Performance Pulse
                  </h3>
                </div>
                <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50">
                  <CalendarDays className="h-4 w-4" />
                </button>
              </div>

              {/* Bar chart */}
              <div className="mt-5 flex h-36 items-end gap-1.5">
                {chartHeights.map((height, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-lg transition-all duration-500"
                    style={{
                      height: `${(height / 112) * 100}%`,
                      background: `linear-gradient(to top, #4338CA, #818CF8, #BAE6FD)`,
                      opacity: 0.75 + (height / 112) * 0.25,
                    }}
                  />
                ))}
              </div>
            </Card>

            {/* Placeholder widgets */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Next build zone
                  </p>
                  <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">
                    Placeholder widgets
                  </h3>
                </div>
                <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:bg-slate-50">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {['Pipeline board', 'Communication stream', 'Tasks & reminders', 'Analytics'].map(
                  (widget) => (
                    <div
                      key={widget}
                      className="flex min-h-[64px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-xs font-medium text-slate-400 transition hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-500"
                    >
                      {widget}
                    </div>
                  ),
                )}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
