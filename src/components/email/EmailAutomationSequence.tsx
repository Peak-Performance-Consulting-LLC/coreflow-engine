import { useState } from 'react';
import { Plus, Trash2, Edit3, Play, Pause, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface EmailAutomationSequence {
  id: string;
  name: string;
  description: string;
  trigger: 'lead_created' | 'stage_change' | 'tag_added' | 'manual_trigger';
  triggerDetails: Record<string, any>;
  steps: SequenceStep[];
  isActive: boolean;
  createdAt: string;
}

interface SequenceStep {
  id: string;
  templateId: string;
  delayHours: number;
  condition?: string;
  order: number;
}

interface EmailAutomationProps {
  templates: any[];
  onSave: (sequence: EmailAutomationSequence) => Promise<void>;
}

const TRIGGER_OPTIONS = [
  { value: 'lead_created', label: '🆕 Lead Created', description: 'When a new lead is registered' },
  { value: 'stage_change', label: '📍 Stage Changed', description: 'When a lead moves to a stage' },
  { value: 'tag_added', label: '🏷️ Tag Added', description: 'When a specific tag is added' },
  { value: 'manual_trigger', label: '👆 Manual Trigger', description: 'When manually activated' },
];

export function EmailAutomationSequence({ templates, onSave }: EmailAutomationProps) {
  const [sequences, setSequences] = useState<EmailAutomationSequence[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSaveSequence = async (sequence: EmailAutomationSequence) => {
    try {
      await onSave(sequence);
      toast.success('Automation sequence saved');
      setIsCreating(false);
      setEditingId(null);
    } catch (error) {
      toast.error('Failed to save sequence');
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Email Automation Sequences</h3>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
        >
          <Plus className="h-4 w-4" />
          New Automation
        </button>
      </div>

      {/* Sequences List */}
      <div className="grid gap-4">
        {sequences.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
            <Clock className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No automation sequences yet</p>
            <p className="text-sm text-slate-500">Create your first automation to get started</p>
          </div>
        ) : (
          sequences.map(sequence => (
            <SequenceCard
              key={sequence.id}
              sequence={sequence}
              templates={templates}
              onEdit={setEditingId}
              onDelete={() => setSequences(s => s.filter(x => x.id !== sequence.id))}
              onSave={handleSaveSequence}
            />
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isCreating || editingId) && (
        <SequenceEditor
          sequence={
            editingId
              ? sequences.find(s => s.id === editingId)
              : {
                  id: `seq-${Date.now()}`,
                  name: '',
                  description: '',
                  trigger: 'lead_created',
                  triggerDetails: {},
                  steps: [],
                  isActive: true,
                  createdAt: new Date().toISOString(),
                }
          }
          templates={templates}
          onSave={handleSaveSequence}
          onCancel={() => {
            setIsCreating(false);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

function SequenceCard({
  sequence,
  templates,
  onEdit,
  onDelete,
  onSave,
}: {
  sequence: EmailAutomationSequence;
  templates: any[];
  onEdit: (id: string) => void;
  onDelete: () => void;
  onSave: (seq: EmailAutomationSequence) => Promise<void>;
}) {
  const trigger = TRIGGER_OPTIONS.find(t => t.value === sequence.trigger);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h4 className="font-semibold text-slate-900 text-lg">{sequence.name}</h4>
          <p className="text-sm text-slate-600">{sequence.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await onSave({ ...sequence, isActive: !sequence.isActive });
            }}
            className={`p-2 rounded-lg transition ${
              sequence.isActive
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            title={sequence.isActive ? 'Pause' : 'Resume'}
          >
            {sequence.isActive ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onEdit(sequence.id)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-4 p-3 bg-slate-50 rounded-lg">
        <div className="text-sm font-medium text-slate-700 mb-1">{trigger?.label}</div>
        <div className="text-xs text-slate-600">{trigger?.description}</div>
      </div>

      {sequence.steps.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">Steps:</div>
          {sequence.steps
            .sort((a, b) => a.order - b.order)
            .map((step, idx) => {
              const template = templates.find(t => t.id === step.templateId);
              return (
                <div key={step.id} className="flex items-center gap-3 text-sm">
                  <div className="flex items-center justify-center w-6 h-6 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{template?.name || 'Unknown Template'}</div>
                    <div className="text-xs text-slate-500">Send after {step.delayHours} hours</div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function SequenceEditor({
  sequence,
  templates,
  onSave,
  onCancel,
}: {
  sequence: EmailAutomationSequence | undefined;
  templates: any[];
  onSave: (seq: EmailAutomationSequence) => Promise<void>;
  onCancel: () => void;
}) {
  const [seq, setSeq] = useState<EmailAutomationSequence>(
    sequence || {
      id: `seq-${Date.now()}`,
      name: '',
      description: '',
      trigger: 'lead_created',
      triggerDetails: {},
      steps: [],
      isActive: true,
      createdAt: new Date().toISOString(),
    }
  );

  const handleAddStep = () => {
    const newStep: SequenceStep = {
      id: `step-${Date.now()}`,
      templateId: '',
      delayHours: 24,
      order: seq.steps.length,
    };
    setSeq({ ...seq, steps: [...seq.steps, newStep] });
  };

  const handleUpdateStep = (id: string, updates: Partial<SequenceStep>) => {
    setSeq({
      ...seq,
      steps: seq.steps.map(s => (s.id === id ? { ...s, ...updates } : s)),
    });
  };

  const handleRemoveStep = (id: string) => {
    setSeq({
      ...seq,
      steps: seq.steps.filter(s => s.id !== id).map((s, idx) => ({ ...s, order: idx })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Email Automation Sequence</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input
                type="text"
                value={seq.name}
                onChange={e => setSeq({ ...seq, name: e.target.value })}
                placeholder="Welcome Email Sequence"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={seq.description}
                onChange={e => setSeq({ ...seq, description: e.target.value })}
                placeholder="What does this automation do?"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                rows={2}
              />
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">When to Send</label>
            <div className="grid grid-cols-2 gap-2">
              {TRIGGER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSeq({ ...seq, trigger: option.value as any })}
                  className={`p-3 rounded-lg border-2 text-left transition ${
                    seq.trigger === option.value
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs text-slate-600">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">Email Steps</label>
              <button
                onClick={handleAddStep}
                className="flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 font-medium"
              >
                <Plus className="h-4 w-4" />
                Add Step
              </button>
            </div>

            {seq.steps.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-lg text-center text-sm text-slate-600">
                Add email steps to create your automation sequence
              </div>
            ) : (
              <div className="space-y-3">
                {seq.steps
                  .sort((a, b) => a.order - b.order)
                  .map((step, idx) => (
                    <div key={step.id} className="p-4 bg-slate-50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="inline-block px-3 py-1 bg-violet-600 text-white text-xs rounded-full font-medium">
                          Step {idx + 1}
                        </div>
                        <button
                          onClick={() => handleRemoveStep(step.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email Template</label>
                        <select
                          value={step.templateId}
                          onChange={e => handleUpdateStep(step.id, { templateId: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                          <option value="">Select template...</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Send after (hours)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={step.delayHours}
                          onChange={e => handleUpdateStep(step.id, { delayHours: parseInt(e.target.value) })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-6 border-t border-slate-200">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(seq)}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
            >
              Save Automation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
