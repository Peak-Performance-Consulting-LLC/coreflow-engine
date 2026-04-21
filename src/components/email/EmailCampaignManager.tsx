import { useState } from 'react';
import { Send, Calendar, Users, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { EmailCampaign } from '../../lib/email-template-service';

interface EmailCampaignManagerProps {
  templates: any[];
}

interface CampaignDraft {
  name: string;
  description: string;
  templateId: string;
  recipientFilters: {
    recordStages?: string[];
    recordSources?: string[];
    recordTags?: string[];
    recordAssignedTo?: string[];
  };
  scheduling: {
    type: 'immediate' | 'scheduled' | 'recurring';
    sendTime?: string;
    timezone?: string;
    recurrenceRule?: string;
  };
  recipientCount?: number;
}

export function EmailCampaignManager({ templates }: EmailCampaignManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const campaigns: EmailCampaign[] = []; // Would be fetched from backend in production
  const [draft, setDraft] = useState<CampaignDraft>({
    name: '',
    description: '',
    templateId: '',
    recipientFilters: {},
    scheduling: { type: 'immediate', timezone: 'UTC' },
  });

  const handleCreateCampaign = async () => {
    if (!draft.name || !draft.templateId) {
      toast.error('Please fill in required fields');
      return;
    }

    try {
      // Campaign creation logic would go here
      toast.success('Campaign created');
      setIsCreating(false);
      setDraft({
        name: '',
        description: '',
        templateId: '',
        recipientFilters: {},
        scheduling: { type: 'immediate', timezone: 'UTC' },
      });
    } catch (error) {
      toast.error('Failed to create campaign');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Email Campaigns</h3>
        <button
          onClick={() => setIsCreating(!isCreating)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
        >
          <Send className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {/* Create Campaign Form */}
      {isCreating && (
        <CampaignCreationForm
          draft={draft}
          onDraftChange={setDraft}
          templates={templates}
          onCreate={handleCreateCampaign}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {/* Campaigns List */}
      <div className="grid gap-4">
        {campaigns.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
            <Send className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600">No campaigns yet</p>
            <p className="text-sm text-slate-500">Create your first campaign to start sending emails</p>
          </div>
        ) : (
          campaigns.map(campaign => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))
        )}
      </div>
    </div>
  );
}

function CampaignCreationForm({
  draft,
  onDraftChange,
  templates,
  onCreate,
  onCancel,
}: {
  draft: CampaignDraft;
  onDraftChange: (draft: CampaignDraft) => void;
  templates: any[];
  onCreate: () => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition ${
                s === step
                  ? 'bg-violet-600 text-white'
                  : s < step
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-700'
              }`}
            >
              {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className="w-8 h-0.5 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Template Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-slate-900">Choose Email Template</h4>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Campaign Name</label>
            <input
              type="text"
              value={draft.name}
              onChange={e => onDraftChange({ ...draft, name: e.target.value })}
              placeholder="e.g., Welcome Email Campaign"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
            <textarea
              value={draft.description}
              onChange={e => onDraftChange({ ...draft, description: e.target.value })}
              placeholder="What is this campaign about?"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Email Template</label>
            <div className="grid grid-cols-2 gap-3">
              {templates.map(template => (
                <button
                  key={template.id}
                  onClick={() => onDraftChange({ ...draft, templateId: template.id })}
                  className={`p-4 rounded-lg border-2 text-left transition ${
                    draft.templateId === template.id
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium text-sm text-slate-900">{template.name}</div>
                  <div className="text-xs text-slate-600 mt-1">{template.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Recipients */}
      {step === 2 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Select Recipients
          </h4>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Filter by Stage
              </label>
              <input
                type="text"
                placeholder="Enter stage names separated by commas"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Filter by Source
              </label>
              <input
                type="text"
                placeholder="e.g., Website, LinkedIn, Referral"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Filter by Tags
              </label>
              <input
                type="text"
                placeholder="e.g., VIP, Priority, Active"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <div className="font-medium mb-1">Estimated Recipients: 245</div>
                <p>Based on current filters. Exact count will be calculated before sending.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Scheduling */}
      {step === 3 && (
        <div className="space-y-4">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule & Send
          </h4>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Send Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'immediate', label: 'Send Now', icon: '✉️' },
                { value: 'scheduled', label: 'Schedule', icon: '📅' },
                { value: 'recurring', label: 'Recurring', icon: '🔄' },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() =>
                    onDraftChange({
                      ...draft,
                      scheduling: { ...draft.scheduling, type: option.value as any },
                    })
                  }
                  className={`p-3 rounded-lg border-2 transition ${
                    draft.scheduling.type === option.value
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xl mb-1">{option.icon}</div>
                  <div className="text-xs font-medium">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          {draft.scheduling.type === 'scheduled' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Send Date & Time</label>
                <input
                  type="datetime-local"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                <select className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option>UTC</option>
                  <option>EST (UTC-5)</option>
                  <option>CST (UTC-6)</option>
                  <option>MST (UTC-7)</option>
                  <option>PST (UTC-8)</option>
                </select>
              </div>
            </>
          )}

          {draft.scheduling.type === 'recurring' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Recurrence</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500">
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Custom Rule</option>
              </select>
            </div>
          )}

          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-900">
                <div className="font-medium">Ready to send!</div>
                <p>Campaign will be sent to 245 recipients</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 justify-between pt-6 border-t border-slate-200">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
        >
          Cancel
        </button>

        <div className="flex gap-3">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition disabled:opacity-50"
          >
            Back
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onCreate}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Send className="h-4 w-4" />
              Send Campaign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: EmailCampaign }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold text-slate-900">{campaign.name}</h4>
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            campaign.status === 'completed'
              ? 'bg-green-100 text-green-700'
              : campaign.status === 'draft'
                ? 'bg-slate-100 text-slate-700'
                : 'bg-blue-100 text-blue-700'
          }`}
        >
          {campaign.status}
        </span>
      </div>
      <p className="text-sm text-slate-600 mb-3">{campaign.description}</p>
      <div className="flex gap-4 text-xs text-slate-500">
        <span>Sent: {campaign.recipient_count || 0}</span>
        <span>Opens: 0</span>
        <span>Clicks: 0</span>
      </div>
    </div>
  );
}
