import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  Mail,
  MailOpen,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  ToggleLeft,
  ToggleRight,
  X,
  Zap,
} from 'lucide-react';
import { WorkspaceLayout } from '../components/dashboard/WorkspaceLayout';
import { useAuth } from '../hooks/useAuth';
import type { WorkspaceSummary } from '../lib/types';
import {
  type AccountSettingsGetResponse,
  type EmailProvider,
  type EmailSequenceStep,
  type EmailSender,
  EMAIL_PROVIDERS,
  TEMPLATE_VARIABLES,
  delayLabel,
  fetchAccountSettings,
  initiateOauth,
  addSmtpSender,
  renderTemplatePreview,
  updateAutomationSettings,
  updateSequenceStep,
  addSequenceStep,
  deleteSequenceStep,
} from '../lib/email-service';

/* ─── tiny helpers ───────────────────────────────────────────────────── */
function cls(...args: (string | false | null | undefined)[]) {
  return args.filter(Boolean).join(' ');
}
function statusCircle(status: EmailSender['health_status'] | EmailSender['status']) {
  const map: Record<string, string> = {
    healthy: 'bg-emerald-400',
    connected: 'bg-emerald-400',
    degraded: 'bg-amber-400',
    failed: 'bg-red-400',
    pending: 'bg-slate-400',
    disabled: 'bg-slate-300',
    unknown: 'bg-slate-300',
  };
  return map[status] ?? 'bg-slate-300';
}

/* ─── Tab definition ─────────────────────────────────────────────────── */
type Tab = 'config' | 'templates' | 'scheduling';

const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
  { id: 'config', label: 'Email Configuration', icon: Settings },
  { id: 'templates', label: 'Email Templates', icon: Mail },
  { id: 'scheduling', label: 'Scheduling & Automation', icon: Clock },
];

/* ═══════════════════════════════════════════════════════════════════════
   EmailPage
══════════════════════════════════════════════════════════════════════════ */
export function EmailPage() {
  const navigate = useNavigate();
  const { workspace, signOut } = useAuth();

  if (!workspace) return null;

  async function handleSignOut() {
    await signOut();
    toast.success('Signed out successfully.');
    navigate('/signin', { replace: true, state: { existingUser: true } });
  }

  return <EmailPageInner workspace={workspace} onSignOut={handleSignOut} />;
}

function EmailPageInner({
  workspace,
  onSignOut,
}: {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [data, setData] = useState<AccountSettingsGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAccountSettings();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load email settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={onSignOut}>
      {/* ── Page header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Mail className="h-5 w-5" />
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Email</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Configure providers, design templates, and automate follow-up sequences.
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

      {/* ── Tabs ── */}
      <div className="mb-5 flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
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

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto shrink-0">
            <X className="h-4 w-4 text-red-400 hover:text-red-600" />
          </button>
        </div>
      )}

      {/* ── Tab panels ── */}
      {loading && !data ? (
        <LoadingSkeleton />
      ) : (
        <>
          {activeTab === 'config' && <ConfigTab data={data} workspaceId={workspace.id} onRefresh={reload} />}
          {activeTab === 'templates' && <TemplatesTab data={data} workspaceId={workspace.id} onRefresh={reload} />}
          {activeTab === 'scheduling' && <SchedulingTab data={data} workspaceId={workspace.id} onRefresh={reload} />}
        </>
      )}
    </WorkspaceLayout>
  );
}

