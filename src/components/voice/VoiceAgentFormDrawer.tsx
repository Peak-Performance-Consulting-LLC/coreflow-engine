import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { RecordSource } from '../../lib/crm-types';
import type { VoiceAgentRecord, VoiceAgentTelnyxOptions } from '../../lib/voice-agent-service';
import { Button } from '../ui/Button';
import {
  VoiceAgentForm,
  type VoiceAgentFormValues,
} from './VoiceAgentForm';

interface VoiceAgentFormDrawerProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  agent?: VoiceAgentRecord | null;
  sources: RecordSource[];
  submitting: boolean;
  errorMessage?: string;
  activationIssues?: string[];
  telnyxOptions?: VoiceAgentTelnyxOptions | null;
  telnyxOptionsLoading?: boolean;
  telnyxOptionsError?: string;
  values: VoiceAgentFormValues;
  onValuesChange: (values: VoiceAgentFormValues) => void;
  onClose: () => void;
  onSubmit: (values: VoiceAgentFormValues) => Promise<void> | void;
}

export function VoiceAgentFormDrawer({
  isOpen,
  mode,
  agent,
  sources,
  submitting,
  errorMessage,
  activationIssues,
  telnyxOptions,
  telnyxOptionsLoading,
  telnyxOptionsError,
  values,
  onValuesChange,
  onClose,
  onSubmit,
}: VoiceAgentFormDrawerProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 transition ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-label="Close assistant drawer"
        onClick={onClose}
        className={`absolute inset-0 bg-transparent transition duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-slate-300 bg-slate-50 shadow-2xl backdrop-blur-xl transition duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-agent-create-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-300 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">Assistants</div>
            <h2 id="voice-agent-create-title" className="mt-2 truncate font-display text-2xl text-slate-900">
              {mode === 'create' ? 'New assistant' : 'Edit assistant'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {mode === 'create'
                ? 'Create a draft assistant, then configure mappings and ready-number bindings in the voice workspace.'
                : 'Update the assistant greeting, prompt, status, and CRM source without leaving the voice workspace.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 text-slate-700 transition hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <VoiceAgentForm
            agent={agent ?? null}
            sources={sources}
            mode={mode}
            submitting={submitting}
            errorMessage={errorMessage}
            activationIssues={activationIssues}
            telnyxOptions={telnyxOptions}
            telnyxOptionsLoading={telnyxOptionsLoading}
            telnyxOptionsError={telnyxOptionsError}
            values={values}
            onValuesChange={onValuesChange}
            onSubmit={onSubmit}
          />
        </div>

        <div className="flex justify-end border-t border-slate-300 px-4 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
    </div>
  );
}
