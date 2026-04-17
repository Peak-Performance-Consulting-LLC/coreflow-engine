import type { Session } from '@supabase/supabase-js';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { CrmWorkspaceConfig, RecordDetailResponse, RecordSaveInput } from '../../lib/crm-types';
import { createRecord } from '../../lib/crm-service';
import { RecordForm } from './RecordForm';

interface RecordCreateDrawerProps {
  isOpen: boolean;
  workspaceId: string;
  session: Session;
  config: CrmWorkspaceConfig;
  onClose: () => void;
  onCreated: (detail: RecordDetailResponse) => void;
}

export function RecordCreateDrawer({
  isOpen,
  workspaceId,
  session,
  config,
  onClose,
  onCreated,
}: RecordCreateDrawerProps) {
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  async function handleSubmit(payload: RecordSaveInput) {
    try {
      const created = await createRecord(session, payload);
      onCreated(created);
      toast.success('Record created.');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create record.';
      toast.error(message);
      throw error;
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 transition ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-label="Close record creator"
        onClick={onClose}
        className={`absolute inset-0 bg-transparent transition duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-4xl flex-col border-l border-slate-300 bg-slate-50 shadow-2xl backdrop-blur-xl transition duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-create-drawer-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-300 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">New record</div>
            <h2 id="record-create-drawer-title" className="mt-2 truncate font-display text-2xl text-slate-900">
              Create record
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Add a new lead from the shared queue without leaving the records workspace.
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
          <RecordForm workspaceId={workspaceId} config={config} submitLabel="Create record" onSubmit={handleSubmit} />
        </div>
      </aside>
    </div>
  );
}
