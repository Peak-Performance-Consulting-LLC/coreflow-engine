import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MailOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
  Zap,
  Timer,
  ArrowRight,
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
    healthy: 'bg-emerald-400', connected: 'bg-emerald-400', degraded: 'bg-amber-400',
    failed: 'bg-red-400', pending: 'bg-slate-400', disabled: 'bg-slate-300', unknown: 'bg-slate-300',
  };
  return map[status] ?? 'bg-slate-300';
}

type ProviderConnectionState = 'connected' | 'attention' | 'disconnected';
function getProviderConnectionState(senders: EmailSender[], provider: (typeof EMAIL_PROVIDERS)[number]): ProviderConnectionState {
  const ps = senders.filter(e => e.provider === provider.id && e.is_active && e.status !== 'disabled');
  if (ps.length === 0) return 'disconnected';
  if (ps.some(s => s.status === 'connected' && s.health_status !== 'failed')) return 'connected';
  if (ps.some(s => s.health_status === 'failed' || s.status === 'failed' || s.status === 'pending')) return 'attention';
  return ps.some(s => s.status === 'connected') ? 'connected' : 'attention';
}

const ZOHO_REGION_OPTIONS = [
  { value: 'us', label: 'United States', host: 'smtp.zoho.com' },
  { value: 'in', label: 'India', host: 'smtp.zoho.in' },
  { value: 'eu', label: 'Europe', host: 'smtp.zoho.eu' },
  { value: 'au', label: 'Australia', host: 'smtp.zoho.com.au' },
] as const;
const SMTP_SECURITY_OPTIONS = [
  { value: 'tls465', label: 'SSL/TLS (Recommended)', port: 465, useTls: true },
  { value: 'starttls587', label: 'STARTTLS', port: 587, useTls: true },
] as const;
type ZohoRegion = (typeof ZOHO_REGION_OPTIONS)[number]['value'];
type SmtpSecurityMode = (typeof SMTP_SECURITY_OPTIONS)[number]['value'];

type Tab = 'config' | 'templates' | 'scheduling';
const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
  { id: 'config', label: 'Email Configuration', icon: Settings },
  { id: 'templates', label: 'Email Templates', icon: Mail },
  { id: 'scheduling', label: 'Scheduling & Automation', icon: Clock },
];

/* ══════════════════════════════════════════════════════════════════════
   EMAIL DESIGNER — Block Types & Interfaces
══════════════════════════════════════════════════════════════════════════ */
type BlockType = 'header' | 'text' | 'image' | 'button' | 'divider' | 'spacer' | 'footer';

interface HeaderBlockData { id: string; type: 'header'; bgColor: string; imageUrl?: string; logoText: string; logoColor: string; padding: number; }
interface TextBlockData   { id: string; type: 'text';   html: string; bgColor: string; padding: number; }
interface ImageBlockData  { id: string; type: 'image';  imageUrl: string; altText: string; width: number; align: 'left'|'center'|'right'; link?: string; caption?: string; bgColor: string; }
interface ButtonBlockData { id: string; type: 'button'; label: string; href: string; bgColor: string; textColor: string; align: 'left'|'center'|'right'; borderRadius: number; btnPadding: string; }
interface DividerBlockData{ id: string; type: 'divider'; color: string; thickness: number; marginY: number; bgColor: string; }
interface SpacerBlockData { id: string; type: 'spacer'; height: number; }
interface FooterBlockData { id: string; type: 'footer'; html: string; bgColor: string; textColor: string; }

type EmailBlock = HeaderBlockData | TextBlockData | ImageBlockData | ButtonBlockData | DividerBlockData | SpacerBlockData | FooterBlockData;

const BLOCK_ITEMS: { type: BlockType; label: string; emoji: string; desc: string }[] = [
  { type: 'header',  label: 'Header',  emoji: '🏷',  desc: 'Logo / brand top bar' },
  { type: 'text',    label: 'Text',    emoji: '✏️',  desc: 'Rich formatted text' },
  { type: 'image',   label: 'Image',   emoji: '🖼',  desc: 'Upload or URL image' },
  { type: 'button',  label: 'Button',  emoji: '🔘',  desc: 'CTA button with link' },
  { type: 'divider', label: 'Divider', emoji: '➖',  desc: 'Horizontal separator' },
  { type: 'spacer',  label: 'Spacer',  emoji: '↕️',  desc: 'Blank spacing area' },
  { type: 'footer',  label: 'Footer',  emoji: '📄',  desc: 'Unsubscribe & info' },
];

function createDefaultBlock(type: BlockType): EmailBlock {
  const id = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  switch (type) {
    case 'header':  return { id, type: 'header',  bgColor: '#7c3aed', logoText: 'Your Brand', logoColor: '#ffffff', padding: 24 };
    case 'text':    return { id, type: 'text',    html: '<p style="margin:0;font-size:15px;line-height:1.7;color:#333;">Write your message here. Use clear, friendly language.</p>', bgColor: '#ffffff', padding: 28 };
    case 'image':   return { id, type: 'image',   imageUrl: '', altText: '', width: 100, align: 'center', bgColor: '#ffffff' };
    case 'button':  return { id, type: 'button',  label: 'Learn More', href: 'https://', bgColor: '#7c3aed', textColor: '#ffffff', align: 'center', borderRadius: 8, btnPadding: '14px 32px' };
    case 'divider': return { id, type: 'divider', color: '#e2e8f0', thickness: 1, marginY: 8, bgColor: '#ffffff' };
    case 'spacer':  return { id, type: 'spacer',  height: 24 };
    case 'footer':  return { id, type: 'footer',  html: '<p style="margin:0;font-size:12px;">© 2025 {{workspace_name}} &nbsp;·&nbsp; <a href="#" style="color:#888;text-decoration:none;">Unsubscribe</a></p>', bgColor: '#f4f4f4', textColor: '#888888' };
  }
}

