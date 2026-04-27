import { Button } from '../ui/Button';
import type { VoiceAgentBindingRecord, VoiceAgentSummary } from '../../lib/voice-agent-service';
import type { VoiceNumberRecord } from '../../lib/voice-service';

interface VoiceAgentBindingsEditorProps {
  numbers: VoiceNumberRecord[];
  bindings: VoiceAgentBindingRecord[];
  allAgents: VoiceAgentSummary[];
  loading: boolean;
  error: string;
  savingNumberId: string | null;
  onToggleBinding: (workspacePhoneNumberId: string, nextActive: boolean) => Promise<void> | void;
}

export function VoiceAgentBindingsEditor({
  numbers,
  bindings,
  allAgents,
  loading,
  error,
  savingNumberId,
  onToggleBinding,
}: VoiceAgentBindingsEditorProps) {
  void loading;
  void error;

  const bindingByNumberId = new Map(bindings.map((binding) => [binding.workspace_phone_number_id, binding]));
  const occupiedByOtherAgent = new Map<string, string>();

  for (const agent of allAgents) {
    for (const binding of agent.active_bindings) {
      occupiedByOtherAgent.set(binding.workspace_phone_number_id, agent.name);
    }
  }

  return (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-white overflow-hidden">

  {/* HEADER */}
  <div className="flex justify-between items-center px-5 py-4 border-b">
    <div>
      <h3 className="text-lg font-semibold text-slate-900">
        Ready number bindings
      </h3>
      <p className="text-sm text-slate-600">
        Active PSTN numbers assigned to this assistant
      </p>
    </div>
  </div>

  {/* LIST */}
  <div className="divide-y">
    {numbers.map((number) => {
      const currentBinding = bindingByNumberId.get(number.id);
      const isActive = Boolean(currentBinding?.is_active);

      return (
        <div
          key={number.id}
          className="flex items-center justify-between px-5 py-4"
        >
          <div>
            <div className="font-medium text-slate-900">
              {number.phone_number_e164}
            </div>
            <div className="text-sm text-slate-500">
              {number.label || 'Voice number'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                isActive
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {isActive ? 'Online' : 'Standby'}
            </span>

            <Button
              size="sm"
              onClick={() => onToggleBinding(number.id, !isActive)}
              loading={savingNumberId === number.id}
              className="rounded-xl"
            >
              {isActive ? 'Unbind' : 'Bind'}
            </Button>
          </div>
        </div>
      );
    })}
  </div>
</div>
  );
}
