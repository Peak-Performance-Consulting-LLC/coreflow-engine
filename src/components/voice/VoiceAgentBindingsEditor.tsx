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
  const bindingByNumberId = new Map(bindings.map((binding) => [binding.workspace_phone_number_id, binding]));
  const occupiedByOtherAgent = new Map<string, string>();

  for (const agent of allAgents) {
    for (const binding of agent.active_bindings) {
      occupiedByOtherAgent.set(binding.workspace_phone_number_id, agent.name);
    }
  }

  return (
    <div className="p-6 bg-transparent">
      <div>
        <h3 className="font-display text-2xl text-slate-900">Ready number bindings</h3>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Bind this assistant to ready voice numbers. Only one active assistant can own a number at a time.
        </p>
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-slate-300 bg-white p-5 text-sm text-slate-600">
          Loading ready voice numbers...
        </div>
      ) : error ? (
        <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
        </div>
      ) : numbers.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-slate-300 bg-white p-5 text-sm text-slate-600">
          No ready voice numbers are available yet. Finish Phase 1 provisioning first, then return here to activate a binding.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {numbers.map((number) => {
            const currentBinding = bindingByNumberId.get(number.id);
            const activeElsewhere = occupiedByOtherAgent.get(number.id);
            const isCurrentBindingActive = Boolean(currentBinding?.is_active);
            const disabledByOtherAgent = Boolean(activeElsewhere && !isCurrentBindingActive);

            return (
              <div
                key={number.id}
                className="flex flex-col gap-4 rounded-3xl border border-slate-300 bg-white p-5 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-900">{number.phone_number_e164}</div>
                  <div className="mt-2 text-sm text-slate-600">
                    {number.label ? `${number.label} | ` : ''}
                    {isCurrentBindingActive
                      ? 'Bound to this assistant'
                      : disabledByOtherAgent
                        ? `Already active on ${activeElsewhere}`
                        : 'Available for binding'}
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant={isCurrentBindingActive ? 'primary' : 'primary'}
                  loading={savingNumberId === number.id}
                  disabled={disabledByOtherAgent}
                  onClick={() => void onToggleBinding(number.id, !isCurrentBindingActive)}
                >
                  {isCurrentBindingActive ? 'Unbind number' : 'Bind number'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
