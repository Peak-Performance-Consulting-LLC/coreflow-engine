import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  Copy,
  Edit3,
  Eye,
  FileUp,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Palette,
  Wand2,
  Layers,
  Play,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { useAuth } from '../hooks/useAuth';
import { usePageGuide } from '../hooks/useAppGuide';
import type { WorkspaceSummary } from '../lib/types';
import { getSupabaseClient } from '../lib/supabaseClient';
import {
  type EmailTemplate,
  type EmailTemplateCategory,
  type EmailTemplateAsset,
  type EmailCampaign,
  type EmailCampaignStats,
  type EmailLayoutBlock,
  type EmailLayoutBlockType,
  type EmailTemplateLayout,
  type CampaignEnumerationResult,
  fetchTemplateCategories,
  fetchTemplates,
  createTemplate,
  updateTemplate,
  cloneTemplate,
  deleteTemplate,
  fetchAssets,
  uploadAsset,
  deleteAsset,
  fetchCampaigns,
  createCampaign,
  deleteCampaign,
  fetchCampaignStats,
  enumerateCampaignRecipients,
  sendCampaignBatch,
  deriveTemplateOutputs,
  sendManualEmail,
  EMAIL_TEMPLATE_ALLOWED_VARIABLES,
  validateTemplateVariables,
} from '../lib/email-template-service';

function cls(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ');
}

type Tab = 'templates' | 'campaigns' | 'assets';

type RecordOption = {
  id: string;
  label: string;
  email: string;
};

const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
  { id: 'templates', label: 'Templates', icon: Mail },
  { id: 'campaigns', label: 'Campaigns', icon: Send },
  { id: 'assets', label: 'Assets & Logos', icon: ImageIcon },
];

const RECORD_STATUSES = ['open', 'qualified', 'nurturing', 'closed'];
const BLOCK_TYPES: EmailLayoutBlockType[] = ['header', 'hero', 'text', 'image', 'cta', 'divider', 'footer'];
const SAMPLE_VARIABLE_VALUES: Record<string, string> = {
  lead_full_name: 'Alex Morgan',
  lead_first_name: 'Alex',
  lead_email: 'alex@example.com',
  workspace_name: 'CoreFlow Workspace',
  sender_name: 'Success Team',
  sender_email: 'support@coreflow.ai',
};

function parseCsv(value: string) {
  return Array.from(new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean)));
}

function applySampleVariables(value: string) {
  return value.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, token: string) => SAMPLE_VARIABLE_VALUES[token] ?? `{{${token}}}`);
}

function parseExternalRecipientsInput(value: string) {
  const entries = value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const deduped = new Map<string, { email: string; name?: string }>();

  for (const entry of entries) {
    const namedMatch = entry.match(/^(.+?)\s*<([^>]+)>$/);
    const candidateEmail = namedMatch ? namedMatch[2] : entry;
    const email = candidateEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    const name = namedMatch ? namedMatch[1].trim() : undefined;
    const existing = deduped.get(email);
    if (!existing) {
      deduped.set(email, name ? { email, name } : { email });
      continue;
    }

    if (!existing.name && name) {
      deduped.set(email, { email, name });
    }
  }

  return Array.from(deduped.values());
}

function nextBlock(type: EmailLayoutBlockType): EmailLayoutBlock {
  if (type === 'header') {
    return { id: crypto.randomUUID(), type, title: 'Your Brand', subtitle: 'Powered by CoreFlow', align: 'left' };
  }

  if (type === 'hero') {
    return { id: crypto.randomUUID(), type, title: 'A headline your customer will read', subtitle: 'Add your supporting message', align: 'left' };
  }

  if (type === 'image') {
    return { id: crypto.randomUUID(), type, imageUrl: '', altText: '', align: 'center' };
  }

  if (type === 'cta') {
    return { id: crypto.randomUUID(), type, buttonLabel: 'Take action', buttonUrl: 'https://', align: 'left' };
  }

  if (type === 'divider') {
    return { id: crypto.randomUUID(), type };
  }

  if (type === 'footer') {
    return { id: crypto.randomUUID(), type, content: 'Need help? Reply to this email.', align: 'left' };
  }

  return { id: crypto.randomUUID(), type, content: 'Write your message here.', align: 'left' };
}

export function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { workspace, signOut } = useAuth();

  if (!workspace) return null;

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  return <EmailTemplatesPageInner workspace={workspace} onSignOut={handleSignOut} />;
}