/* ─── Loading skeleton ───────────────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TAB 1 — Email Configuration
══════════════════════════════════════════════════════════════════════════ */
function ConfigTab({
  data,
  workspaceId,
  onRefresh,
}: {
  data: AccountSettingsGetResponse | null;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const senders = data?.senders ?? [];
  const [addingProvider, setAddingProvider] = useState<EmailProvider | null>(null);

  return (
    <div className="space-y-6">
      {/* ── Add provider ── */}
      <section>
        <SectionLabel icon={Sparkles} title="Connect an Email Provider" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EMAIL_PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              connected={senders.some((s) => s.provider === p.id && s.status === 'connected')}
              onConnect={() => setAddingProvider(p.id)}
            />
          ))}
        </div>
      </section>

      {/* ── Connected senders ── */}
      {senders.length > 0 && (
        <section>
          <SectionLabel icon={MailOpen} title="Connected Senders" />
          <div className="mt-3 space-y-2">
            {senders.map((sender) => (
              <SenderRow key={sender.id} sender={sender} />
            ))}
          </div>
        </section>
      )}

      {senders.length === 0 && !addingProvider && (
        <EmptyState
          icon={Mail}
          title="No email senders connected"
          description="Connect an email provider above to start sending automated follow-ups to your leads."
        />
      )}

      {/* ── SMTP / OAuth drawer ── */}
      {addingProvider && (
        <SmtpDrawer
          provider={addingProvider}
          workspaceId={workspaceId}
          onClose={() => setAddingProvider(null)}
          onSuccess={() => {
            setAddingProvider(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  connected,
  onConnect,
}: {
  provider: (typeof EMAIL_PROVIDERS)[number];
  connected: boolean;
  onConnect: () => void;
}) {
  const authBadgeClass =
    provider.authMethod === 'oauth' ? 'bg-blue-50 text-blue-600 ring-blue-100' : 'bg-amber-50 text-amber-600 ring-amber-100';

  return (
    <div
      className={cls(
        'group relative flex h-full flex-col gap-3 rounded-2xl border p-3.5 transition-all duration-200',
        connected
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-white ring-1 ring-emerald-100 shadow-[0_8px_24px_-20px_rgba(16,185,129,0.9)]'
          : 'border-slate-200 bg-white hover:border-violet-200 hover:shadow-md',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <ProviderLogo provider={provider} connected={connected} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-slate-800">{provider.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{provider.description}</p>
          </div>
        </div>
        <span
          className={cls(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1',
            authBadgeClass,
          )}
        >
          {provider.authMethod === 'oauth' ? 'OAuth' : 'SMTP'}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        {connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Already Connected
          </span>
        ) : (
          <button
            onClick={onConnect}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 active:scale-95"
          >
            <Plus className="h-3 w-3" />
            Connect
          </button>
        )}

        {connected && (
          <span className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700">
            Active
          </span>
        )}

        {provider.docsUrl && (
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-slate-400 transition hover:text-slate-600"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function ProviderLogo({
  provider,
  connected = false,
  compact = false,
}: {
  provider: (typeof EMAIL_PROVIDERS)[number];
  connected?: boolean;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const sizeClasses = compact ? 'h-9 w-9 rounded-lg' : 'h-11 w-11 rounded-xl';

  return (
    <div
      className={cls(
        'shrink-0 overflow-hidden bg-white',
        sizeClasses,
        connected ? 'ring-2 ring-emerald-200' : 'ring-1 ring-slate-200',
      )}
    >
      {provider.logoUrl && !failed ? (
        <img
          src={provider.logoUrl}
          alt={`${provider.label} logo`}
          className="h-full w-full object-contain p-1.5"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: provider.color + '14' }}>
          {provider.id === 'smtp' ? (
            <Shield className={compact ? 'h-4 w-4' : 'h-5 w-5'} style={{ color: provider.color }} />
          ) : (
            <span className={cls('font-semibold', compact ? 'text-[11px]' : 'text-xs')} style={{ color: provider.color }}>
              {provider.label.charAt(0)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SenderRow({ sender }: { sender: EmailSender }) {
  const meta = EMAIL_PROVIDERS.find((p) => p.id === sender.provider);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-slate-300">
      {meta ? (
        <ProviderLogo provider={meta} compact connected />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-base">📧</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">
          {sender.sender_name ?? sender.sender_email}
        </p>
        <p className="truncate text-xs text-slate-500">{sender.sender_email}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {sender.is_default && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600">
            Default
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs capitalize text-slate-500">
          <span className={cls('h-1.5 w-1.5 rounded-full', statusCircle(sender.health_status))} />
          {sender.health_status}
        </span>
      </div>
    </div>
  );
}

/* ─── SMTP / OAuth Drawer ────────────────────────────────────────────── */
function SmtpDrawer({
  provider: providerId,
  workspaceId,
  onClose,
  onSuccess,
}: {
  provider: EmailProvider;
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const provider = EMAIL_PROVIDERS.find((p) => p.id === providerId)!;
  const isOAuth = provider.authMethod === 'oauth';

  const [form, setForm] = useState({
    sender_email: '',
    sender_name: '',
    smtp_host: provider.smtpDefaults?.host ?? '',
    smtp_port: provider.smtpDefaults?.port ?? 587,
    smtp_username: '',
    smtp_password: '',
    smtp_use_tls: true,
    make_default: false,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function field(name: keyof typeof form, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await addSmtpSender({
        provider: providerId,
        sender_email: form.sender_email,
        sender_name: form.sender_name,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password,
        smtp_use_tls: form.smtp_use_tls,
        make_default: form.make_default,
      });
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to connect.');
    } finally {
      setSaving(false);
    }
  }

  async function handleOAuth() {
    setSaving(true);
    setErr(null);
    try {
      const redirectUrl = await initiateOauth(providerId as 'google' | 'microsoft', workspaceId);
      window.location.href = redirectUrl;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to start OAuth.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <span className="text-2xl">{provider.icon}</span>
          <div className="flex-1">
            <p className="font-bold text-slate-900">Connect {provider.label}</p>
            <p className="text-xs text-slate-500 capitalize">{provider.authMethod} authentication</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
          {isOAuth ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <p className="font-semibold">OAuth Connection</p>
              <p className="mt-1 text-xs text-blue-600">
                Click the button below to authorize CoreFlow to send emails on behalf of your {provider.label} account.
                You'll be redirected to {provider.label}'s sign-in page.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <p className="font-semibold">SMTP Credentials</p>
                <p className="mt-1 text-xs text-amber-600">
                  Your SMTP password is encrypted at rest. Never share these credentials.
                </p>
              </div>

              {/* fields */}
              <div className="space-y-3">
                <FormField label="Sender Email" required>
                  <input
                    type="email"
                    value={form.sender_email}
                    onChange={(e) => field('sender_email', e.target.value)}
                    placeholder="you@yourdomain.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  />
                </FormField>
                <FormField label="Sender Name">
                  <input
                    type="text"
                    value={form.sender_name}
                    onChange={(e) => field('sender_name', e.target.value)}
                    placeholder="Your Company Name"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  />
                </FormField>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <FormField label="SMTP Host" required>
                      <input
                        type="text"
                        value={form.smtp_host}
                        onChange={(e) => field('smtp_host', e.target.value)}
                        placeholder="smtp.example.com"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                      />
                    </FormField>
                  </div>
                  <FormField label="Port" required>
                    <input
                      type="number"
                      value={form.smtp_port}
                      onChange={(e) => field('smtp_port', parseInt(e.target.value, 10) || 587)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    />
                  </FormField>
                </div>
                <FormField label="SMTP Username" required>
                  <input
                    type="text"
                    value={form.smtp_username}
                    onChange={(e) => field('smtp_username', e.target.value)}
                    placeholder="you@yourdomain.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  />
                </FormField>
                <FormField label="SMTP Password" required>
                  <input
                    type="password"
                    value={form.smtp_password}
                    onChange={(e) => field('smtp_password', e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                  />
                </FormField>
                <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.smtp_use_tls}
                    onChange={(e) => field('smtp_use_tls', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  Use TLS / STARTTLS
                </label>
                <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.make_default}
                    onChange={(e) => field('make_default', e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  Set as default sender
                </label>
              </div>
            </>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              {err}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={isOAuth ? handleOAuth : handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            {isOAuth ? 'Authorize with ' + provider.label : 'Save & Test Connection'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TAB 2 — Email Templates
══════════════════════════════════════════════════════════════════════════ */
function TemplatesTab({
  data,
  workspaceId: _workspaceId,
  onRefresh,
}: {
  data: AccountSettingsGetResponse | null;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const steps = data?.sequence_steps ?? [];
  const [selectedStep, setSelectedStep] = useState<EmailSequenceStep | null>(steps[0] ?? null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // Keep selectedStep fresh after refresh
  useEffect(() => {
    if (steps.length === 0) return setSelectedStep(null);
    setSelectedStep((prev) => {
      if (!prev) return steps[0];
      return steps.find((s) => s.id === prev.id) ?? steps[0];
    });
  }, [steps]);

  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    if (selectedStep) {
      setEditSubject(selectedStep.subject_template);
      setEditBody(selectedStep.body_template);
      setSaveErr(null);
      setSaveOk(false);
    }
  }, [selectedStep]);

  async function handleSave() {
    if (!selectedStep) return;
    setSaving(true);
    setSaveErr(null);
    setSaveOk(false);
    try {
      await updateSequenceStep(selectedStep.id, {
        subject_template: editSubject,
        body_template: editBody,
      });
      setSaveOk(true);
      onRefresh();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  const workspaceName = 'Your Business';
  const bodyRef = useRef<HTMLDivElement>(null);
  const [editorMode, setEditorMode] = useState<'plain' | 'html'>('plain');

  // Sync contenteditable → state
  function onBodyInput() {
    if (bodyRef.current) setEditBody(bodyRef.current.innerHTML);
  }

  // Exec formatting command
  function fmt(cmd: string, val?: string) {
    document.execCommand(cmd, false, val);
    bodyRef.current?.focus();
    if (bodyRef.current) setEditBody(bodyRef.current.innerHTML);
  }

  // Sync state → contenteditable when step changes
  useEffect(() => {
    if (editorMode === 'html' && bodyRef.current && selectedStep) {
      bodyRef.current.innerHTML = editBody;
    }
  }, [selectedStep?.id, editorMode]);

  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* ── Step list (left sidebar) ── */}
      <aside className="w-52 shrink-0 space-y-1">
        <SectionLabel icon={Mail} title="Sequence Steps" />
        <div className="mt-2 space-y-1">
          {steps.map((step) => (
            <button
              key={step.id}
              onClick={() => setSelectedStep(step)}
              className={cls(
                'w-full rounded-xl px-3 py-2.5 text-left text-sm transition',
                selectedStep?.id === step.id
                  ? 'bg-violet-50 font-semibold text-violet-700 ring-1 ring-violet-200'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
              )}
            >
              <p className="truncate font-medium">Step {step.step_order}</p>
              <p className="truncate text-[11px] text-slate-400">{delayLabel(step.delay_hours)}</p>
            </button>
          ))}
        </div>

        {/* Variables reference */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Variables</p>
          <div className="mt-2 space-y-1">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v.token}
                onClick={() => {
                  if (editorMode === 'html') {
                    document.execCommand('insertText', false, v.token);
                    if (bodyRef.current) setEditBody(bodyRef.current.innerHTML);
                  } else {
                    setEditBody((b) => b + v.token);
                  }
                }}
                className="group flex w-full items-start gap-1 text-left"
                title={`Example: ${v.example}`}
              >
                <code className="truncate rounded bg-white px-1.5 py-0.5 text-[10px] font-mono text-violet-600 ring-1 ring-slate-200 group-hover:ring-violet-300">
                  {v.token}
                </code>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Editor/Preview (main) ── */}
      <div className="flex-1 min-w-0">
        {selectedStep ? (
          <div className="flex flex-col gap-3 h-full">
            {/* ── Top toolbar row ── */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* View mode tabs */}
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                {(['edit', 'preview'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cls(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      mode === m ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    {m === 'edit' ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {m === 'edit' ? 'Edit' : 'Preview'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                {/* Plain / HTML toggle */}
                {mode === 'edit' && (
                  <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
                    {(['plain', 'html'] as const).map((em) => (
                      <button
                        key={em}
                        onClick={() => {
                          if (em === 'html' && bodyRef.current) bodyRef.current.innerHTML = editBody;
                          setEditorMode(em);
                        }}
                        className={cls(
                          'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                          editorMode === em
                            ? 'bg-white shadow-sm text-violet-700'
                            : 'text-slate-500 hover:text-slate-700',
                        )}
                      >
                        {em === 'plain' ? 'Plain Text' : 'Rich HTML'}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
                >
                  {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save Template
                </button>
              </div>
            </div>

            {saveErr && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> {saveErr}
              </div>
            )}
            {saveOk && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Template saved successfully.
              </div>
            )}

            {mode === 'edit' ? (
              <div className="flex flex-col gap-3 flex-1">
                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Line</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={(e) => setEditSubject(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    placeholder="Subject line (supports {{variables}})"
                  />
                </div>

                {/* Body */}
                <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {editorMode === 'html' && (
                    /* Rich formatting toolbar */
                    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50 px-2 py-1.5">
                      {[
                        { cmd: 'bold', label: <strong>B</strong>, title: 'Bold' },
                        { cmd: 'italic', label: <em>I</em>, title: 'Italic' },
                        { cmd: 'underline', label: <u>U</u>, title: 'Underline' },
                      ].map(({ cmd, label, title }) => (
                        <button
                          key={cmd}
                          onMouseDown={(e) => { e.preventDefault(); fmt(cmd); }}
                          title={title}
                          className="flex h-7 w-7 items-center justify-center rounded text-sm text-slate-600 hover:bg-white hover:shadow-sm"
                        >
                          {label}
                        </button>
                      ))}
                      <div className="mx-1 h-5 w-px bg-slate-200" />
                      <button
                        onMouseDown={(e) => { e.preventDefault(); fmt('insertUnorderedList'); }}
                        title="Bullet list"
                        className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-white hover:shadow-sm"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="2" cy="4" r="1.5" fill="currentColor" />
                          <line x1="5" y1="4" x2="15" y2="4" />
                          <circle cx="2" cy="8" r="1.5" fill="currentColor" />
                          <line x1="5" y1="8" x2="15" y2="8" />
                          <circle cx="2" cy="12" r="1.5" fill="currentColor" />
                          <line x1="5" y1="12" x2="15" y2="12" />
                        </svg>
                      </button>
                      <button
                        onMouseDown={(e) => { e.preventDefault(); fmt('insertOrderedList'); }}
                        title="Numbered list"
                        className="flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-white hover:shadow-sm text-xs font-bold"
                      >
                        1.
                      </button>
                      <div className="mx-1 h-5 w-px bg-slate-200" />
                      <select
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => { fmt('formatBlock', e.target.value); e.target.value = 'p'; }}
                        defaultValue="p"
                        className="h-7 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 focus:outline-none"
                      >
                        <option value="p">Paragraph</option>
                        <option value="h1">Heading 1</option>
                        <option value="h2">Heading 2</option>
                        <option value="h3">Heading 3</option>
                        <option value="blockquote">Quote</option>
                      </select>
                      <div className="mx-1 h-5 w-px bg-slate-200" />
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const url = window.prompt('Enter URL:');
                          if (url) fmt('createLink', url);
                        }}
                        title="Insert link"
                        className="flex h-7 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-white hover:shadow-sm"
                      >
                        <ExternalLink className="h-3 w-3" /> Link
                      </button>
                      <div className="mx-1 h-5 w-px bg-slate-200" />
                      <label title="Text color" className="flex h-7 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-white hover:shadow-sm cursor-pointer">
                        <span className="h-3 w-3 rounded-full bg-violet-500 ring-1 ring-slate-200" />
                        <input
                          type="color"
                          className="sr-only"
                          onInput={(e) => fmt('foreColor', (e.target as HTMLInputElement).value)}
                        />
                        Color
                      </label>
                    </div>
                  )}

                  {editorMode === 'plain' ? (
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className="flex-1 w-full px-3.5 py-3 text-sm font-mono resize-none placeholder-slate-400 focus:outline-none min-h-[300px]"
                      placeholder="Write your email body here. Use {{variables}} for dynamic content."
                    />
                  ) : (
                    <div
                      ref={bodyRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={onBodyInput}
                      className="flex-1 overflow-y-auto px-4 py-3 text-sm text-slate-800 leading-relaxed focus:outline-none min-h-[300px] prose prose-sm max-w-none"
                      style={{ minHeight: 300 }}
                    />
                  )}
                </div>

                <p className="text-[11px] text-slate-400">
                  {editorMode === 'plain'
                    ? <>Plain text — supports <code>{'{{variables}}'}</code>. Click a variable on the left to insert.</>
                    : <>Rich HTML mode — use the toolbar to format. Variables still work: <code>{'{{lead_first_name}}'}</code></>}
                </p>
              </div>
            ) : (
              <TemplatePreview
                subject={renderTemplatePreview(editSubject, workspaceName)}
                body={renderTemplatePreview(editBody, workspaceName)}
                isHtml={editorMode === 'html'}
              />
            )}
          </div>
        ) : (
          <EmptyState icon={Mail} title="No template selected" description="Select a sequence step to edit its template." />
        )}
      </div>
    </div>
  );
}

function TemplatePreview({
  subject,
  body,
  isHtml = false,
}: {
  subject: string;
  body: string;
  isHtml?: boolean;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Email chrome */}
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">From:</span>
          <span>Jane Doe &lt;jane@yourbusiness.com&gt;</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">To:</span>
          <span>John Smith &lt;john@example.com&gt;</span>
        </div>
        <div className="mt-2 border-t border-slate-200 pt-2">
          <p className="text-sm font-bold text-slate-900">{subject || '(no subject)'}</p>
        </div>
      </div>
      <div className="p-5 overflow-y-auto max-h-[500px]">
        {isHtml ? (
          <div
            className="prose prose-sm max-w-none text-slate-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{body}</pre>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TAB 3 — Scheduling & Automation
══════════════════════════════════════════════════════════════════════════ */
const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
];

function SchedulingTab({
  data,
  workspaceId,
  onRefresh,
}: {
  data: AccountSettingsGetResponse | null;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const automation = data?.automation;
  const steps = data?.sequence_steps ?? [];

  const [isEnabled, setIsEnabled] = useState(automation?.is_enabled ?? false);
  const [timezone, setTimezone] = useState(automation?.timezone ?? 'UTC');
  const [stopOnReply, setStopOnReply] = useState(automation?.stop_on_reply ?? false);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [addingStep, setAddingStep] = useState(false);
  const [newDelay, setNewDelay] = useState(24);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [addingErr, setAddingErr] = useState<string | null>(null);

  useEffect(() => {
    if (automation) {
      setIsEnabled(automation.is_enabled);
      setTimezone(automation.timezone);
      setStopOnReply(automation.stop_on_reply);
    }
  }, [automation]);

  async function handleSaveSettings() {
    setSaving(true);
    setSaveOk(false);
    setSaveErr(null);
    try {
      await updateAutomationSettings(workspaceId, {
        is_enabled: isEnabled,
        timezone,
        stop_on_reply: stopOnReply,
      });
      setSaveOk(true);
      onRefresh();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddStep() {
    setAddingErr(null);
    if (!newSubject.trim()) return setAddingErr('Subject is required.');
    if (!newBody.trim()) return setAddingErr('Body is required.');
    try {
      await addSequenceStep(workspaceId, {
        step_order: steps.length + 1,
        delay_hours: newDelay,
        subject_template: newSubject.trim(),
        body_template: newBody.trim(),
      });
      setAddingStep(false);
      setNewSubject('');
      setNewBody('');
      setNewDelay(24);
      onRefresh();
    } catch (e) {
      setAddingErr(e instanceof Error ? e.message : 'Failed to add step.');
    }
  }

  async function handleDeleteStep(stepId: string) {
    if (!confirm('Delete this sequence step?')) return;
    try {
      await deleteSequenceStep(stepId);
      onRefresh();
    } catch {
      alert('Failed to delete step.');
    }
  }

  async function handleToggleStep(step: EmailSequenceStep) {
    try {
      await updateSequenceStep(step.id, { is_active: !step.is_active });
      onRefresh();
    } catch {
      alert('Failed to toggle step.');
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Global automation settings ── */}
      <section>
        <SectionLabel icon={Zap} title="Automation Settings" />
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          {/* Master toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-800">Enable Email Automation</p>
              <p className="text-xs text-slate-500 mt-0.5">
                When enabled, leads will automatically receive follow-up emails according to your sequence.
              </p>
            </div>
            <button
              onClick={() => setIsEnabled((v) => !v)}
              className={cls(
                'relative flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
                isEnabled ? 'bg-violet-600' : 'bg-slate-200',
              )}
            >
              <span
                className={cls(
                  'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200',
                  isEnabled ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Send Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">Emails are sent according to this timezone.</p>
          </div>

          {/* Stop on reply */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStopOnReply((v) => !v)}
              className={cls(
                'relative flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
                stopOnReply ? 'bg-violet-600' : 'bg-slate-200',
              )}
            >
              <span
                className={cls(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                  stopOnReply ? 'translate-x-4' : 'translate-x-0.5',
                )}
              />
            </button>
            <div>
              <p className="text-sm font-medium text-slate-700">Stop sequence on reply</p>
              <p className="text-xs text-slate-500">Automatically stop sending follow-ups if the lead replies.</p>
            </div>
          </div>

          {saveErr && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> {saveErr}
            </div>
          )}
          {saveOk && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Settings saved successfully.
            </div>
          )}

          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Settings
          </button>
        </div>
      </section>

      {/* ── Sequence steps ── */}
      <section>
        <div className="flex items-center justify-between">
          <SectionLabel icon={Send} title="Follow-up Sequence" />
          <button
            onClick={() => setAddingStep(true)}
            className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Add step
          </button>
        </div>

        {/* Visual timeline */}
        <div className="mt-3 relative pl-5">
          {/* vertical line */}
          {steps.length > 1 && (
            <div className="absolute left-[9px] top-4 bottom-4 w-px bg-slate-200" />
          )}

          <div className="space-y-3">
            {steps.map((step, idx) => (
              <SequenceStepCard
                key={step.id}
                step={step}
                index={idx}
                onToggle={() => handleToggleStep(step)}
                onDelete={() => handleDeleteStep(step.id)}
              />
            ))}
          </div>

          {steps.length === 0 && (
            <EmptyState icon={Send} title="No sequence steps" description="Add your first follow-up step to get started." />
          )}
        </div>

        {/* Add step form */}
        {addingStep && (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
            <p className="text-sm font-bold text-slate-900">Add Follow-up Step</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Delay (hours after previous step)</label>
                <input
                  type="number"
                  min={0}
                  value={newDelay}
                  onChange={(e) => setNewDelay(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                />
                <p className="mt-0.5 text-[11px] text-slate-400">{delayLabel(newDelay)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Step #</label>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                  #{steps.length + 1}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Subject line"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Body</label>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={4}
                placeholder="Email body..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm resize-none focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
            {addingErr && (
              <p className="text-xs text-red-600">{addingErr}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleAddStep}
                className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Add step
              </button>
              <button
                onClick={() => { setAddingStep(false); setAddingErr(null); }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SequenceStepCard({
  step,
  index,
  onToggle,
  onDelete,
}: {
  step: EmailSequenceStep;
  index: number;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cls('relative rounded-2xl border bg-white transition', step.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60')}>
      {/* dot */}
      <div className="absolute -left-5 top-4 h-3.5 w-3.5 rounded-full border-2 border-white bg-violet-500 ring-2 ring-violet-200" />

      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-bold text-violet-600">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{step.subject_template}</p>
          <p className="text-xs text-slate-500 mt-0.5">{delayLabel(step.delay_hours)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition" title={step.is_active ? 'Disable' : 'Enable'}>
            {step.is_active ? <ToggleRight className="h-4 w-4 text-violet-600" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
          <button onClick={() => setExpanded((v) => !v)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600 bg-slate-50 rounded-xl p-3">
            {step.body_template}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─── Shared small components ────────────────────────────────────────── */

function SectionLabel({ icon: Icon, title }: { icon: typeof Mail; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-violet-500" />
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</p>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Mail; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>
    </div>
  );
}
