import {
  CheckCircle2,
  CreditCard,
  MapPin,
  PhoneIncoming,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import type { VoiceNumberSearchResult } from '../../lib/voice-service';

interface VoiceNumberPurchaseDrawerProps {
  isOpen: boolean;
  result: VoiceNumberSearchResult | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (label: string) => Promise<void>;
}

function formatLocation(result: VoiceNumberSearchResult | null) {
  if (!result) return 'Unknown';
  return [result.locality, result.administrativeArea, result.countryCode].filter(Boolean).join(', ') || 'Unknown';
}

function formatType(result: VoiceNumberSearchResult | null) {
  return result?.phoneNumberType ? result.phoneNumberType.replace(/_/g, ' ') : 'standard';
}

function formatCost(value: string | null) {
  if (!value) return 'Unknown';

  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return value;

  return `$${amount.toFixed(0)}`;
}

function formatFeatureLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function VoiceNumberPurchaseDrawer({
  isOpen,
  result,
  submitting,
  onClose,
  onSubmit,
}: VoiceNumberPurchaseDrawerProps) {
  const [label, setLabel] = useState('');

  const features = useMemo(() => {
    if (!result?.features?.length) return [];
    return result.features.map(formatFeatureLabel);
  }, [result]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setLabel('');

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, submitting]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
          aria-hidden={!isOpen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close number purchase confirmation"
            onClick={() => {
              if (!submitting) onClose();
            }}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-number-purchase-title"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_28px_90px_rgba(15,23,42,0.30)] backdrop-blur-xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-sky-500/10" />
            <motion.div
              className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-indigo-400/25 blur-3xl"
              animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.75, 0.45] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -bottom-28 -left-24 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl"
              animate={{ scale: [1.1, 1, 1.1], opacity: [0.45, 0.7, 0.45] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            />

            <div className="relative border-b border-slate-200/80 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-blue shadow-sm">
                    <Sparkles className="h-3 w-3" />
                    Confirm purchase
                  </div>

                  <h2 id="voice-number-purchase-title" className="mt-3 font-display text-2xl text-slate-950">
                    Buy this workspace number
                  </h2>

                  <p className="mt-1.5 max-w-lg text-sm leading-5 text-slate-600">
                    Review the number and label before provisioning it for this workspace.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!submitting) onClose();
                  }}
                  disabled={submitting}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:scale-105 hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="relative space-y-4 px-5 py-4">
              {result ? (
                <>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="overflow-hidden rounded-[24px] border border-indigo-200 bg-white/75 shadow-sm backdrop-blur-md"
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="relative">
                          <motion.div
                            className="absolute inset-0 rounded-2xl bg-indigo-400/25"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.45, 0, 0.45] }}
                            transition={{ duration: 2.2, repeat: Infinity }}
                          />
                          <div className="relative rounded-2xl border border-indigo-200 bg-white p-2.5 text-accent-blue shadow-sm">
                            <PhoneIncoming className="h-5 w-5" />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
                            Selected number
                          </div>

                          <h3 className="mt-1 truncate font-display text-3xl text-slate-950">
                            {result.phoneNumber}
                          </h3>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white px-2.5 py-1 shadow-sm">
                              <MapPin className="h-3.5 w-3.5 text-accent-blue" />
                              {formatLocation(result)}
                            </span>

                            <span className="rounded-full border border-indigo-100 bg-white px-2.5 py-1 capitalize shadow-sm">
                              {formatType(result)}
                            </span>

                            {result.quickship ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white px-2.5 py-1 shadow-sm">
                                <Sparkles className="h-3.5 w-3.5 text-accent-blue" />
                                Quickship
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white px-4 py-3 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Estimated cost
                            </div>

                            <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                              <span className="font-display text-2xl text-slate-950">
                                {formatCost(result.monthlyCost)}
                              </span>
                              <span className="text-sm font-medium text-slate-600">/ month</span>
                            </div>

                            <p className="mt-0.5 text-xs text-slate-500">
                              {formatCost(result.upfrontCost)} one-time upfront cost
                            </p>
                          </div>

                          <div className="inline-flex w-fit items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-sm">
                            <ShieldCheck className="h-4 w-4 text-accent-blue" />
                            Managed provisioning
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Features
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {features.length > 0 ? (
                            features.slice(0, 6).map((feature, index) => (
                              <motion.span
                                key={feature}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.08 + index * 0.04 }}
                                whileHover={{ y: -2, scale: 1.03 }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 text-accent-blue" />
                                {feature}
                              </motion.span>
                            ))
                          ) : (
                            <span className="text-sm text-slate-500">No features listed</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-[22px] border border-slate-200 bg-white/75 p-4 shadow-sm backdrop-blur-md"
                  >
                    <label className="flex flex-col gap-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-800">Workspace label</span>
                      <input
                        value={label}
                        onChange={(event) => setLabel(event.target.value)}
                        placeholder="Front desk line"
                        disabled={submitting}
                        className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-accent-blue focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </label>

                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Optional. This helps your team recognize the number after provisioning.
                    </p>
                  </motion.div>
                </>
              ) : null}
            </div>

            <div className="relative flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/70 px-5 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>

              <motion.div whileHover={{ scale: submitting ? 1 : 1.03 }} whileTap={{ scale: submitting ? 1 : 0.97 }}>
                <Button
                  type="button"
                  onClick={() => void onSubmit(label)}
                  loading={submitting}
                  disabled={!result}
                  className="relative min-h-11 overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-600 px-5 text-white shadow-lg shadow-indigo-500/25"
                >
                  <motion.span
                    className="absolute inset-y-0 -left-16 w-14 rotate-12 bg-white/30"
                    animate={{ left: ['-20%', '120%'] }}
                    transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  <span className="relative inline-flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Confirm Purchase
                  </span>
                </Button>
              </motion.div>
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}