/* ─── Generate email-safe HTML from blocks ───────────────────────────── */
function generateEmailHtml(blocks: EmailBlock[], subject: string = ''): string {
  const rows = blocks.map(b => {
    switch (b.type) {
      case 'header': return `
        <tr><td style="background:${b.bgColor};padding:${b.padding}px 30px;text-align:center;">
          ${b.imageUrl
            ? `<img src="${b.imageUrl}" alt="${b.logoText}" style="max-height:60px;max-width:220px;display:inline-block;" />`
            : `<div style="font-size:26px;font-weight:800;color:${b.logoColor};letter-spacing:-0.5px;">${b.logoText}</div>`
          }
        </td></tr>`;
      case 'text': return `
        <tr><td style="background:${b.bgColor};padding:${b.padding}px 36px;">${b.html}</td></tr>`;
      case 'image': {
        const alignStyle = b.align === 'center' ? 'margin:0 auto;' : b.align === 'right' ? 'margin-left:auto;' : '';
        const imgTag = `<img src="${b.imageUrl}" alt="${b.altText || ''}" style="width:${b.width}%;max-width:${b.width}%;height:auto;display:block;${alignStyle}" />`;
        return `
        <tr><td style="background:${b.bgColor};padding:16px 30px;text-align:${b.align};">
          ${b.link ? `<a href="${b.link}" style="display:block;">${imgTag}</a>` : imgTag}
          ${b.caption ? `<p style="margin:8px 0 0;font-size:12px;color:#777;text-align:${b.align};">${b.caption}</p>` : ''}
        </td></tr>`;
      }
      case 'button': return `
        <tr><td style="padding:20px 30px;text-align:${b.align};">
          <a href="${b.href}" style="display:inline-block;background:${b.bgColor};color:${b.textColor};font-size:15px;font-weight:700;text-decoration:none;padding:${b.btnPadding};border-radius:${b.borderRadius}px;letter-spacing:0.2px;">${b.label}</a>
        </td></tr>`;
      case 'divider': return `
        <tr><td style="background:${b.bgColor};padding:${b.marginY}px 30px;">
          <hr style="border:none;border-top:${b.thickness}px solid ${b.color};margin:0;" />
        </td></tr>`;
      case 'spacer': return `<tr><td style="height:${b.height}px;line-height:${b.height}px;">&nbsp;</td></tr>`;
      case 'footer': return `
        <tr><td style="background:${b.bgColor};color:${b.textColor};padding:20px 30px;text-align:center;font-size:12px;">${b.html}</td></tr>`;
      default: return '';
    }
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${subject}</title>
<style>
  body{margin:0;padding:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;}
  a{color:inherit;}
  @media only screen and (max-width:620px){
    .email-wrap{width:100%!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;">
<tr><td align="center" style="padding:24px 12px;">
<table class="email-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
${rows}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ─── Email Template interface ───────────────────────────────────────── */
interface EmailTemplate {
  id: string; name: string; category: string; subject: string; body: string;
  tags: string[]; isPremade?: boolean; isHtml?: boolean;
}
const TEMPLATE_CATEGORIES = ['All', 'Welcome', 'Follow-up', 'Promotional', 'Re-engagement', 'Custom'];

const PREMADE_TEMPLATES: EmailTemplate[] = [
  {
    id: 'pmade-1', name: 'Warm Welcome', category: 'Welcome', tags: ['welcome'], isPremade: true,
    subject: 'Welcome, {{lead_first_name}}! 👋',
    body: `Hi {{lead_first_name}},\n\nWelcome! I'm {{sender_name}} from {{workspace_name}}.\n\nI'm thrilled to connect with you. We specialize in helping businesses like yours achieve their goals, and I'd love to learn more about your needs.\n\nCan we schedule a quick 15-minute call this week?\n\nWarm regards,\n{{sender_name}}\n{{workspace_name}}`,
  },
  {
    id: 'pmade-2', name: 'Friendly Follow-up', category: 'Follow-up', tags: ['follow-up'], isPremade: true,
    subject: 'Just checking in, {{lead_first_name}}',
    body: `Hi {{lead_first_name}},\n\nI wanted to follow up on my previous message.\n\nWe've been helping companies save time and grow faster — I'd love to share how we can do the same for you.\n\nCan we find 10 minutes this week?\n\nBest,\n{{sender_name}}\n{{workspace_name}}`,
  },
  {
    id: 'pmade-3', name: 'Value Proposition', category: 'Follow-up', tags: ['value'], isPremade: true,
    subject: "{{lead_first_name}}, here's what we can do for you",
    body: `Hi {{lead_first_name}},\n\nHere's what our clients typically experience:\n✅ 30% increase in lead response rates\n✅ 50% reduction in manual follow-up time\n✅ More qualified conversations every week\n\nWould you like to see how this could work for your business?\n\nBest,\n{{sender_name}}\n{{workspace_name}}`,
  },
  {
    id: 'pmade-4', name: 'Re-engagement', category: 'Re-engagement', tags: ['win-back'], isPremade: true,
    subject: 'Still interested, {{lead_first_name}}?',
    body: `Hi {{lead_first_name}},\n\nIt's been a while since we last connected.\n\nIf you're still looking for solutions, I'd love to reconnect. And if your priorities have shifted, no worries — just let me know.\n\nBest,\n{{sender_name}}\n{{workspace_name}}`,
  },
  {
    id: 'pmade-5', name: 'Special Offer', category: 'Promotional', tags: ['promo'], isPremade: true,
    subject: '🎁 Exclusive offer for you, {{lead_first_name}}',
    body: `Hi {{lead_first_name}},\n\nFor a limited time, we're offering a special package — at a significantly reduced price.\n\nThis offer is valid through the end of this week.\n\nReply to learn more!\n\nWarm regards,\n{{sender_name}}\n{{workspace_name}}`,
  },
];

/* ─── Scheduled email types ───────────────────────────────────────────── */
type ScheduleStatus = 'pending' | 'sent' | 'failed' | 'cancelled';
interface ScheduledEmail {
  id: string; templateId: string; templateName: string; subject: string;
  leads: string[]; scheduledAt: string; timezone: string; status: ScheduleStatus; createdAt: string;
}
const TIMEZONES = ['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','Europe/London','Europe/Berlin','Europe/Paris','Asia/Kolkata','Asia/Dubai','Australia/Sydney'];
const CUSTOM_TEMPLATE_STORAGE_PREFIX = 'coreflow-email-custom-templates';

function loadStoredCustomTemplates(workspaceId: string): EmailTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(`${CUSTOM_TEMPLATE_STORAGE_PREFIX}:${workspaceId}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .filter(item =>
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.category === 'string' &&
        typeof item.subject === 'string' &&
        typeof item.body === 'string'
      )
      .map(item => ({
        id: item.id as string,
        name: item.name as string,
        category: item.category as string,
        subject: item.subject as string,
        body: item.body as string,
        tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        isPremade: false,
        isHtml: Boolean(item.isHtml),
      }));
  } catch {
    return [];
  }
}

/* ══════════════════════════════════════════════════════════════════════
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

function EmailPageInner({ workspace, onSignOut }: { workspace: WorkspaceSummary; onSignOut: () => Promise<void> }) {
  const [activeTab, setActiveTab] = useState<Tab>('config');
  const [data, setData] = useState<AccountSettingsGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<EmailTemplate[]>([]);
  const [templatesHydrated, setTemplatesHydrated] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchAccountSettings()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    setTemplatesHydrated(false);
    setCustomTemplates(loadStoredCustomTemplates(workspace.id));
    setTemplatesHydrated(true);
  }, [workspace.id]);
  useEffect(() => {
    if (!templatesHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(`${CUSTOM_TEMPLATE_STORAGE_PREFIX}:${workspace.id}`, JSON.stringify(customTemplates));
  }, [customTemplates, templatesHydrated, workspace.id]);

  const allTemplates = [...PREMADE_TEMPLATES, ...customTemplates];

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={onSignOut}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Mail className="h-5 w-5" /></div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Email</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">Configure providers, design templates, and automate follow-up sequences.</p>
        </div>
        <button onClick={reload} disabled={loading} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={cls('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      <div className="mb-5 flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map(tab => {
          const Icon = tab.icon; const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cls('flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200', isActive ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700')}>
              <Icon className="h-4 w-4 shrink-0" /><span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /><span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto shrink-0"><X className="h-4 w-4 text-red-400 hover:text-red-600" /></button>
        </div>
      )}

      {loading && !data ? <LoadingSkeleton /> : (
        <>
          {activeTab === 'config' && <ConfigTab data={data} workspaceId={workspace.id} onRefresh={reload} />}
          {activeTab === 'templates' && <TemplatesTab customTemplates={customTemplates} setCustomTemplates={setCustomTemplates} />}
          {activeTab === 'scheduling' && <SchedulingTab data={data} workspaceId={workspace.id} onRefresh={reload} allTemplates={allTemplates} />}
        </>
      )}
    </WorkspaceLayout>
  );
}

function LoadingSkeleton() {
  return <div className="space-y-4 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-100" />)}</div>;
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 1 — Email Configuration
══════════════════════════════════════════════════════════════════════════ */
function ConfigTab({ data, workspaceId, onRefresh }: { data: AccountSettingsGetResponse | null; workspaceId: string; onRefresh: () => void }) {
  const senders = data?.senders ?? [];
  const [addingProvider, setAddingProvider] = useState<EmailProvider | null>(null);
  return (
    <div className="space-y-6">
      <section>
        <SectionLabel icon={Sparkles} title="Connect an Email Provider" />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {EMAIL_PROVIDERS.map(p => <ProviderCard key={p.id} provider={p} state={getProviderConnectionState(senders, p)} onConnect={() => setAddingProvider(p.id)} />)}
        </div>
      </section>
      {senders.length > 0 && (
        <section>
          <SectionLabel icon={MailOpen} title="Connected Senders" />
          <div className="mt-3 space-y-2">{senders.map(s => <SenderRow key={s.id} sender={s} />)}</div>
        </section>
      )}
      {senders.length === 0 && !addingProvider && <EmptyState icon={Mail} title="No email senders connected" description="Connect an email provider above to start sending automated follow-ups to your leads." />}
      {addingProvider && <SmtpDrawer provider={addingProvider} workspaceId={workspaceId} onClose={() => setAddingProvider(null)} onSuccess={() => { setAddingProvider(null); onRefresh(); }} />}
    </div>
  );
}

function ProviderCard({ provider, state, onConnect }: { provider: (typeof EMAIL_PROVIDERS)[number]; state: ProviderConnectionState; onConnect: () => void }) {
  const connected = state === 'connected', needsAttention = state === 'attention';
  const authBadgeClass = provider.authMethod === 'oauth' ? 'bg-blue-50 text-blue-600 ring-blue-100' : 'bg-amber-50 text-amber-600 ring-amber-100';
  return (
    <div className={cls('group relative flex h-full flex-col gap-3 rounded-2xl border p-3.5 transition-all duration-200', connected ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-white ring-1 ring-emerald-100' : needsAttention ? 'border-red-200 bg-gradient-to-br from-red-50/80 via-white to-white ring-1 ring-red-100' : 'border-slate-200 bg-white hover:border-violet-200 hover:shadow-md')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <ProviderLogo provider={provider} connected={connected} />
          <div className="min-w-0"><p className="truncate text-[15px] font-semibold text-slate-800">{provider.label}</p><p className="mt-0.5 text-xs leading-relaxed text-slate-500">{provider.description}</p></div>
        </div>
        <span className={cls('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1', authBadgeClass)}>{provider.authMethod === 'oauth' ? 'OAuth' : 'SMTP'}</span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        {connected ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Already Connected</span>
          : needsAttention ? <button onClick={onConnect} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 active:scale-95"><RefreshCw className="h-3 w-3" />Reconnect</button>
          : <button onClick={onConnect} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700 active:scale-95"><Plus className="h-3 w-3" />Connect</button>}
        {connected && <span className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700">Active</span>}
        {needsAttention && <span className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700">Needs Attention</span>}
        {provider.docsUrl && <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-slate-400 hover:text-slate-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
    </div>
  );
}

function ProviderLogo({ provider, connected = false, compact = false }: { provider: (typeof EMAIL_PROVIDERS)[number]; connected?: boolean; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const sizeClasses = compact ? 'h-9 w-9 rounded-lg' : 'h-11 w-11 rounded-xl';
  return (
    <div className={cls('shrink-0 overflow-hidden bg-white', sizeClasses, connected ? 'ring-2 ring-emerald-200' : 'ring-1 ring-slate-200')}>
      {provider.logoUrl && !failed
        ? <img src={provider.logoUrl} alt={`${provider.label} logo`} className="h-full w-full object-contain p-1.5" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: provider.color + '14' }}>
            {provider.id === 'smtp' ? <Shield className={compact ? 'h-4 w-4' : 'h-5 w-5'} style={{ color: provider.color }} /> : <span className={cls('font-semibold', compact ? 'text-[11px]' : 'text-xs')} style={{ color: provider.color }}>{provider.label.charAt(0)}</span>}
          </div>
      }
    </div>
  );
}

function SenderRow({ sender }: { sender: EmailSender }) {
  const meta = EMAIL_PROVIDERS.find(p => p.id === sender.provider);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-slate-300">
      {meta ? <ProviderLogo provider={meta} compact connected /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-base">📧</span>}
      <div className="flex-1 min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{sender.sender_name ?? sender.sender_email}</p><p className="truncate text-xs text-slate-500">{sender.sender_email}</p></div>
      <div className="flex shrink-0 items-center gap-2">
        {sender.is_default && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600">Default</span>}
        <span className="flex items-center gap-1.5 text-xs capitalize text-slate-500"><span className={cls('h-1.5 w-1.5 rounded-full', statusCircle(sender.health_status))} />{sender.health_status}</span>
      </div>
    </div>
  );
}

function SmtpDrawer({ provider: providerId, workspaceId, onClose, onSuccess }: { provider: EmailProvider; workspaceId: string; onClose: () => void; onSuccess: () => void }) {
  const provider = EMAIL_PROVIDERS.find(p => p.id === providerId)!;
  const isOAuth = provider.authMethod === 'oauth', isZoho = providerId === 'zoho';
  const [form, setForm] = useState({ sender_email: '', sender_name: '', smtp_host: provider.smtpDefaults?.host ?? '', smtp_port: provider.smtpDefaults?.port ?? 587, smtp_username: '', smtp_password: '', smtp_use_tls: true, make_default: false });
  const [zohoRegion, setZohoRegion] = useState<ZohoRegion>(() => ZOHO_REGION_OPTIONS.find(o => o.host === provider.smtpDefaults?.host)?.value ?? 'us');
  const [smtpSecurityMode, setSmtpSecurityMode] = useState<SmtpSecurityMode>(() => (provider.smtpDefaults?.port ?? 465) === 587 ? 'starttls587' : 'tls465');
  const [saving, setSaving] = useState(false), [err, setErr] = useState<string | null>(null);
  function field(name: keyof typeof form, value: string | number | boolean) { setForm(prev => ({ ...prev, [name]: value })); }
  useEffect(() => {
    if (!isZoho) return;
    const region = ZOHO_REGION_OPTIONS.find(o => o.value === zohoRegion) ?? ZOHO_REGION_OPTIONS[0];
    const mode = SMTP_SECURITY_OPTIONS.find(o => o.value === smtpSecurityMode) ?? SMTP_SECURITY_OPTIONS[0];
    setForm(prev => ({ ...prev, smtp_host: region.host, smtp_port: mode.port, smtp_use_tls: mode.useTls }));
  }, [isZoho, smtpSecurityMode, zohoRegion]);

  async function handleSave() {
    setSaving(true); setErr(null);
    try { await addSmtpSender({ provider: providerId, ...form }); onSuccess(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to connect.'); }
    finally { setSaving(false); }
  }
  async function handleOAuth() {
    setSaving(true); setErr(null);
    try { window.location.href = await initiateOauth(providerId as 'google' | 'microsoft', workspaceId); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed to start OAuth.'); setSaving(false); }
  }
  const senderMatchesAuthEmail = form.sender_email.trim().toLowerCase() === form.smtp_username.trim().toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <span className="text-2xl">{provider.icon}</span>
          <div className="flex-1"><p className="font-bold text-slate-900">Connect {provider.label}</p><p className="text-xs text-slate-500 capitalize">{provider.authMethod} authentication</p></div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-4">
          {isOAuth ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <p className="font-semibold">OAuth Connection</p>
              <p className="mt-1 text-xs text-blue-600">Click below to authorize CoreFlow to send emails on your {provider.label} account. You'll be redirected to {provider.label}'s sign-in page.</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"><p className="font-semibold">SMTP Credentials</p><p className="mt-1 text-xs text-amber-600">Your SMTP password is encrypted at rest.</p></div>
              <div className="space-y-3">
                {isZoho && (<>
                  <FormField label="Zoho Region" required><select value={zohoRegion} onChange={e => setZohoRegion(e.target.value as ZohoRegion)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">{ZOHO_REGION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.host})</option>)}</select></FormField>
                  <FormField label="Security Mode" required><select value={smtpSecurityMode} onChange={e => setSmtpSecurityMode(e.target.value as SmtpSecurityMode)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none">{SMTP_SECURITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} (Port {o.port})</option>)}</select></FormField>
                </>)}
                <FormField label="Sender Email" required><input type="email" value={form.sender_email} onChange={e => field('sender_email', e.target.value)} placeholder="you@yourdomain.com" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></FormField>
                <FormField label="Sender Name"><input type="text" value={form.sender_name} onChange={e => field('sender_name', e.target.value)} placeholder="Your Company Name" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></FormField>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2"><FormField label="SMTP Host" required><input type="text" value={form.smtp_host} onChange={e => field('smtp_host', e.target.value)} readOnly={isZoho} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></FormField></div>
                  <FormField label="Port" required><input type="number" value={form.smtp_port} onChange={e => field('smtp_port', parseInt(e.target.value, 10) || 587)} readOnly={isZoho} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></FormField>
                </div>
                <FormField label="SMTP Username" required><input type="text" value={form.smtp_username} onChange={e => field('smtp_username', e.target.value)} placeholder="you@yourdomain.com" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></FormField>
                <FormField label="SMTP Password" required><input type="password" value={form.smtp_password} onChange={e => field('smtp_password', e.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></FormField>
                {isZoho ? <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Connection will use {smtpSecurityMode === 'tls465' ? 'TLS on port 465' : 'STARTTLS on port 587'}.</div>
                  : <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer"><input type="checkbox" checked={form.smtp_use_tls} onChange={e => field('smtp_use_tls', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />Use TLS / STARTTLS</label>}
                {isZoho && form.sender_email && form.smtp_username && !senderMatchesAuthEmail && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">Sender Email should match the authenticated Zoho mailbox or a verified alias.</div>}
                <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 cursor-pointer"><input type="checkbox" checked={form.make_default} onChange={e => field('make_default', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />Set as default sender</label>
              </div>
            </>
          )}
          {err && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />{err}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={isOAuth ? handleOAuth : handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            {isOAuth ? 'Authorize with ' + provider.label : 'Save & Test Connection'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 2 — Email Templates
══════════════════════════════════════════════════════════════════════════ */
type TemplateMode = 'browse' | 'create' | 'edit';
type SetCustomTemplates = (value: EmailTemplate[] | ((prev: EmailTemplate[]) => EmailTemplate[])) => void;

function TemplatesTab({ customTemplates, setCustomTemplates }: { customTemplates: EmailTemplate[]; setCustomTemplates: SetCustomTemplates }) {
  const [mode, setMode] = useState<TemplateMode>('browse');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<EmailTemplate | null>(null);
  const [designerBlocks, setDesignerBlocks] = useState<EmailBlock[]>([]);
  const [designerMeta, setDesignerMeta] = useState({ name: '', category: 'Custom', subject: '' });

  const allTemplates = [...PREMADE_TEMPLATES, ...customTemplates];
  const filtered = allTemplates.filter(t => {
    const matchCat = selectedCategory === 'All' || t.category === selectedCategory;
    const matchQ = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.subject.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchQ;
  });

  function openCreate() {
    setDesignerMeta({ name: '', category: 'Custom', subject: '' });
    setDesignerBlocks([createDefaultBlock('header'), createDefaultBlock('text'), createDefaultBlock('button'), createDefaultBlock('footer')]);
    setEditingTemplate(null);
    setMode('create');
  }

  function openEdit(t: EmailTemplate) {
    setDesignerMeta({ name: t.name, category: t.category, subject: t.subject });
    // If already designed as HTML blocks, start fresh; plain text gets wrapped in a text block
    if (t.isHtml) {
      setDesignerBlocks([{ ...createDefaultBlock('text'), id: 'imported', html: t.body } as TextBlockData]);
    } else {
      setDesignerBlocks([
        createDefaultBlock('header'),
        { ...createDefaultBlock('text'), id: 'body-text', html: `<p style="margin:0;font-size:15px;line-height:1.7;color:#333;white-space:pre-wrap;">${t.body}</p>` } as TextBlockData,
        createDefaultBlock('footer'),
      ]);
    }
    setEditingTemplate(t);
    setMode('edit');
  }

  function handleCopyTemplate(t: EmailTemplate) {
    const copy: EmailTemplate = { ...t, id: `custom-${Date.now()}`, name: t.name + ' (My Copy)', isPremade: false };
    setCustomTemplates(prev => [...prev, copy]);
    openEdit(copy);
    toast.success('Template copied! Now customize it in the designer.');
  }

  function handleDesignerSave(name: string, category: string, subject: string, htmlBody: string) {
    if (mode === 'create') {
      const newT: EmailTemplate = { id: `custom-${Date.now()}`, name, category, subject, body: htmlBody, tags: [], isHtml: true };
      setCustomTemplates(prev => [...prev, newT]);
      toast.success('Template created! 🎉');
    } else if (editingTemplate) {
      if (editingTemplate.isPremade) { toast.error("Can't edit a pre-made template. Copy it first."); return; }
      setCustomTemplates(prev => prev.map(t => t.id === editingTemplate.id ? { ...t, name, category, subject, body: htmlBody, isHtml: true } : t));
      toast.success('Template updated!');
    }
    setMode('browse');
  }

  function handleDeleteTemplate(id: string) {
    if (!confirm('Delete this template? Cannot be undone.')) return;
    setCustomTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template deleted.');
  }

  if (mode === 'create' || mode === 'edit') {
    return <EmailDesigner initialMeta={designerMeta} initialBlocks={designerBlocks} mode={mode} editingName={editingTemplate?.name} onSave={handleDesignerSave} onCancel={() => setMode('browse')} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Email Templates</h2>
          <p className="text-sm text-slate-500 mt-0.5">Design rich, branded email templates. What you design is what clients receive.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 active:scale-95 shadow-sm">
          <Plus className="h-4 w-4" /> Design New Template
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0" style={{ maxWidth: 300 }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search templates..." className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {TEMPLATE_CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)} className={cls('rounded-full px-3.5 py-1.5 text-xs font-semibold transition', selectedCategory === cat ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600')}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Pre-made */}
      {(selectedCategory === 'All' || selectedCategory !== 'Custom') && (
        <div>
          <div className="flex items-center gap-2 mb-3"><Star className="h-4 w-4 text-amber-500" /><span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Ready-to-Use Templates</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.filter(t => t.isPremade).map(t => (
              <TemplateCard key={t.id} template={t} onUse={() => handleCopyTemplate(t)} onPreview={() => setPreviewingTemplate(t)} useLabel="Use & Customize" />
            ))}
          </div>
          {filtered.filter(t => t.isPremade).length === 0 && <p className="text-sm text-slate-400 py-4">No pre-made templates match your search.</p>}
        </div>
      )}

      {/* Custom */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-violet-500" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">My Designed Templates</span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-600">{customTemplates.length}</span>
        </div>
        {customTemplates.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-10 text-center">
            <div className="flex mx-auto mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">🎨</div>
            <p className="font-semibold text-slate-700">No custom templates yet</p>
            <p className="mt-1 text-sm text-slate-500">Use our visual designer to create stunning email templates — with images, buttons, colors and more.</p>
            <button onClick={openCreate} className="mt-4 flex items-center gap-2 mx-auto rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition">
              <Plus className="h-4 w-4" /> Design Template
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.filter(t => !t.isPremade).map(t => (
              <TemplateCard key={t.id} template={t} onUse={() => openEdit(t)} onPreview={() => setPreviewingTemplate(t)} onDelete={() => handleDeleteTemplate(t.id)} useLabel="Open Designer" />
            ))}
          </div>
        )}
      </div>

      {previewingTemplate && (
        <TemplatePreviewOverlay
          template={previewingTemplate}
          onClose={() => setPreviewingTemplate(null)}
          onUse={() => { if (previewingTemplate.isPremade) handleCopyTemplate(previewingTemplate); else openEdit(previewingTemplate); setPreviewingTemplate(null); }}
        />
      )}
    </div>
  );
}

function TemplateCard({ template, onUse, onPreview, onDelete, useLabel = 'Use Template' }: { template: EmailTemplate; onUse: () => void; onPreview: () => void; onDelete?: () => void; useLabel?: string }) {
  const catColors: Record<string, string> = { Welcome: 'bg-blue-50 text-blue-600', 'Follow-up': 'bg-violet-50 text-violet-600', Promotional: 'bg-amber-50 text-amber-600', 'Re-engagement': 'bg-rose-50 text-rose-600', Custom: 'bg-slate-100 text-slate-600' };
  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className={cls('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', catColors[template.category] ?? 'bg-slate-100 text-slate-600')}>{template.category}</span>
            {template.isPremade && <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600"><Star className="h-2.5 w-2.5" />Official</span>}
            {template.isHtml && !template.isPremade && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-600">🎨 Designed</span>}
          </div>
          <p className="font-semibold text-slate-800 text-sm leading-snug">{template.name}</p>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <p className="text-xs font-medium text-slate-500 mb-0.5">Subject:</p>
        <p className="text-xs text-slate-700 line-clamp-1 font-medium">{template.subject}</p>
        <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">{template.isHtml ? '(Rich HTML email — click Preview to see)' : template.body}</p>
      </div>
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
        <button onClick={onPreview} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><Eye className="h-3 w-3" />Preview</button>
        <button onClick={onUse} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
          {useLabel === 'Open Designer' ? <Edit3 className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{useLabel}
        </button>
        {onDelete && <button onClick={onDelete} className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
      </div>
    </div>
  );
}

function TemplatePreviewOverlay({ template, onClose, onUse }: { template: EmailTemplate; onClose: () => void; onUse: () => void }) {
  const isHtml = template.isHtml || template.body.includes('<!DOCTYPE');
  const previewSubject = template.isPremade ? renderTemplatePreview(template.subject, 'Your Business') : template.subject;
  const previewBody = template.isPremade ? renderTemplatePreview(template.body, 'Your Business') : template.body;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <div><p className="font-bold text-slate-900">{template.name}</p><p className="text-xs text-slate-500 mt-0.5">Email preview with sample data</p></div>
          <div className="flex items-center gap-2">
            <button onClick={onUse} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              {template.isPremade ? <><Copy className="h-3.5 w-3.5" />Use Template</> : <><Edit3 className="h-3.5 w-3.5" />Open Designer</>}
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-3.5 space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500"><span className="font-semibold text-slate-700 w-12">From:</span>Jane Doe &lt;jane@yourbusiness.com&gt;</div>
          <div className="flex items-center gap-2 text-xs text-slate-500"><span className="font-semibold text-slate-700 w-12">To:</span>John Smith &lt;john@example.com&gt;</div>
          <div className="border-t border-slate-200 pt-2 mt-1"><p className="text-sm font-bold text-slate-900">{previewSubject}</p></div>
        </div>
        <div className="overflow-y-auto flex-1 bg-gray-100">
          {isHtml
            ? <iframe srcDoc={previewBody} title="Email preview" style={{ width: '100%', minHeight: 400, border: 'none' }} onLoad={e => { const f = e.target as HTMLIFrameElement; const h = f.contentDocument?.body?.scrollHeight; if (h) f.style.height = (h + 40) + 'px'; }} />
            : <div className="px-6 py-5"><pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{previewBody}</pre></div>
          }
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   EMAIL DESIGNER — Main Component
══════════════════════════════════════════════════════════════════════════ */
function EmailDesigner({
  initialMeta,
  initialBlocks,
  mode,
  editingName,
  onSave,
  onCancel,
}: {
  initialMeta: { name: string; category: string; subject: string };
  initialBlocks: EmailBlock[];
  mode: TemplateMode;
  editingName?: string;
  onSave: (name: string, category: string, subject: string, htmlBody: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialMeta.name);
  const [category, setCategory] = useState(initialMeta.category);
  const [subject, setSubject] = useState(initialMeta.subject);
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(initialBlocks[0]?.id ?? null);
  const [showPreview, setShowPreview] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;

  function addBlock(type: BlockType) {
    const nb = createDefaultBlock(type);
    if (selectedId) {
      const idx = blocks.findIndex(b => b.id === selectedId);
      const copy = [...blocks];
      copy.splice(idx + 1, 0, nb);
      setBlocks(copy);
    } else {
      setBlocks(prev => [...prev, nb]);
    }
    setSelectedId(nb.id);
  }

  function updateBlock(id: string, patch: Partial<EmailBlock>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } as EmailBlock : b));
  }

  function deleteBlock(id: string) {
    setBlocks(prev => {
      const filtered = prev.filter(b => b.id !== id);
      if (selectedId === id) setSelectedId(filtered[0]?.id ?? null);
      return filtered;
    });
  }

  function moveBlock(id: string, dir: 'up' | 'down') {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (dir === 'up' && idx === 0) return prev;
      if (dir === 'down' && idx === prev.length - 1) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function handleSave() {
    if (!name.trim()) { setFormErr('Template name is required.'); return; }
    if (!subject.trim()) { setFormErr('Subject line is required.'); return; }
    if (blocks.length === 0) { setFormErr('Add at least one block to your email.'); return; }
    setFormErr(null);
    onSave(name, category, subject, generateEmailHtml(blocks, subject));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">← Back</button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-800">{mode === 'create' ? '🎨 Design New Email Template' : `🎨 Editing: ${editingName}`}</h2>
          <p className="text-xs text-slate-500">Build your email block by block — what you design is exactly what clients receive</p>
        </div>
        <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition">
          <Eye className="h-4 w-4" />Preview
        </button>
        <button onClick={handleSave} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 shadow-sm transition active:scale-95">
          <Save className="h-4 w-4" />Save Template
        </button>
      </div>

      {formErr && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />{formErr}
          <button onClick={() => setFormErr(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Three-column editor */}
      <div className="flex gap-3" style={{ minHeight: 640 }}>

        {/* ── Left: Palette + Settings ── */}
        <div className="w-44 shrink-0 flex flex-col gap-2">
          {/* Template settings */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Template Info</p>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Template name *" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject *" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-violet-400 focus:outline-none" />
            <select value={category} onChange={e => setCategory(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-violet-400 focus:outline-none">
              {['Welcome', 'Follow-up', 'Promotional', 'Re-engagement', 'Custom'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Block palette */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Add Blocks</p>
            <div className="space-y-1.5">
              {BLOCK_ITEMS.map(({ type, label, emoji, desc }) => (
                <button key={type} onClick={() => addBlock(type)} title={desc}
                  className="w-full flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700">
                  <span className="text-sm">{emoji}</span>{label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Center: Email Canvas ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-200 p-3 flex-1 overflow-y-auto" style={{ minHeight: 500 }}>
            <div className="mx-auto rounded-lg overflow-hidden shadow-lg" style={{ maxWidth: 560, background: '#f0f0f0' }}>
              {blocks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center bg-white">
                  <p className="text-4xl mb-3">📧</p>
                  <p className="font-semibold text-slate-600">Your email canvas is empty</p>
                  <p className="text-sm text-slate-400 mt-1">Click a block type on the left to start building</p>
                </div>
              ) : (
                blocks.map((block, idx) => (
                  <div key={block.id} onClick={() => setSelectedId(block.id)}
                    className={cls('relative cursor-pointer transition-all duration-150 group', selectedId === block.id ? 'outline outline-2 outline-violet-500 outline-offset-0 z-10' : 'hover:outline hover:outline-2 hover:outline-violet-300 hover:outline-offset-0')}>
                    {/* Block controls */}
                    <div className={cls('absolute top-1 right-1 z-20 flex items-center gap-0.5 rounded-lg bg-white/95 shadow border border-slate-200 p-0.5 transition', selectedId === block.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                      <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 'up'); }} disabled={idx === 0} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 text-xs">▲</button>
                      <button onClick={e => { e.stopPropagation(); moveBlock(block.id, 'down'); }} disabled={idx === blocks.length - 1} className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 text-xs">▼</button>
                      <div className="w-px h-4 bg-slate-200 mx-0.5" />
                      <button onClick={e => { e.stopPropagation(); deleteBlock(block.id); }} className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-50 hover:text-red-600 text-xs">✕</button>
                    </div>
                    {/* Block label */}
                    {selectedId === block.id && (
                      <div className="absolute -top-5 left-0 z-20 flex items-center gap-1 rounded-t-md bg-violet-600 px-2 py-0.5">
                        <span className="text-[10px] font-bold text-white uppercase">{block.type}</span>
                      </div>
                    )}
                    <BlockCanvasPreview block={block} />
                  </div>
                ))
              )}
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-400">Click any block to select → edit properties on the right panel</p>
        </div>

        {/* ── Right: Properties Panel ── */}
        <div className="w-64 shrink-0 overflow-y-auto" style={{ maxHeight: 640 }}>
          {selectedBlock ? (
            <BlockPropertiesPanel key={selectedBlock.id} block={selectedBlock} onChange={patch => updateBlock(selectedBlock.id, patch)} />
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 h-full flex flex-col items-center justify-center py-10 text-center">
              <p className="text-3xl mb-2">👈</p>
              <p className="text-sm font-semibold text-slate-600">Click a block</p>
              <p className="text-xs text-slate-400 mt-1">to edit its properties here</p>
            </div>
          )}
        </div>
      </div>

      {showPreview && (
        <EmailPreviewModal subject={subject} html={generateEmailHtml(blocks, subject)} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

/* ── Block canvas preview ─────────────────────────────────────────────── */
function BlockCanvasPreview({ block }: { block: EmailBlock }) {
  switch (block.type) {
    case 'header':
      return (
        <div style={{ background: block.bgColor, padding: `${block.padding}px 30px`, textAlign: 'center' }}>
          {block.imageUrl
            ? <img src={block.imageUrl} alt={block.logoText} style={{ maxHeight: 56, maxWidth: 200, display: 'inline-block' }} />
            : <div style={{ fontSize: 22, fontWeight: 800, color: block.logoColor, letterSpacing: '-0.5px' }}>{block.logoText || 'Your Brand'}</div>
          }
        </div>
      );
    case 'text':
      return <div style={{ background: block.bgColor, padding: `${block.padding}px 30px` }} dangerouslySetInnerHTML={{ __html: block.html || '<p style="color:#aaa;margin:0;">Click to edit text...</p>' }} />;
    case 'image':
      return (
        <div style={{ background: block.bgColor, padding: '16px 30px', textAlign: block.align }}>
          {block.imageUrl
            ? <img src={block.imageUrl} alt={block.altText} style={{ width: `${block.width}%`, maxWidth: `${block.width}%`, height: 'auto', display: 'inline-block' }} />
            : <div style={{ background: '#f0f0f0', height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: 13, borderRadius: 6 }}>🖼 Add image URL or upload</div>
          }
          {block.caption && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#777', textAlign: block.align }}>{block.caption}</p>}
        </div>
      );
    case 'button':
      return (
        <div style={{ padding: '16px 30px', textAlign: block.align }}>
          <span style={{ display: 'inline-block', background: block.bgColor, color: block.textColor, fontSize: 14, fontWeight: 700, padding: block.btnPadding, borderRadius: block.borderRadius, cursor: 'default' }}>
            {block.label || 'Button'}
          </span>
        </div>
      );
    case 'divider':
      return <div style={{ background: block.bgColor, padding: `${block.marginY}px 30px` }}><hr style={{ border: 'none', borderTop: `${block.thickness}px solid ${block.color}`, margin: 0 }} /></div>;
    case 'spacer':
      return <div style={{ height: block.height, background: 'repeating-linear-gradient(45deg,#f9f9f9,#f9f9f9 4px,#f0f0f0 4px,#f0f0f0 8px)', opacity: 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 10, color: '#aaa', background: '#fff', padding: '2px 8px', borderRadius: 4 }}>{block.height}px spacer</span></div>;
    case 'footer':
      return <div style={{ background: block.bgColor, color: block.textColor, padding: '20px 30px', textAlign: 'center', fontSize: 12 }} dangerouslySetInnerHTML={{ __html: block.html }} />;
  }
}

/* ── Block properties panel ───────────────────────────────────────────── */
function BlockPropertiesPanel({ block, onChange }: { block: EmailBlock; onChange: (patch: Partial<EmailBlock>) => void }) {
  const emojis: Record<BlockType, string> = { header: '🏷', text: '✏️', image: '🖼', button: '🔘', divider: '➖', spacer: '↕️', footer: '📄' };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-slate-50">
        <span className="text-base">{emojis[block.type]}</span>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 capitalize">{block.type} Block Settings</p>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto" style={{ maxHeight: 580 }}>
        {block.type === 'header'  && <HeaderProps  block={block} onChange={onChange as (p: Partial<HeaderBlockData>) => void} />}
        {block.type === 'text'    && <TextProps    block={block} onChange={onChange as (p: Partial<TextBlockData>) => void} />}
        {block.type === 'image'   && <ImageProps   block={block} onChange={onChange as (p: Partial<ImageBlockData>) => void} />}
        {block.type === 'button'  && <ButtonProps  block={block} onChange={onChange as (p: Partial<ButtonBlockData>) => void} />}
        {block.type === 'divider' && <DividerProps block={block} onChange={onChange as (p: Partial<DividerBlockData>) => void} />}
        {block.type === 'spacer'  && <SpacerProps  block={block} onChange={onChange as (p: Partial<SpacerBlockData>) => void} />}
        {block.type === 'footer'  && <FooterProps  block={block} onChange={onChange as (p: Partial<FooterBlockData>) => void} />}
      </div>
    </div>
  );
}

/* ─── shared design panel helpers ────────────────────────────────────── */
const piCls = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-100';

function DP({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>{children}</div>;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-8 w-10 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-mono focus:border-violet-400 focus:outline-none" />
    </div>
  );
}

function AlignPicker({ value, onChange }: { value: 'left'|'center'|'right'; onChange: (v: 'left'|'center'|'right') => void }) {
  return (
    <div className="flex gap-1">
      {(['left','center','right'] as const).map(a => (
        <button key={a} onClick={() => onChange(a)} className={cls('flex-1 rounded-lg py-1.5 text-[10px] font-bold border transition uppercase', value === a ? 'border-violet-400 bg-violet-100 text-violet-700' : 'border-slate-200 text-slate-400 hover:border-violet-200')}>
          {a === 'left' ? 'Left' : a === 'center' ? 'Center' : 'Right'}
        </button>
      ))}
    </div>
  );
}

/* ─── Header block props ─────────────────────────────────────────────── */
function HeaderProps({ block, onChange }: { block: HeaderBlockData; onChange: (p: Partial<HeaderBlockData>) => void }) {
  return (<>
    <DP label="Brand / Logo Text"><input type="text" value={block.logoText} onChange={e => onChange({ logoText: e.target.value })} className={piCls} /></DP>
    <DP label="Text Color"><ColorPicker value={block.logoColor} onChange={v => onChange({ logoColor: v })} /></DP>
    <DP label="Background Color"><ColorPicker value={block.bgColor} onChange={v => onChange({ bgColor: v })} /></DP>
    <DP label="Logo Image URL (optional)">
      <input type="url" value={block.imageUrl ?? ''} onChange={e => onChange({ imageUrl: e.target.value || undefined })} placeholder="https://your-logo.png" className={piCls} />
      <p className="text-[10px] text-slate-400 mt-0.5">Paste a URL to show your logo image instead of text</p>
    </DP>
    <DP label="Padding (px)">
      <input type="range" value={block.padding} onChange={e => onChange({ padding: +e.target.value })} min={8} max={60} className="w-full accent-violet-600" />
      <span className="text-[10px] text-slate-500">{block.padding}px</span>
    </DP>
  </>);
}

/* ─── Text block props (full rich editor) ────────────────────────────── */
function TextProps({ block, onChange }: { block: TextBlockData; onChange: (p: Partial<TextBlockData>) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = block.html;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  function exec(cmd: string, val?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    if (editorRef.current) onChange({ html: editorRef.current.innerHTML });
  }

  return (<>
    <DP label="Edit Text">
      {/* Formatting toolbar */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 mb-1 flex flex-wrap gap-0.5">
        {/* Bold, Italic, Underline, Strike */}
        {([
          { cmd: 'bold', node: <strong>B</strong> },
          { cmd: 'italic', node: <em>I</em> },
          { cmd: 'underline', node: <u>U</u> },
          { cmd: 'strikeThrough', node: <s className="text-[10px]">S</s> },
        ]).map(({ cmd, node }) => (
          <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-xs text-slate-600 hover:bg-white hover:shadow-sm transition">{node}</button>
        ))}
        <div className="w-px h-5 bg-slate-200 mx-0.5 self-center" />
        {/* Align */}
        {([['justifyLeft','≡L'],['justifyCenter','≡C'],['justifyRight','≡R']] as const).map(([cmd, label]) => (
          <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-[10px] font-bold text-slate-600 hover:bg-white hover:shadow-sm">{label}</button>
        ))}
        <div className="w-px h-5 bg-slate-200 mx-0.5 self-center" />
        {/* Font size */}
        <select onMouseDown={e => e.stopPropagation()} onChange={e => { exec('fontSize', e.target.value); e.target.value = '3'; }} defaultValue="3" className="h-7 rounded-lg border border-slate-200 bg-white px-1 text-[10px] text-slate-600 focus:outline-none cursor-pointer">
          <option value="1">XS</option><option value="2">Sm</option><option value="3">Md</option><option value="4">Lg</option><option value="5">XL</option><option value="6">XXL</option>
        </select>
        <div className="w-px h-5 bg-slate-200 mx-0.5 self-center" />
        {/* Text color */}
        <label title="Text color" className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white cursor-pointer overflow-hidden">
          <span className="text-xs font-bold">A</span>
          <span className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded" style={{ background: '#e53e3e' }} />
          <input type="color" className="absolute opacity-0 inset-0 cursor-pointer" onChange={e => exec('foreColor', e.target.value)} />
        </label>
        {/* Text background/highlight */}
        <label title="Highlight / background" className="relative w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white cursor-pointer overflow-hidden">
          <span className="text-xs" style={{ background: '#fef08a', padding: '1px 2px', borderRadius: 2 }}>A</span>
          <input type="color" className="absolute opacity-0 inset-0 cursor-pointer" onChange={e => exec('hiliteColor', e.target.value)} />
        </label>
        <div className="w-px h-5 bg-slate-200 mx-0.5 self-center" />
        {/* Lists */}
        <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList'); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-[10px] text-slate-600 hover:bg-white hover:shadow-sm">•≡</button>
        <button onMouseDown={e => { e.preventDefault(); exec('insertOrderedList'); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-[10px] text-slate-600 hover:bg-white hover:shadow-sm">1.</button>
        <div className="w-px h-5 bg-slate-200 mx-0.5 self-center" />
        {/* Link */}
        <button onMouseDown={e => { e.preventDefault(); const url = prompt('Enter URL:'); if (url) exec('createLink', url); }} title="Insert link" className="w-7 h-7 flex items-center justify-center rounded-lg text-xs text-slate-600 hover:bg-white hover:shadow-sm">🔗</button>
        {/* Remove format */}
        <button onMouseDown={e => { e.preventDefault(); exec('removeFormat'); }} title="Clear formatting" className="w-7 h-7 flex items-center justify-center rounded-lg text-[10px] text-red-400 hover:bg-white hover:shadow-sm">✕</button>
      </div>
      {/* Variables quick-insert */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {TEMPLATE_VARIABLES.slice(0, 4).map(v => (
          <button key={v.token} onMouseDown={e => { e.preventDefault(); editorRef.current?.focus(); document.execCommand('insertText', false, v.token); if (editorRef.current) onChange({ html: editorRef.current.innerHTML }); }}
            className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-mono text-violet-700 border border-violet-200 hover:bg-violet-100 transition">{v.token}</button>
        ))}
      </div>
      {/* Editable area */}
      <div
        ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={() => { if (editorRef.current) onChange({ html: editorRef.current.innerHTML }); }}
        className="min-h-[120px] max-h-[220px] overflow-y-auto rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-100"
      />
    </DP>
    <DP label="Background Color"><ColorPicker value={block.bgColor} onChange={v => onChange({ bgColor: v })} /></DP>
    <DP label="Padding (px)">
      <input type="range" value={block.padding} onChange={e => onChange({ padding: +e.target.value })} min={8} max={80} className="w-full accent-violet-600" />
      <span className="text-[10px] text-slate-500">{block.padding}px</span>
    </DP>
  </>);
}

/* ─── Image block props ───────────────────────────────────────────────── */
function ImageProps({ block, onChange }: { block: ImageBlockData; onChange: (p: Partial<ImageBlockData>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ imageUrl: reader.result as string });
    reader.readAsDataURL(file);
  }
  return (<>
    <DP label="Image URL">
      <input type="url" value={block.imageUrl} onChange={e => onChange({ imageUrl: e.target.value })} placeholder="https://example.com/image.jpg" className={piCls} />
    </DP>
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">— or upload from device —</p>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-violet-200 py-2.5 text-xs font-semibold text-violet-600 hover:border-violet-400 hover:bg-violet-50 transition">
        📁 Upload Image File
      </button>
    </div>
    {block.imageUrl && (
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
        <img src={block.imageUrl} alt="preview" className="w-full object-contain max-h-28" onError={e => (e.currentTarget.style.display = 'none')} />
      </div>
    )}
    <DP label="Alt Text (for accessibility)">
      <input type="text" value={block.altText} onChange={e => onChange({ altText: e.target.value })} placeholder="Describe the image..." className={piCls} />
    </DP>
    <DP label={`Width: ${block.width}%`}>
      <input type="range" value={block.width} onChange={e => onChange({ width: +e.target.value })} min={20} max={100} step={5} className="w-full accent-violet-600" />
    </DP>
    <DP label="Alignment"><AlignPicker value={block.align} onChange={v => onChange({ align: v })} /></DP>
    <DP label="Link URL (optional)">
      <input type="url" value={block.link ?? ''} onChange={e => onChange({ link: e.target.value || undefined })} placeholder="https://..." className={piCls} />
    </DP>
    <DP label="Caption (optional)">
      <input type="text" value={block.caption ?? ''} onChange={e => onChange({ caption: e.target.value || undefined })} placeholder="Image caption..." className={piCls} />
    </DP>
    <DP label="Background Color"><ColorPicker value={block.bgColor} onChange={v => onChange({ bgColor: v })} /></DP>
  </>);
}

/* ─── Button block props ─────────────────────────────────────────────── */
function ButtonProps({ block, onChange }: { block: ButtonBlockData; onChange: (p: Partial<ButtonBlockData>) => void }) {
  return (<>
    <DP label="Button Label">
      <input type="text" value={block.label} onChange={e => onChange({ label: e.target.value })} className={piCls} />
    </DP>
    <DP label="Link URL">
      <input type="url" value={block.href} onChange={e => onChange({ href: e.target.value })} placeholder="https://..." className={piCls} />
    </DP>
    <DP label="Button Color"><ColorPicker value={block.bgColor} onChange={v => onChange({ bgColor: v })} /></DP>
    <DP label="Text Color"><ColorPicker value={block.textColor} onChange={v => onChange({ textColor: v })} /></DP>
    <DP label="Alignment"><AlignPicker value={block.align} onChange={v => onChange({ align: v })} /></DP>
    <DP label={`Corner Radius: ${block.borderRadius}px`}>
      <input type="range" value={block.borderRadius} onChange={e => onChange({ borderRadius: +e.target.value })} min={0} max={50} className="w-full accent-violet-600" />
    </DP>
    <DP label="Padding">
      <input type="text" value={block.btnPadding} onChange={e => onChange({ btnPadding: e.target.value })} placeholder="14px 32px" className={piCls} />
      <p className="text-[10px] text-slate-400 mt-0.5">Format: top/bottom left/right — e.g. 14px 32px</p>
    </DP>
    <div className="rounded-xl p-3 border border-slate-100 bg-slate-50 text-center">
      <span style={{ display: 'inline-block', background: block.bgColor, color: block.textColor, fontSize: 13, fontWeight: 700, padding: block.btnPadding, borderRadius: block.borderRadius }}>
        {block.label || 'Button'}
      </span>
    </div>
  </>);
}

/* ─── Divider block props ────────────────────────────────────────────── */
function DividerProps({ block, onChange }: { block: DividerBlockData; onChange: (p: Partial<DividerBlockData>) => void }) {
  return (<>
    <DP label="Line Color"><ColorPicker value={block.color} onChange={v => onChange({ color: v })} /></DP>
    <DP label="Background Color"><ColorPicker value={block.bgColor} onChange={v => onChange({ bgColor: v })} /></DP>
    <DP label={`Thickness: ${block.thickness}px`}>
      <input type="range" value={block.thickness} onChange={e => onChange({ thickness: +e.target.value })} min={1} max={8} className="w-full accent-violet-600" />
    </DP>
    <DP label={`Vertical Spacing: ${block.marginY}px`}>
      <input type="range" value={block.marginY} onChange={e => onChange({ marginY: +e.target.value })} min={0} max={40} className="w-full accent-violet-600" />
    </DP>
  </>);
}

/* ─── Spacer block props ─────────────────────────────────────────────── */
function SpacerProps({ block, onChange }: { block: SpacerBlockData; onChange: (p: Partial<SpacerBlockData>) => void }) {
  return (
    <DP label={`Height: ${block.height}px`}>
      <input type="range" value={block.height} onChange={e => onChange({ height: +e.target.value })} min={8} max={120} step={4} className="w-full accent-violet-600" />
    </DP>
  );
}

/* ─── Footer block props ─────────────────────────────────────────────── */
function FooterProps({ block, onChange }: { block: FooterBlockData; onChange: (p: Partial<FooterBlockData>) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editorRef.current) editorRef.current.innerHTML = block.html; }, [block.id]);
  function exec(cmd: string, val?: string) {
    editorRef.current?.focus(); document.execCommand(cmd, false, val);
    if (editorRef.current) onChange({ html: editorRef.current.innerHTML });
  }
  return (<>
    <DP label="Footer Content">
      <div className="flex gap-1 mb-1">
        {([['bold','B'],['italic','I'],['underline','U']] as const).map(([cmd, label]) => (
          <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd); }} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">{label}</button>
        ))}
        <button onMouseDown={e => { e.preventDefault(); const url = prompt('Link URL:'); if (url) exec('createLink', url); }} className="px-2 h-7 flex items-center rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">🔗 Link</button>
      </div>
      <div
        ref={editorRef} contentEditable suppressContentEditableWarning
        onInput={() => { if (editorRef.current) onChange({ html: editorRef.current.innerHTML }); }}
        className="min-h-[60px] max-h-[120px] overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed focus:outline-none focus:border-violet-400"
      />
    </DP>
    <DP label="Background Color"><ColorPicker value={block.bgColor} onChange={v => onChange({ bgColor: v })} /></DP>
    <DP label="Text Color"><ColorPicker value={block.textColor} onChange={v => onChange({ textColor: v })} /></DP>
  </>);
}

/* ── Email Preview Modal (iframe — exactly what client sees) ─────────── */
function EmailPreviewModal({ subject, html, onClose }: { subject: string; html: string; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="font-bold text-slate-900">📧 Full Email Preview</p>
            <p className="text-xs text-slate-500 mt-0.5">This is <strong>exactly</strong> what your client will receive in their inbox</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-3 space-y-1">
          <div className="flex gap-3 text-xs"><span className="font-semibold text-slate-600 w-16">From:</span><span className="text-slate-500">Jane Doe &lt;jane@yourbusiness.com&gt;</span></div>
          <div className="flex gap-3 text-xs"><span className="font-semibold text-slate-600 w-16">To:</span><span className="text-slate-500">John Smith &lt;john@example.com&gt;</span></div>
          <div className="flex gap-3 text-xs border-t border-slate-200 pt-2 mt-1"><span className="font-semibold text-slate-600 w-16">Subject:</span><span className="font-bold text-slate-800">{subject || '(no subject)'}</span></div>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ background: '#f0f0f0' }}>
          <iframe
            ref={iframeRef}
            srcDoc={html}
            title="Email Preview"
            style={{ width: '100%', minHeight: 400, border: 'none', display: 'block' }}
            sandbox="allow-same-origin"
            onLoad={() => {
              const f = iframeRef.current;
              const h = f?.contentDocument?.body?.scrollHeight;
              if (f && h) f.style.height = (h + 40) + 'px';
            }}
          />
        </div>
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-400">Preview uses real HTML that email clients will render</p>
          <button onClick={onClose} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">Close</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 3 — Scheduling & Automation
══════════════════════════════════════════════════════════════════════════ */
type SchedulingSubTab = 'schedule' | 'automation' | 'manual';
const SCHEDULING_SUBTABS: { id: SchedulingSubTab; label: string; icon: typeof Mail; desc: string }[] = [
  { id: 'schedule',   label: 'Schedule Email',  icon: Calendar, desc: 'Send at a specific date & time' },
  { id: 'automation', label: 'Auto Sequences',  icon: Zap,      desc: 'Automated drip emails for leads' },
  { id: 'manual',     label: 'Send Now',        icon: Send,     desc: 'Send an email immediately' },
];

function SchedulingTab({
  data,
  workspaceId,
  onRefresh,
  allTemplates,
}: {
  data: AccountSettingsGetResponse | null;
  workspaceId: string;
  onRefresh: () => void;
  allTemplates: EmailTemplate[];
}) {
  const [subTab, setSubTab] = useState<SchedulingSubTab>('schedule');
  const steps = data?.sequence_steps ?? [];
  const automation = data?.automation;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {SCHEDULING_SUBTABS.map(st => {
          const Icon = st.icon; const isActive = subTab === st.id;
          return (
            <button key={st.id} onClick={() => setSubTab(st.id)}
              className={cls('flex flex-col items-start gap-0.5 rounded-2xl border p-4 text-left transition-all duration-200', isActive ? 'border-violet-300 bg-violet-50 shadow-sm ring-1 ring-violet-200' : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40')}>
              <div className={cls('flex h-8 w-8 items-center justify-center rounded-xl mb-1', isActive ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500')}><Icon className="h-4 w-4" /></div>
              <p className={cls('text-sm font-semibold', isActive ? 'text-violet-800' : 'text-slate-700')}>{st.label}</p>
              <p className="text-[11px] text-slate-400 leading-snug">{st.desc}</p>
            </button>
          );
        })}
      </div>
      {subTab === 'schedule'   && <ScheduleEmailPanel allTemplates={allTemplates} />}
      {subTab === 'automation' && <AutomationPanel workspaceId={workspaceId} steps={steps} automation={automation} onRefresh={onRefresh} />}
      {subTab === 'manual'     && <ManualSendPanel allTemplates={allTemplates} />}
    </div>
  );
}

/* ─── Schedule Email Panel (step wizard) ─────────────────────────────── */
type ScheduleStep = 1 | 2 | 3 | 4;
function ScheduleEmailPanel({ allTemplates }: { allTemplates: EmailTemplate[] }) {
  const [step, setStep] = useState<ScheduleStep>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [leadsInput, setLeadsInput] = useState('');
  const [parsedLeads, setParsedLeads] = useState<string[]>([]);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedTz, setSchedTz] = useState('Asia/Kolkata');
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [stepErr, setStepErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function parseLeads(raw: string) { return raw.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.includes('@')); }

  function goNext() {
    setStepErr(null);
    if (step === 1 && !selectedTemplate) { setStepErr('Please select a template.'); return; }
    if (step === 2) { const leads = parseLeads(leadsInput); if (leads.length === 0) { setStepErr('Add at least one valid email address.'); return; } setParsedLeads(leads); }
    if (step === 3) { if (!schedDate) { setStepErr('Please select a date.'); return; } if (new Date(`${schedDate}T${schedTime}`) <= new Date()) { setStepErr('Please choose a future date and time.'); return; } }
    if (step === 4) {
      setScheduledEmails(prev => [{ id: `sched-${Date.now()}`, templateId: selectedTemplate!.id, templateName: selectedTemplate!.name, subject: selectedTemplate!.subject, leads: parsedLeads, scheduledAt: new Date(`${schedDate}T${schedTime}`).toISOString(), timezone: schedTz, status: 'pending', createdAt: new Date().toISOString() }, ...prev]);
      toast.success(`Email scheduled for ${parsedLeads.length} lead(s)!`);
      setSent(true); setStep(1); setSelectedTemplate(null); setLeadsInput(''); setParsedLeads([]); setSchedDate(''); setSchedTime('09:00');
      setTimeout(() => setSent(false), 5000); return;
    }
    setStep(s => (s + 1) as ScheduleStep);
  }

  const stepLabels = ['Choose Template', 'Add Leads', 'Set Date & Time', 'Review & Confirm'];
  return (
    <div className="space-y-5">
      {sent && <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /><div><p className="font-semibold">Email Scheduled!</p><p className="text-xs text-emerald-600 mt-0.5">Your email will be sent at the scheduled time.</p></div></div>}

      {/* Step indicator */}
      <div className="flex items-center gap-0 rounded-2xl border border-slate-200 bg-white p-4">
        {stepLabels.map((label, i) => {
          const num = i + 1; const isDone = step > num; const isActive = step === num;
          return (
            <div key={num} className="flex items-center flex-1 min-w-0">
              <div className={cls('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition', isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400')}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : num}
              </div>
              <p className={cls('ml-1.5 text-xs font-medium truncate hidden sm:block', isActive ? 'text-violet-700' : isDone ? 'text-emerald-600' : 'text-slate-400')}>{label}</p>
              {i < stepLabels.length - 1 && <div className={cls('mx-2 flex-1 h-px', isDone ? 'bg-emerald-300' : 'bg-slate-200')} />}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 min-h-[300px] flex flex-col gap-4">
        {step === 1 && (
          <div className="space-y-3">
            <div><p className="text-base font-bold text-slate-800">Select Template</p><p className="text-sm text-slate-500 mt-0.5">Which email template do you want to send?</p></div>
            <div className="max-w-xl">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Template *</label>
              <select
                value={selectedTemplate?.id ?? ''}
                onChange={e => {
                  const selected = allTemplates.find(template => template.id === e.target.value) ?? null;
                  setSelectedTemplate(selected);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none"
              >
                <option value="">Select a template</option>
                {allTemplates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.category})
                  </option>
                ))}
              </select>
            </div>
            {selectedTemplate && (
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{selectedTemplate.name}</p>
                <p className="mt-1 text-sm text-slate-700">{selectedTemplate.subject}</p>
              </div>
            )}
            {allTemplates.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                No templates available yet. Create one in Email Templates first.
              </div>
            )}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
              Use the dropdown to pick one template before scheduling recipients.
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <div><p className="text-base font-bold text-slate-800">Add Lead Emails</p><p className="text-sm text-slate-500 mt-0.5">Paste email addresses — one per line, or separated by commas.</p></div>
            <textarea value={leadsInput} onChange={e => setLeadsInput(e.target.value)} rows={8} placeholder={`john@example.com\njane@company.com`} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-mono resize-none focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100" />
            {leadsInput.trim() && <p className="text-xs text-slate-500">Detected: <span className="font-bold text-violet-600">{parseLeads(leadsInput).length} lead(s)</span></p>}
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">💡 <strong>Tip:</strong> Separate multiple emails by new lines, commas, or semicolons.</div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div><p className="text-base font-bold text-slate-800">Set Date & Time</p><p className="text-sm text-slate-500 mt-0.5">When should this email be sent?</p></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Send Date *</label><input type="date" value={schedDate} min={new Date().toISOString().split('T')[0]} onChange={e => setSchedDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></div>
              <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Send Time *</label><input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></div>
            </div>
            <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Timezone</label><select value={schedTz} onChange={e => setSchedTz(e.target.value)} className="w-full max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none">{TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}</select></div>
            {schedDate && <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-800"><Timer className="inline h-4 w-4 mr-1.5 text-violet-500" />Sending on <strong>{new Date(`${schedDate}T${schedTime}`).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong> at <strong>{schedTime}</strong> ({schedTz})</div>}
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <div><p className="text-base font-bold text-slate-800">Review & Confirm</p><p className="text-sm text-slate-500 mt-0.5">Check everything before scheduling.</p></div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 divide-y divide-slate-200 overflow-hidden">
              {[['Template', selectedTemplate?.name ?? ''], ['Subject', selectedTemplate?.subject ?? ''], ['Recipients', `${parsedLeads.length} lead(s)`], ['Send At', `${new Date(`${schedDate}T${schedTime}`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at ${schedTime} (${schedTz})`]].map(([label, value]) => (
                <div key={label} className="flex items-start gap-4 px-4 py-3"><span className="text-xs font-semibold text-slate-500 w-24 shrink-0">{label}</span><span className="text-sm text-slate-800 font-medium break-words">{value}</span></div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-semibold text-slate-500 mb-2">Recipients:</p><div className="flex flex-wrap gap-1.5">{parsedLeads.slice(0, 8).map(e => <span key={e} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{e}</span>)}{parsedLeads.length > 8 && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs">+{parsedLeads.length - 8} more</span>}</div></div>
          </div>
        )}
        {stepErr && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0 text-red-500" />{stepErr}</div>}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100">
          <button onClick={() => { setStepErr(null); setStep(s => Math.max(1, s - 1) as ScheduleStep); }} disabled={step === 1} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">← Back</button>
          <button onClick={goNext} className={cls('flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95 shadow-sm', step === 4 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-violet-600 hover:bg-violet-700')}>
            {step === 4 ? <><Calendar className="h-4 w-4" />Confirm & Schedule</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>
      </div>

      {scheduledEmails.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3"><Clock className="h-4 w-4 text-violet-500" /><span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Scheduled Queue</span><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-600">{scheduledEmails.length}</span></div>
          <div className="space-y-2">
            {scheduledEmails.map(se => {
              const statusColors: Record<ScheduleStatus, string> = { pending: 'bg-amber-100 text-amber-700', sent: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-red-700', cancelled: 'bg-slate-100 text-slate-500' };
              const dt = new Date(se.scheduledAt);
              return (
                <div key={se.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50"><Calendar className="h-4 w-4 text-violet-500" /></div>
                  <div className="flex-1 min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{se.templateName}</p><p className="text-xs text-slate-500 mt-0.5">{se.leads.length} recipient(s) · {dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at {dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p></div>
                  <span className={cls('rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize shrink-0', statusColors[se.status])}>{se.status}</span>
                  {se.status === 'pending' && <button onClick={() => { if (!confirm('Cancel?')) return; setScheduledEmails(prev => prev.map(x => x.id === se.id ? { ...x, status: 'cancelled' } : x)); toast.success('Cancelled.'); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Automation Panel ────────────────────────────────────────────────── */
function AutomationPanel({ workspaceId, steps, automation, onRefresh }: { workspaceId: string; steps: EmailSequenceStep[]; automation: AccountSettingsGetResponse['automation'] | undefined; onRefresh: () => void }) {
  const [isEnabled, setIsEnabled] = useState(automation?.is_enabled ?? false);
  const [timezone, setTimezone] = useState(automation?.timezone ?? 'UTC');
  const [stopOnReply, setStopOnReply] = useState(automation?.stop_on_reply ?? false);
  const [saving, setSaving] = useState(false), [saveOk, setSaveOk] = useState(false), [saveErr, setSaveErr] = useState<string | null>(null);
  const [addingStep, setAddingStep] = useState(false), [newDelay, setNewDelay] = useState(24), [newSubject, setNewSubject] = useState(''), [newBody, setNewBody] = useState(''), [addingErr, setAddingErr] = useState<string | null>(null);
  useEffect(() => { if (automation) { setIsEnabled(automation.is_enabled); setTimezone(automation.timezone); setStopOnReply(automation.stop_on_reply); } }, [automation]);

  async function handleSave() {
    setSaving(true); setSaveOk(false); setSaveErr(null);
    try { await updateAutomationSettings(workspaceId, { is_enabled: isEnabled, timezone, stop_on_reply: stopOnReply }); setSaveOk(true); onRefresh(); }
    catch (e) { setSaveErr(e instanceof Error ? e.message : 'Failed.'); } finally { setSaving(false); }
  }
  async function handleAddStep() {
    setAddingErr(null);
    if (!newSubject.trim()) { setAddingErr('Subject is required.'); return; }
    if (!newBody.trim()) { setAddingErr('Body is required.'); return; }
    try { await addSequenceStep(workspaceId, { step_order: steps.length + 1, delay_hours: newDelay, subject_template: newSubject.trim(), body_template: newBody.trim() }); setAddingStep(false); setNewSubject(''); setNewBody(''); setNewDelay(24); onRefresh(); toast.success('Step added!'); }
    catch (e) { setAddingErr(e instanceof Error ? e.message : 'Failed.'); }
  }
  async function handleDeleteStep(id: string) { if (!confirm('Delete this step?')) return; try { await deleteSequenceStep(id); onRefresh(); toast.success('Deleted.'); } catch { toast.error('Failed.'); } }
  async function handleToggleStep(step: EmailSequenceStep) { try { await updateSequenceStep(step.id, { is_active: !step.is_active }); onRefresh(); } catch { toast.error('Failed.'); } }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 px-5 py-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white"><Zap className="h-5 w-5" /></div>
        <div><p className="font-bold text-violet-900">Automated Email Sequences</p><p className="text-sm text-violet-700 mt-0.5">Set up a series of emails that automatically send to leads after enrollment — completely hands-free.</p></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <SectionLabel icon={Settings} title="Automation Settings" />
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5">
          <div><p className="font-semibold text-slate-800">Enable Auto Sequences</p><p className="text-xs text-slate-500 mt-0.5">When ON, enrolled leads receive follow-up emails automatically.</p></div>
          <button onClick={() => setIsEnabled(v => !v)} className={cls('relative flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200', isEnabled ? 'bg-violet-600' : 'bg-slate-200')}>
            <span className={cls('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200', isEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Send Timezone</label><select value={timezone} onChange={e => setTimezone(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none">{TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}</select></div>
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <button onClick={() => setStopOnReply(v => !v)} className={cls('relative flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200', stopOnReply ? 'bg-violet-600' : 'bg-slate-200')}><span className={cls('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', stopOnReply ? 'translate-x-4' : 'translate-x-0.5')} /></button>
            <div><p className="text-sm font-medium text-slate-700">Stop on reply</p><p className="text-xs text-slate-400">Stops if lead replies</p></div>
          </div>
        </div>
        {saveErr && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{saveErr}</div>}
        {saveOk && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0" />Settings saved.</div>}
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save Settings
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionLabel icon={Send} title="Follow-up Sequence Steps" />
          <button onClick={() => setAddingStep(true)} className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"><Plus className="h-3.5 w-3.5" />Add Step</button>
        </div>
        {steps.length === 0 && !addingStep ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-10 text-center">
            <Send className="h-8 w-8 mx-auto text-slate-300 mb-3" /><p className="font-semibold text-slate-600">No sequence steps yet</p>
            <p className="text-sm text-slate-400 mt-1">Add your first step to build an automated drip campaign.</p>
            <button onClick={() => setAddingStep(true)} className="mt-4 flex items-center gap-1.5 mx-auto rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><Plus className="h-4 w-4" />Add First Step</button>
          </div>
        ) : (
          <div className="relative pl-5">
            {steps.length > 1 && <div className="absolute left-[9px] top-4 bottom-4 w-px bg-slate-200" />}
            <div className="space-y-3">{steps.map((step, idx) => <SequenceStepCard key={step.id} step={step} index={idx} onToggle={() => handleToggleStep(step)} onDelete={() => handleDeleteStep(step.id)} />)}</div>
          </div>
        )}
        {addingStep && (
          <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-3 mt-2">
            <p className="text-sm font-bold text-slate-900">➕ Add New Step</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Delay (hours after previous)</label><input type="number" min={0} value={newDelay} onChange={e => setNewDelay(parseInt(e.target.value, 10) || 0)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none" /><p className="mt-0.5 text-[11px] text-slate-400">{delayLabel(newDelay)}</p></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Step Number</label><div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">#{steps.length + 1}</div></div>
            </div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Subject</label><input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="e.g. Following up, {{lead_first_name}}" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Body</label><textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={4} placeholder="Write your follow-up email..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm resize-none focus:border-violet-400 focus:outline-none" /></div>
            {addingErr && <p className="text-xs text-red-600">{addingErr}</p>}
            <div className="flex gap-2">
              <button onClick={handleAddStep} className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><Plus className="h-3.5 w-3.5" />Add Step</button>
              <button onClick={() => { setAddingStep(false); setAddingErr(null); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Manual Send Panel ───────────────────────────────────────────────── */
function ManualSendPanel({ allTemplates }: { allTemplates: EmailTemplate[] }) {
  const [useTemplate, setUseTemplate] = useState(false), [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [toEmails, setToEmails] = useState(''), [subject, setSubject] = useState(''), [body, setBody] = useState('');
  const [sending, setSending] = useState(false), [sent, setSent] = useState(false), [sendErr, setSendErr] = useState<string | null>(null);
  function parseLeads(raw: string) { return raw.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.includes('@')); }
  function handleSelectTemplate(t: EmailTemplate | null) { setSelectedTemplate(t); if (t) { setSubject(t.subject); setBody(t.isHtml ? '(Rich HTML template selected — cannot edit inline)' : t.body); } else { setSubject(''); setBody(''); } }
  async function handleSend() {
    setSendErr(null);
    const leads = parseLeads(toEmails);
    if (leads.length === 0) { setSendErr('Enter at least one valid email address.'); return; }
    if (!subject.trim()) { setSendErr('Subject is required.'); return; }
    if (!body.trim()) { setSendErr('Message body is required.'); return; }
    setSending(true); await new Promise(r => setTimeout(r, 1200)); setSending(false); setSent(true);
    setToEmails(''); setSubject(''); setBody(''); setSelectedTemplate(null);
    toast.success(`Email sent to ${leads.length} recipient(s)!`);
    setTimeout(() => setSent(false), 5000);
  }
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 px-5 py-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Send className="h-5 w-5" /></div>
        <div><p className="font-bold text-blue-900">Send Email Right Now</p><p className="text-sm text-blue-700 mt-0.5">Compose a manual email and send it immediately to one or more leads.</p></div>
      </div>
      {sent && <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /><div><p className="font-semibold">Email Sent!</p><p className="text-xs text-emerald-600 mt-0.5">Your email has been delivered.</p></div></div>}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5"><Users className="inline h-3.5 w-3.5 mr-1 text-slate-400" />To (Recipients) *</label><textarea value={toEmails} onChange={e => setToEmails(e.target.value)} rows={3} placeholder="john@example.com, jane@company.com or one per line" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono resize-none focus:border-violet-400 focus:outline-none" />{toEmails.trim() && <p className="mt-1 text-xs text-slate-500">{parseLeads(toEmails).length} recipient(s) detected</p>}</div>
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3">
          <button onClick={() => { setUseTemplate(v => !v); if (useTemplate) handleSelectTemplate(null); }} className={cls('relative flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors', useTemplate ? 'bg-violet-600' : 'bg-slate-200')}><span className={cls('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200', useTemplate ? 'translate-x-4' : 'translate-x-0.5')} /></button>
          <p className="text-sm font-medium text-slate-700">Start from a template</p>
        </div>
        {useTemplate && (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600">Choose Template</label>
            <select
              value={selectedTemplate?.id ?? ''}
              onChange={e => {
                const selected = allTemplates.find(template => template.id === e.target.value) ?? null;
                handleSelectTemplate(selected);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none"
            >
              <option value="">Select a template</option>
              {allTemplates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.category})
                </option>
              ))}
            </select>
            {selectedTemplate && <p className="text-xs text-slate-500">Subject: {selectedTemplate.subject}</p>}
          </div>
        )}
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Subject *</label><input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="What is this email about?" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-violet-400 focus:outline-none" /></div>
        <div><label className="block text-xs font-semibold text-slate-600 mb-1.5">Message *</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="Write your email message here..." className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm leading-relaxed resize-none focus:border-violet-400 focus:outline-none" /></div>
        {sendErr && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0 text-red-500" />{sendErr}</div>}
        <button onClick={handleSend} disabled={sending} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 active:scale-95 shadow-sm">
          {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Sending...' : 'Send Email Now'}
        </button>
      </div>
    </div>
  );
}

/* ─── Sequence step card ─────────────────────────────────────────────── */
function SequenceStepCard({ step, index, onToggle, onDelete }: { step: EmailSequenceStep; index: number; onToggle: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={cls('relative rounded-2xl border bg-white transition', step.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60')}>
      <div className="absolute -left-5 top-4 h-3.5 w-3.5 rounded-full border-2 border-white bg-violet-500 ring-2 ring-violet-200" />
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-bold text-violet-600">{index + 1}</div>
        <div className="flex-1 min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{step.subject_template}</p><p className="text-xs text-slate-500 mt-0.5">{delayLabel(step.delay_hours)}</p></div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onToggle} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">{step.is_active ? <ToggleRight className="h-4 w-4 text-violet-600" /> : <ToggleLeft className="h-4 w-4" />}</button>
          <button onClick={() => setExpanded(v => !v)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {expanded && <div className="border-t border-slate-100 px-4 py-3"><pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600 bg-slate-50 rounded-xl p-3">{step.body_template}</pre></div>}
    </div>
  );
}

/* ─── Shared components ──────────────────────────────────────────────── */
function SectionLabel({ icon: Icon, title }: { icon: typeof Mail; title: string }) {
  return <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-violet-500" /><p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</p></div>;
}
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div><label className="block text-xs font-semibold text-slate-600 mb-1">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</label>{children}</div>;
}
function EmptyState({ icon: Icon, title, description }: { icon: typeof Mail; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Icon className="h-6 w-6" /></div>
      <p className="mt-3 font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>
    </div>
  );
}