function EmailTemplatesPageInner({
  workspace,
  onSignOut,
}: {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<EmailTemplateCategory[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [assets, setAssets] = useState<EmailTemplateAsset[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [recordOptions, setRecordOptions] = useState<RecordOption[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, tmps, ast, cmp] = await Promise.all([
        fetchTemplateCategories(workspace.id),
        fetchTemplates(workspace.id),
        fetchAssets(workspace.id),
        fetchCampaigns(workspace.id),
      ]);

      const sb = getSupabaseClient();
      const { data: records, error: recordsError } = await sb
        .from('records')
        .select('id, title, full_name, email')
        .eq('workspace_id', workspace.id)
        .is('archived_at', null)
        .not('email', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);

      if (recordsError) {
        throw new Error(recordsError.message);
      }

      setCategories(cats);
      setTemplates(tmps);
      setAssets(ast);
      setCampaigns(cmp);
      setRecordOptions(
        (records ?? [])
          .map((record) => {
            const email = typeof record.email === 'string' ? record.email.trim() : '';
            if (!email) return null;
            const label = record.full_name || record.title || email;
            return { id: record.id, label, email };
          })
          .filter((entry): entry is RecordOption => Boolean(entry)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  usePageGuide({
    key: 'email-templates-campaigns',
    title: 'Manage templates, campaigns, and assets',
    summary:
      'This page holds the reusable email content layer for the workspace, including visual templates, campaign runs, and uploaded brand assets.',
    nextStep:
      activeTab === 'templates'
        ? 'Review the template library first so campaigns have approved content to work from.'
        : activeTab === 'campaigns'
          ? 'Inspect the campaign list next to see what is sending, paused, or ready to run.'
          : 'Use the asset area to maintain logos and media shared by workspace templates.',
    highlights: ['Visual templates', 'Campaign runs', 'Brand assets'],
    autoStart: 'once',
    steps: [
      {
        id: 'email-templates-header',
        title: 'Understand the content workspace',
        body: 'This page focuses on reusable email content and campaigns rather than sender configuration.',
        targetId: 'email-templates-header',
      },
      {
        id: 'email-templates-tabs',
        title: 'Switch between templates, campaigns, and assets',
        body: 'Each tab controls a different part of the content workflow so the team can stay focused on one job at a time.',
        targetId: 'email-templates-tabs',
      },
    ],
  });

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={onSignOut}>
      <div className="mb-6 flex items-start justify-between gap-4" data-guide-id="email-templates-header">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Mail className="h-5 w-5" />
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Email Templates & Campaigns</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Build visual email templates, freeze campaign recipients, and send personalized emails safely.
          </p>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cls('h-3.5 w-3.5', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <div className="mb-5 flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1" data-guide-id="email-templates-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cls(
                'flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:bg-white/60 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto shrink-0">
            <X className="h-4 w-4 text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {loading && !templates.length ? (
        <LoadingSkeleton />
      ) : (
        <>
          {activeTab === 'templates' && (
            <TemplatesTab
              categories={categories}
              templates={templates}
              assets={assets}
              workspaceId={workspace.id}
              recordOptions={recordOptions}
              onRefresh={reload}
            />
          )}
          {activeTab === 'campaigns' && (
            <CampaignsTab
              campaigns={campaigns}
              templates={templates}
              workspaceId={workspace.id}
              onRefresh={reload}
            />
          )}
          {activeTab === 'assets' && <AssetsTab assets={assets} workspaceId={workspace.id} onRefresh={reload} />}
        </>
      )}
    </WorkspaceLayout>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function TemplatesTab({
  categories,
  templates,
  assets,
  workspaceId,
  recordOptions,
  onRefresh,
}: {
  categories: EmailTemplateCategory[];
  templates: EmailTemplate[];
  assets: EmailTemplateAsset[];
  workspaceId: string;
  recordOptions: RecordOption[];
  onRefresh: () => void;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [manualSendTemplate, setManualSendTemplate] = useState<EmailTemplate | null>(null);

  const filteredTemplates = selectedCategory
    ? templates.filter((template) => template.category_id === selectedCategory)
    : templates;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Template Library</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setManualSendTemplate(templates[0] ?? null)}
            disabled={templates.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Manual Send
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" />
            Create Template
          </button>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cls(
              'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition',
              !selectedCategory
                ? 'bg-violet-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={cls(
                'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition',
                selectedCategory === category.id
                  ? 'bg-violet-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              )}
            >
              {category.icon} {category.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={() => setSelectedTemplate(template)}
            onEdit={() => setEditingTemplate(template)}
            onManualSend={() => setManualSendTemplate(template)}
            onClone={() => {
              cloneTemplate(template.id, workspaceId, `${template.name} (Copy)`)
                .then(() => {
                  toast.success('Template cloned successfully');
                  onRefresh();
                })
                .catch((e) => toast.error(e.message));
            }}
            onDelete={() => {
              if (confirm('Delete this template?')) {
                deleteTemplate(template.id)
                  .then(() => {
                    toast.success('Template deleted');
                    onRefresh();
                  })
                  .catch((e) => toast.error(e.message));
              }
            }}
          />
        ))}
      </div>

      {selectedTemplate && (
        <TemplateDetailPanel
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onEdit={() => setEditingTemplate(selectedTemplate)}
        />
      )}

      {(editingTemplate || isCreating) && (
        <TemplateEditorModal
          template={editingTemplate ?? undefined}
          workspaceId={workspaceId}
          categories={categories}
          assets={assets}
          onClose={() => {
            setEditingTemplate(null);
            setIsCreating(false);
          }}
          onSuccess={() => {
            setEditingTemplate(null);
            setIsCreating(false);
            onRefresh();
          }}
        />
      )}

      {manualSendTemplate && (
        <ManualSendModal
          workspaceId={workspaceId}
          template={manualSendTemplate}
          templates={templates}
          recordOptions={recordOptions}
          onClose={() => setManualSendTemplate(null)}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  onSelect,
  onEdit,
  onClone,
  onDelete,
  onManualSend,
}: {
  template: EmailTemplate;
  onSelect: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onManualSend: () => void;
}) {
  const blockCount = Number((template.preview_meta as Record<string, unknown> | undefined)?.block_count ?? 0) || 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-md">
      {template.thumbnail_url && (
        <img src={template.thumbnail_url} alt={template.name} className="w-full h-40 object-cover rounded-xl mb-3" />
      )}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900 truncate">{template.name}</h3>
            {template.use_case && <p className="text-xs text-slate-500 capitalize">{template.use_case}</p>}
          </div>
          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700">
            <Layers className="mr-1 h-3 w-3" />
            {blockCount} blocks
          </span>
        </div>
        {template.description && <p className="text-xs text-slate-500 line-clamp-2">{template.description}</p>}
        <div className="flex flex-wrap gap-1 pt-2">
          <button
            onClick={onSelect}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Eye className="inline h-3 w-3 mr-1" />
            Preview
          </button>
          {!template.is_locked && (
            <button
              onClick={onEdit}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Edit3 className="inline h-3 w-3 mr-1" />
              Edit
            </button>
          )}
          <button
            onClick={onClone}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Copy className="inline h-3 w-3 mr-1" />
            Clone
          </button>
          <button
            onClick={onManualSend}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Send className="inline h-3 w-3 mr-1" />
            Manual Send
          </button>
          {!template.is_locked && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="inline h-3 w-3 mr-1" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateDetailPanel({
  template,
  onClose,
  onEdit,
}: {
  template: EmailTemplate;
  onClose: () => void;
  onEdit: () => void;
}) {
  const previewHtml = template.preview_html || template.body_html_template || deriveTemplateOutputs(template.layout_json, template.theme_overrides).preview_html;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="font-bold text-slate-900">{template.name}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Line</label>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{template.subject_template}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Visual Preview</label>
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="max-h-[460px] overflow-auto p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            {!template.is_locked && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
              >
                <Edit3 className="h-4 w-4" />
                Edit Template
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateEditorModal({
  template,
  workspaceId,
  categories,
  assets,
  onClose,
  onSuccess,
}: {
  template?: EmailTemplate;
  workspaceId: string;
  categories: EmailTemplateCategory[];
  assets: EmailTemplateAsset[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const initialLayout = template?.layout_json?.blocks?.length
    ? template.layout_json
    : ({ version: 1, blocks: [nextBlock('header'), nextBlock('hero'), nextBlock('text'), nextBlock('cta'), nextBlock('footer')] } satisfies EmailTemplateLayout);

  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject_template ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [categoryId, setCategoryId] = useState(template?.category_id ?? categories[0]?.id ?? '');
  const [layout, setLayout] = useState<EmailTemplateLayout>(initialLayout);
  const [themeOverrides, setThemeOverrides] = useState<Record<string, unknown>>((template?.theme_overrides ?? {}) as Record<string, unknown>);
  const [localAssets, setLocalAssets] = useState<EmailTemplateAsset[]>(assets);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => deriveTemplateOutputs(layout, themeOverrides), [layout, themeOverrides]);
  const previewSubject = useMemo(() => applySampleVariables(subject), [subject]);
  const previewHtml = useMemo(() => applySampleVariables(preview.preview_html), [preview.preview_html]);
  const variableValidation = useMemo(() => (
    validateTemplateVariables({
      subject_template: subject,
      layout_json: layout,
    })
  ), [subject, layout]);
  const hasVariableErrors = variableValidation.unsupported.length > 0;

  const imageAssets = useMemo(
    () => localAssets.filter((asset) => asset.file_type === 'image'),
    [localAssets],
  );
  const documentAssets = useMemo(
    () => localAssets.filter((asset) => asset.file_type === 'document' || asset.file_type === 'attachment'),
    [localAssets],
  );

  function getMeta(block: EmailLayoutBlock) {
    const meta = block.meta;
    return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
  }

  function updateBlock(index: number, patch: Partial<EmailLayoutBlock>) {
    setLayout((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) => (blockIndex === index ? { ...block, ...patch } : block)),
    }));
  }

  function removeBlock(index: number) {
    setLayout((current) => ({
      ...current,
      blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index),
    }));
  }

  function updateBlockMeta(index: number, patch: Record<string, unknown>) {
    setLayout((current) => ({
      ...current,
      blocks: current.blocks.map((block, blockIndex) => {
        if (blockIndex !== index) return block;
        const currentMeta = getMeta(block);
        return { ...block, meta: { ...currentMeta, ...patch } };
      }),
    }));
  }

  function readResourceList(block: EmailLayoutBlock, key: 'links' | 'documents') {
    const value = getMeta(block)[key];
    if (!Array.isArray(value)) return [] as Array<{ label: string; url: string }>;
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const label = typeof entry.label === 'string' ? entry.label : '';
        const url = typeof entry.url === 'string' ? entry.url : '';
        if (!url.trim()) return null;
        return { label, url };
      })
      .filter((entry): entry is { label: string; url: string } => Boolean(entry));
  }

  function writeResourceList(index: number, key: 'links' | 'documents', items: Array<{ label: string; url: string }>) {
    updateBlockMeta(index, { [key]: items.filter((entry) => entry.url.trim().length > 0) });
  }

  async function handleInlineAssetUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingAsset(true);
    try {
      const fileType = file.type.startsWith('image/') ? 'image' : 'document';
      const uploaded = await uploadAsset(workspaceId, file, fileType, file.name.toLowerCase().includes('logo'));
      setLocalAssets((current) => [uploaded, ...current]);
      toast.success('Asset uploaded and ready to use.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Asset upload failed.');
    } finally {
      setUploadingAsset(false);
      event.target.value = '';
    }
  }

  async function handleSave() {
    if (hasVariableErrors) {
      toast.error(`Unsupported variables: ${variableValidation.unsupported.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      if (template) {
        await updateTemplate(template.id, {
          name,
          description,
          category_id: categoryId || undefined,
          subject_template: subject,
          layout_json: layout,
          theme_overrides: themeOverrides,
        });
        toast.success('Template updated');
      } else {
        await createTemplate(workspaceId, {
          name,
          description,
          category_id: categoryId || undefined,
          subject_template: subject,
          is_active: true,
          is_locked: false,
          template_type: 'custom',
          include_footer: true,
          is_html: true,
          layout_json: layout,
          theme_overrides: themeOverrides,
        });
        toast.success('Template created');
      }
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-6xl rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-hidden">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h2 className="font-bold text-slate-900">{template ? 'Edit Visual Template' : 'Create Visual Template'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Use blocks to build email-client-safe templates.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="grid h-[calc(92vh-72px)] grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] overflow-hidden">
          <div className="overflow-y-auto border-r border-slate-100 p-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Line *</label>
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                placeholder="Welcome {{lead_first_name}}"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700">Variables</p>
              <p className="text-[11px] text-slate-500">Use these placeholders in subject/body. Click to copy.</p>
              <div className="flex flex-wrap gap-2">
                {EMAIL_TEMPLATE_ALLOWED_VARIABLES.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(`{{${token}}}`);
                      toast.success(`Copied {{${token}}}`);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-violet-300 hover:text-violet-700"
                  >
                    {`{{${token}}}`}
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-slate-500">
                Used: {variableValidation.used.length ? variableValidation.used.join(', ') : 'None'}
              </div>
              {hasVariableErrors && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-semibold text-red-700">
                  Unsupported variables: {variableValidation.unsupported.join(', ')}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Palette className="h-4 w-4" /> Theme</h3>
                  <p className="text-xs text-slate-500">Apply professional visual styling across the template.</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { key: 'accent_color', label: 'Accent', fallback: '#4f46e5' },
                  { key: 'secondary_color', label: 'Heading', fallback: '#0f172a' },
                  { key: 'text_color', label: 'Text', fallback: '#334155' },
                  { key: 'body_bg_color', label: 'Page bg', fallback: '#eef2ff' },
                  { key: 'card_bg_color', label: 'Card bg', fallback: '#ffffff' },
                ].map((entry) => (
                  <label key={entry.key} className="text-xs font-semibold text-slate-600">
                    {entry.label}
                    <input
                      type="color"
                      value={typeof themeOverrides[entry.key] === 'string' && themeOverrides[entry.key] ? String(themeOverrides[entry.key]) : entry.fallback}
                      onChange={(event) => setThemeOverrides((current) => ({ ...current, [entry.key]: event.target.value }))}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white p-1"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2"><FileUp className="h-4 w-4" /> Upload Assets</h3>
                  <p className="text-xs text-slate-500">Upload images and docs directly while creating templates.</p>
                </div>
                <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  {uploadingAsset ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleInlineAssetUpload}
                    disabled={uploadingAsset}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Template Blocks</h3>
                  <p className="text-xs text-slate-500">Header, hero, text, image, CTA, divider, footer</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BLOCK_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setLayout((current) => ({ ...current, blocks: [...current.blocks, nextBlock(type)] }))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium capitalize text-slate-700 hover:bg-slate-50"
                  >
                    + {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {layout.blocks.map((block, index) => (
                <div key={block.id ?? index} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={block.type}
                      onChange={(event) => {
                        const rebuilt = nextBlock(event.target.value as EmailLayoutBlockType);
                        updateBlock(index, { ...rebuilt, id: block.id ?? rebuilt.id });
                      }}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    >
                      {BLOCK_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <select
                      value={block.align ?? 'left'}
                      onChange={(event) => updateBlock(index, { align: event.target.value as 'left' | 'center' | 'right' })}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeBlock(index)}
                      className="ml-auto rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="text-[11px] font-semibold text-slate-500">
                      Top padding
                      <input
                        type="number"
                        min={0}
                        max={64}
                        value={Number(getMeta(block).paddingTop ?? (block.type === 'header' ? 24 : 12))}
                        onChange={(event) => updateBlockMeta(index, { paddingTop: Number(event.target.value) })}
                        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-500">
                      Bottom padding
                      <input
                        type="number"
                        min={0}
                        max={64}
                        value={Number(getMeta(block).paddingBottom ?? 12)}
                        onChange={(event) => updateBlockMeta(index, { paddingBottom: Number(event.target.value) })}
                        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-500">
                      Background
                      <input
                        type="color"
                        value={typeof getMeta(block).backgroundColor === 'string' && getMeta(block).backgroundColor ? String(getMeta(block).backgroundColor) : '#ffffff'}
                        onChange={(event) => updateBlockMeta(index, { backgroundColor: event.target.value })}
                        className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white p-1"
                      />
                    </label>
                    <label className="text-[11px] font-semibold text-slate-500">
                      Text color
                      <input
                        type="color"
                        value={typeof getMeta(block).textColor === 'string' && getMeta(block).textColor ? String(getMeta(block).textColor) : '#334155'}
                        onChange={(event) => updateBlockMeta(index, { textColor: event.target.value })}
                        className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white p-1"
                      />
                    </label>
                  </div>

                  {(block.type === 'header' || block.type === 'hero') && (
                    <>
                      <input
                        value={block.title ?? ''}
                        onChange={(event) => updateBlock(index, { title: event.target.value })}
                        placeholder="Title"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        value={block.subtitle ?? ''}
                        onChange={(event) => updateBlock(index, { subtitle: event.target.value })}
                        placeholder="Subtitle"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                    </>
                  )}

                  {block.type === 'text' || block.type === 'footer' ? (
                    <textarea
                      value={block.content ?? ''}
                      onChange={(event) => updateBlock(index, { content: event.target.value })}
                      placeholder="Block content"
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    />
                  ) : null}

                  {block.type === 'image' && (
                    <>
                      <input
                        value={block.imageUrl ?? ''}
                        onChange={(event) => updateBlock(index, { imageUrl: event.target.value })}
                        placeholder="Image URL"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        value={block.altText ?? ''}
                        onChange={(event) => updateBlock(index, { altText: event.target.value })}
                        placeholder="Alt text"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <select
                        value=""
                        onChange={(event) => {
                          const asset = imageAssets.find((entry) => entry.id === event.target.value);
                          if (asset) {
                            updateBlock(index, { imageUrl: asset.public_url, altText: block.altText || asset.name });
                          }
                          event.currentTarget.value = '';
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      >
                        <option value="">Insert from uploaded images</option>
                        {imageAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>{asset.name}</option>
                        ))}
                      </select>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[11px] font-semibold text-slate-500">
                          Width %
                          <input
                            type="number"
                            min={20}
                            max={100}
                            value={Number(getMeta(block).widthPercent ?? 100)}
                            onChange={(event) => updateBlockMeta(index, { widthPercent: Number(event.target.value) })}
                            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-500">
                          Radius
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={Number(getMeta(block).imageRadius ?? 12)}
                            onChange={(event) => updateBlockMeta(index, { imageRadius: Number(event.target.value) })}
                            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {block.type === 'cta' && (
                    <>
                      <input
                        value={block.buttonLabel ?? ''}
                        onChange={(event) => updateBlock(index, { buttonLabel: event.target.value })}
                        placeholder="Button label"
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <input
                        value={block.buttonUrl ?? ''}
                        onChange={(event) => updateBlock(index, { buttonUrl: event.target.value })}
                        placeholder="https://..."
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <label className="text-[11px] font-semibold text-slate-500">
                          Button bg
                          <input
                            type="color"
                            value={typeof getMeta(block).buttonBackgroundColor === 'string' && getMeta(block).buttonBackgroundColor ? String(getMeta(block).buttonBackgroundColor) : '#4f46e5'}
                            onChange={(event) => updateBlockMeta(index, { buttonBackgroundColor: event.target.value })}
                            className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white p-1"
                          />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-500">
                          Button text
                          <input
                            type="color"
                            value={typeof getMeta(block).buttonTextColor === 'string' && getMeta(block).buttonTextColor ? String(getMeta(block).buttonTextColor) : '#ffffff'}
                            onChange={(event) => updateBlockMeta(index, { buttonTextColor: event.target.value })}
                            className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white p-1"
                          />
                        </label>
                        <label className="text-[11px] font-semibold text-slate-500">
                          Radius
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={Number(getMeta(block).buttonRadius ?? 10)}
                            onChange={(event) => updateBlockMeta(index, { buttonRadius: Number(event.target.value) })}
                            className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                        </label>
                      </div>
                    </>
                  )}

                  {block.type !== 'divider' && (
                    <div className="mt-3 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                        <Link2 className="h-3.5 w-3.5" />
                        Links
                      </div>
                      {readResourceList(block, 'links').map((link, linkIndex) => (
                        <div key={`${block.id ?? index}-link-${linkIndex}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <input
                            value={link.label}
                            onChange={(event) => {
                              const links = readResourceList(block, 'links');
                              links[linkIndex] = { ...links[linkIndex], label: event.target.value };
                              writeResourceList(index, 'links', links);
                            }}
                            placeholder="Label"
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          <input
                            value={link.url}
                            onChange={(event) => {
                              const links = readResourceList(block, 'links');
                              links[linkIndex] = { ...links[linkIndex], url: event.target.value };
                              writeResourceList(index, 'links', links);
                            }}
                            placeholder="https://..."
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const links = readResourceList(block, 'links').filter((_, idx) => idx !== linkIndex);
                              writeResourceList(index, 'links', links);
                            }}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => writeResourceList(index, 'links', [...readResourceList(block, 'links'), { label: '', url: '' }])}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        + Add Link
                      </button>

                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 pt-2">
                        <Paperclip className="h-3.5 w-3.5" />
                        Documents
                      </div>
                      {readResourceList(block, 'documents').map((doc, docIndex) => (
                        <div key={`${block.id ?? index}-doc-${docIndex}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                          <input
                            value={doc.label}
                            onChange={(event) => {
                              const docs = readResourceList(block, 'documents');
                              docs[docIndex] = { ...docs[docIndex], label: event.target.value };
                              writeResourceList(index, 'documents', docs);
                            }}
                            placeholder="Document name"
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          <input
                            value={doc.url}
                            onChange={(event) => {
                              const docs = readResourceList(block, 'documents');
                              docs[docIndex] = { ...docs[docIndex], url: event.target.value };
                              writeResourceList(index, 'documents', docs);
                            }}
                            placeholder="Public URL"
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const docs = readResourceList(block, 'documents').filter((_, idx) => idx !== docIndex);
                              writeResourceList(index, 'documents', docs);
                            }}
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => writeResourceList(index, 'documents', [...readResourceList(block, 'documents'), { label: '', url: '' }])}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        >
                          + Add Document
                        </button>
                        <select
                          value=""
                          onChange={(event) => {
                            const asset = documentAssets.find((entry) => entry.id === event.target.value);
                            if (asset) {
                              writeResourceList(index, 'documents', [
                                ...readResourceList(block, 'documents'),
                                { label: asset.name, url: asset.public_url },
                              ]);
                            }
                            event.currentTarget.value = '';
                          }}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        >
                          <option value="">Insert uploaded doc</option>
                          {documentAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>{asset.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto bg-slate-50 p-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Live Preview</h3>
              <p className="mt-1 text-xs text-slate-500">Rendering from block layout with sample variable values</p>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                Subject: {previewSubject || '(No subject yet)'}
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 p-3 max-h-[55vh] overflow-auto" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !name.trim() || !subject.trim() || hasVariableErrors}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Save Template
              </button>
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CampaignsTab({
  campaigns,
  templates,
  workspaceId,
  onRefresh,
}: {
  campaigns: EmailCampaign[];
  templates: EmailTemplate[];
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [managingCampaign, setManagingCampaign] = useState<EmailCampaign | null>(null);
  const [runningCampaignId, setRunningCampaignId] = useState<string | null>(null);

  const templateNameById = useMemo(() => {
    const index = new Map<string, string>();
    templates.forEach((template) => index.set(template.id, template.name));
    return index;
  }, [templates]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Email Campaigns</h2>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          Create Campaign
        </button>
      </div>

      <div className="grid gap-4">
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
            <Send className="mx-auto h-8 w-8 text-slate-400 mb-3" />
            <p className="font-semibold text-slate-700">No campaigns yet</p>
            <p className="text-sm text-slate-500">Create one, review recipients, then freeze and dispatch.</p>
          </div>
        ) : (
          campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              templateName={templateNameById.get(campaign.template_id) ?? 'Unknown template'}
              onManageRecipients={() => setManagingCampaign(campaign)}
              onSendBatch={async () => {
                setRunningCampaignId(campaign.id);
                try {
                  const result = await sendCampaignBatch(workspaceId, campaign.id, { batch_size: 50 });
                  toast.success(`Processed ${result.processed}. Sent ${result.sent}, failed ${result.failed}, suppressed ${result.suppressed}.`);
                  onRefresh();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : 'Failed to send campaign batch.');
                } finally {
                  setRunningCampaignId(null);
                }
              }}
              sending={runningCampaignId === campaign.id}
              onDelete={() => {
                if (confirm('Delete this campaign?')) {
                  deleteCampaign(campaign.id)
                    .then(() => {
                      toast.success('Campaign deleted');
                      onRefresh();
                    })
                    .catch((error) => toast.error(error.message));
                }
              }}
            />
          ))
        )}
      </div>

      {isCreating && (
        <CampaignCreatorModal
          templates={templates}
          workspaceId={workspaceId}
          onClose={() => setIsCreating(false)}
          onCreated={(campaign) => {
            setIsCreating(false);
            setManagingCampaign(campaign);
            onRefresh();
          }}
        />
      )}

      {managingCampaign && (
        <CampaignRecipientsModal
          campaign={managingCampaign}
          workspaceId={workspaceId}
          onClose={() => setManagingCampaign(null)}
          onRefreshed={onRefresh}
        />
      )}
    </div>
  );
}

function CampaignCard({
  campaign,
  templateName,
  onManageRecipients,
  onSendBatch,
  onDelete,
  sending,
}: {
  campaign: EmailCampaign;
  templateName: string;
  onManageRecipients: () => void;
  onSendBatch: () => void;
  onDelete: () => void;
  sending: boolean;
}) {
  const [stats, setStats] = useState<EmailCampaignStats | null>(null);

  useEffect(() => {
    fetchCampaignStats(campaign.id)
      .then(setStats)
      .catch(() => {
        setStats(null);
      });
  }, [campaign.id]);

  const statusColor: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    scheduled: 'bg-blue-100 text-blue-700',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor[campaign.status] || statusColor.draft}`}>
              {campaign.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Template: {templateName}</p>
          {campaign.description && <p className="text-sm text-slate-500 mt-1">{campaign.description}</p>}
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-600">
            <span>{campaign.recipient_count} recipients</span>
            {stats && (
              <>
                <span className="text-emerald-600">{stats.sent_count} sent</span>
                <span className="text-red-600">{stats.failed_count} failed</span>
                <span className="text-slate-500">{stats.unsubscribed_count} suppressed</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={onManageRecipients}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Recipient Review
          </button>
          <button
            onClick={onSendBatch}
            disabled={sending}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Dispatch Batch'}
          </button>
          <button onClick={onDelete} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignCreatorModal({
  templates,
  workspaceId,
  onClose,
  onCreated,
}: {
  templates: EmailTemplate[];
  workspaceId: string;
  onClose: () => void;
  onCreated: (campaign: EmailCampaign) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name || !templateId) {
      toast.error('Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const campaign = await createCampaign(workspaceId, {
        name,
        description,
        template_id: templateId,
        status: 'draft',
        timezone: 'UTC',
        rate_limit: 0,
        segment_definition: {},
        manual_include_record_ids: [],
        manual_exclude_record_ids: [],
      });
      toast.success('Campaign created. Review recipients next.');
      onCreated(campaign);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="font-bold text-slate-900">Create Campaign</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Campaign Name *</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Template *</label>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCreate}
            disabled={saving || !name || !templateId}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create & Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignRecipientsModal({
  campaign,
  workspaceId,
  onClose,
  onRefreshed,
}: {
  campaign: EmailCampaign;
  workspaceId: string;
  onClose: () => void;
  onRefreshed: () => void;
}) {
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    Array.isArray(campaign.segment_definition?.statuses)
      ? (campaign.segment_definition?.statuses as string[])
      : [],
  );
  const [includeCsv, setIncludeCsv] = useState((campaign.manual_include_record_ids ?? []).join(','));
  const [excludeCsv, setExcludeCsv] = useState((campaign.manual_exclude_record_ids ?? []).join(','));
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [preview, setPreview] = useState<CampaignEnumerationResult | null>(null);

  async function runPreview(freeze: boolean) {
    const includeRecordIds = parseCsv(includeCsv);
    const excludeRecordIds = parseCsv(excludeCsv);
    const segmentDefinition: Record<string, unknown> = {};

    if (selectedStatuses.length > 0) {
      segmentDefinition.statuses = selectedStatuses;
    }

    if (freeze) {
      setFreezing(true);
    } else {
      setLoadingPreview(true);
    }

    try {
      const result = await enumerateCampaignRecipients(workspaceId, campaign.id, {
        segment_definition: segmentDefinition,
        include_record_ids: includeRecordIds,
        exclude_record_ids: excludeRecordIds,
        freeze_snapshot: freeze,
      });

      setPreview(result);

      if (freeze) {
        toast.success('Recipient snapshot frozen for this campaign.');
        onRefreshed();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to evaluate recipients.');
    } finally {
      setLoadingPreview(false);
      setFreezing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h2 className="font-bold text-slate-900">Recipient Review</h2>
            <p className="text-xs text-slate-500">{campaign.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Segment Filter</h3>
            <p className="text-xs text-slate-500 mt-0.5">Start with record segment, then add/remove manual IDs.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Record Statuses</label>
                <div className="flex flex-wrap gap-2">
                  {RECORD_STATUSES.map((status) => {
                    const active = selectedStatuses.includes(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setSelectedStatuses((current) => (
                            current.includes(status)
                              ? current.filter((entry) => entry !== status)
                              : [...current, status]
                          ));
                        }}
                        className={cls(
                          'rounded-full px-3 py-1 text-xs font-medium capitalize',
                          active ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-700',
                        )}
                      >
                        {status}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Include Record IDs</label>
                <input
                  value={includeCsv}
                  onChange={(event) => setIncludeCsv(event.target.value)}
                  placeholder="id1,id2,id3"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
                <label className="block text-xs font-semibold text-slate-600 mb-1 mt-3">Exclude Record IDs</label>
                <input
                  value={excludeCsv}
                  onChange={(event) => setExcludeCsv(event.target.value)}
                  placeholder="id4,id5"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runPreview(false)}
                disabled={loadingPreview || freezing}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {loadingPreview ? 'Previewing…' : 'Preview Recipients'}
              </button>
              <button
                type="button"
                onClick={() => void runPreview(true)}
                disabled={freezing || loadingPreview}
                className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {freezing ? 'Freezing…' : 'Freeze Snapshot'}
              </button>
            </div>
          </div>

          {preview && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricTile label="Candidates" value={preview.counts.total_candidates} />
                <MetricTile label="With Email" value={preview.counts.included_with_email} />
                <MetricTile label="Sendable" value={preview.counts.active_recipients} tone="success" />
                <MetricTile label="Suppressed" value={preview.counts.suppressed_recipients} tone="danger" />
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <div className="max-h-[360px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Record ID</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Recipient</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview.map((row) => (
                        <tr key={row.record_id} className="border-b border-slate-100">
                          <td className="px-3 py-2 text-slate-600">{row.record_id}</td>
                          <td className="px-3 py-2 text-slate-700">{row.recipient_name || row.recipient_email}</td>
                          <td className="px-3 py-2">
                            <span className={cls(
                              'rounded-full px-2 py-1 text-[11px] font-semibold',
                              row.suppressed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700',
                            )}>
                              {row.suppressed ? 'suppressed' : row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={cls('mt-1 text-lg font-bold', tone === 'success' && 'text-emerald-700', tone === 'danger' && 'text-red-700', !tone && 'text-slate-900')}>
        {value}
      </p>
    </div>
  );
}

function ManualSendModal({
  workspaceId,
  template,
  templates,
  recordOptions,
  onClose,
}: {
  workspaceId: string;
  template: EmailTemplate;
  templates: EmailTemplate[];
  recordOptions: RecordOption[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(template.id);
  const [externalRecipientsInput, setExternalRecipientsInput] = useState('');
  const [fallbackRecipientName, setFallbackRecipientName] = useState('');
  const [sending, setSending] = useState(false);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return recordOptions.slice(0, 200);

    return recordOptions
      .filter((option) => `${option.label} ${option.email}`.toLowerCase().includes(term))
      .slice(0, 200);
  }, [recordOptions, search]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) ?? template,
    [selectedTemplateId, template, templates],
  );
  const externalRecipients = useMemo(
    () => parseExternalRecipientsInput(externalRecipientsInput),
    [externalRecipientsInput],
  );
  const unnamedExternalCount = useMemo(
    () => externalRecipients.filter((recipient) => !recipient.name).length,
    [externalRecipients],
  );

  async function handleSendNow() {
    if (!selectedTemplate) {
      toast.error('Select a template first.');
      return;
    }

    if (selectedRecordIds.length === 0 && externalRecipients.length === 0) {
      toast.error('Select at least one lead or add external recipients.');
      return;
    }

    if (unnamedExternalCount > 0 && !fallbackRecipientName.trim()) {
      toast.error('Add names as "Name <email>" or set a default recipient name.');
      return;
    }

    setSending(true);
    try {
      const result = await sendManualEmail(workspaceId, {
        record_ids: selectedRecordIds,
        external_recipients: externalRecipients,
        fallback_recipient_name: fallbackRecipientName.trim() || undefined,
        template_id: selectedTemplate.id,
      });

      if (result.failed_count > 0 && result.sent_count === 0) {
        const firstFailure = result.failure_samples?.[0]?.error;
        toast.error(
          firstFailure
            ? `Email failed: ${firstFailure}`
            : `Manual send failed for ${result.failed_count} recipient(s).`,
        );
      } else if (result.failed_count > 0) {
        toast.warning(
          `Manual send partially completed. Sent ${result.sent_count}, failed ${result.failed_count}, suppressed ${result.suppressed_count}.`,
        );
      } else {
        toast.success(
          `Manual send complete. Sent ${result.sent_count}, failed ${result.failed_count}, suppressed ${result.suppressed_count}.`,
        );
      }

      if (result.sent_count > 0 || result.failed_count === 0) {
        onClose();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Manual send failed.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="font-bold text-slate-900">Manual Email Send</h2>
            <p className="text-xs text-slate-500">Choose template, leads, and optional external recipients.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-72px)]">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Template</label>
            <select
              value={selectedTemplate.id}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              {templates.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">External Recipients</p>
            <textarea
              value={externalRecipientsInput}
              onChange={(event) => setExternalRecipientsInput(event.target.value)}
              rows={3}
              placeholder="name@company.com, another@client.com or Alex Johnson <alex@company.com>"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-slate-500">
              {externalRecipients.length} valid external recipients detected
              {unnamedExternalCount > 0 ? ` • ${unnamedExternalCount} missing names` : ''}
            </p>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Default Recipient Name</label>
              <input
                value={fallbackRecipientName}
                onChange={(event) => setFallbackRecipientName(event.target.value)}
                placeholder="Used when recipient name is missing"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="text-xs font-semibold text-slate-700">Lead Recipients</p>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search lead name or email"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />

          <div className="rounded-2xl border border-slate-200 max-h-[380px] overflow-auto">
            {filteredRecords.map((option) => {
              const checked = selectedRecordIds.includes(option.id);
              return (
                <label key={option.id} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelectedRecordIds((current) => (
                        event.target.checked
                          ? [...current, option.id]
                          : current.filter((recordId) => recordId !== option.id)
                      ));
                    }}
                  />
                  <span className="font-medium text-slate-800">{option.label}</span>
                  <span className="ml-auto text-xs text-slate-500">{option.email}</span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{selectedRecordIds.length} leads selected • {externalRecipients.length} external selected</p>
            <button
              onClick={() => setSelectedRecordIds(filteredRecords.map((option) => option.id))}
              className="text-xs font-semibold text-violet-600 hover:text-violet-700"
            >
              Select visible
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void handleSendNow()}
              disabled={sending || (selectedRecordIds.length === 0 && externalRecipients.length === 0)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Send Now
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssetsTab({
  assets,
  workspaceId,
  onRefresh,
}: {
  assets: EmailTemplateAsset[];
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileType = file.type.startsWith('image/') ? 'image' : 'document';
      await uploadAsset(workspaceId, file, fileType, file.name.toLowerCase().includes('logo'));
      toast.success('Asset uploaded successfully');
      onRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Assets & Logos</h2>
        <label className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 cursor-pointer">
          <FileUp className="h-4 w-4" />
          Upload Asset
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-slate-400 mb-3" />
          <p className="font-semibold text-slate-700">No assets yet</p>
          <p className="text-sm text-slate-500">Upload logos, images, and documents to use in your email templates</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onDelete={() => {
                deleteAsset(asset.id)
                  .then(() => {
                    toast.success('Asset deleted');
                    onRefresh();
                  })
                  .catch((error) => toast.error(error.message));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  onDelete,
}: {
  asset: EmailTemplateAsset;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      {asset.file_type === 'image' ? (
        <img src={asset.public_url} alt={asset.name} className="w-full h-32 object-cover rounded-lg mb-3" />
      ) : (
        <div className="w-full h-32 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
          <FileUp className="h-8 w-8 text-slate-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-900 truncate">{asset.name}</p>
      <p className="text-xs text-slate-500 mt-1">
        {(asset.file_size / 1024).toFixed(1)} KB
        {asset.is_logo && ' • Logo'}
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => navigator.clipboard.writeText(asset.public_url)}
          className="flex-1 text-xs py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Copy URL
        </button>
        <button onClick={onDelete} className="px-2 py-1 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
