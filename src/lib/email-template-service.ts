import { getSupabaseClient } from './supabaseClient';

/* ─── Template Types ──────────────────────────────────────────────────── */

export type TemplateType = 'custom' | 'preset' | 'system';
export type TemplateUseCase = 'welcome' | 'followup' | 'reminder' | 'feedback' | 'offer' | 'custom';
export type EmailLayoutBlockType = 'header' | 'hero' | 'text' | 'image' | 'cta' | 'divider' | 'footer';
export const EMAIL_TEMPLATE_ALLOWED_VARIABLES = [
  'lead_full_name',
  'lead_first_name',
  'lead_email',
  'workspace_name',
  'sender_name',
  'sender_email',
] as const;

export interface TemplateVariableValidation {
  used: string[];
  unsupported: string[];
}

export interface EmailLayoutBlock {
  id?: string;
  type: EmailLayoutBlockType;
  content?: string;
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  altText?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  align?: 'left' | 'center' | 'right';
  meta?: Record<string, unknown>;
}

export interface EmailTemplateLayout {
  version: number;
  blocks: EmailLayoutBlock[];
}

export interface EmailBrandTheme {
  logo_url?: string;
  brand_name?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  body_bg_color?: string;
  card_bg_color?: string;
  text_color?: string;
  heading_font?: string;
  body_font?: string;
  footer_company_name?: string;
  footer_address?: string;
  footer_contact_email?: string;
  footer_signature?: string;
  sender_display_name_default?: string;
  sender_email_default?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailTemplateCategory {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_order: number;
  is_active: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  workspace_id: string;
  category_id?: string;
  name: string;
  slug?: string;
  description?: string;
  thumbnail_url?: string;
  subject_template: string;
  body_html_template?: string;
  body_plain_template?: string;
  is_html: boolean;
  preview_html?: string;
  preview_plain?: string;
  template_type: TemplateType;
  use_case?: TemplateUseCase;
  is_active: boolean;
  is_locked: boolean;
  layout_json: EmailTemplateLayout;
  theme_overrides: Record<string, unknown>;
  preview_meta: Record<string, unknown>;
  logo_url?: string;
  brand_primary_color?: string;
  brand_secondary_color?: string;
  include_footer: boolean;
  footer_html?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  clone_count: number;
  usage_count: number;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateAsset {
  id: string;
  workspace_id: string;
  template_id?: string;
  name: string;
  file_type: 'image' | 'document' | 'attachment';
  mime_type: string;
  file_size: number;
  storage_path: string;
  public_url: string;
  is_logo: boolean;
  is_signature: boolean;
  usage_count: number;
  metadata?: Record<string, unknown>;
  uploaded_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaign {
  id: string;
  workspace_id: string;
  template_id: string;
  sender_id?: string;
  name: string;
  description?: string;
  subject_override?: string;
  body_override_html?: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';
  recipient_filter?: Record<string, unknown>;
  segment_definition?: Record<string, unknown>;
  manual_include_record_ids?: string[];
  manual_exclude_record_ids?: string[];
  recipient_count: number;
  scheduled_at?: string;
  started_at?: string;
  paused_at?: string;
  completed_at?: string;
  stopped_at?: string;
  stop_reason?: string;
  send_window_start?: number;
  send_window_end?: number;
  send_window_days?: string[];
  timezone: string;
  rate_limit: number;
  metadata?: Record<string, unknown>;
  snapshot_frozen_at?: string;
  latest_snapshot_id?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaignRecipient {
  id: string;
  workspace_id: string;
  campaign_id: string;
  record_id: string;
  recipient_email: string;
  recipient_name?: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'unsubscribed' | 'skipped';
  suppression_reason?: string | null;
  scheduled_for?: string;
  sent_at?: string;
  failure_reason?: string;
  provider_message_id?: string;
  last_error?: string;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaignStats {
  id: string;
  workspace_id: string;
  campaign_id: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  last_updated_at: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipientPreview {
  record_id: string;
  recipient_email: string;
  recipient_name: string | null;
  suppressed: boolean;
  suppression_reason: string | null;
  status: EmailCampaignRecipient['status'];
}

export interface CampaignEnumerationResult {
  campaign_id: string;
  segment_definition: Record<string, unknown>;
  include_record_ids: string[];
  exclude_record_ids: string[];
  counts: {
    total_candidates: number;
    included_with_email: number;
    active_recipients: number;
    suppressed_recipients: number;
  };
  preview: CampaignRecipientPreview[];
  frozen: boolean;
}

export interface WorkspaceEmailUnsubscribe {
  id: string;
  workspace_id: string;
  email: string;
  source: string;
  reason?: string;
  details?: Record<string, unknown>;
  unsubscribed_at: string;
  resubscribed_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeEmail(value: unknown) {
  const next = asString(value);
  if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    return '';
  }

  return next.toLowerCase();
}

function asLayout(layout?: EmailTemplateLayout | null): EmailTemplateLayout {
  if (!layout || !Array.isArray(layout.blocks)) {
    return {
      version: 1,
      blocks: [
        {
          id: crypto.randomUUID(),
          type: 'text',
          content: 'Write your message here.',
          align: 'left',
        },
      ],
    };
  }

  return {
    version: layout.version ?? 1,
    blocks: layout.blocks,
  };
}

const TEMPLATE_VARIABLE_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const TEMPLATE_ALLOWED_VARIABLE_SET = new Set<string>(EMAIL_TEMPLATE_ALLOWED_VARIABLES);

function extractVariablesFromString(value: string, output: Set<string>) {
  TEMPLATE_VARIABLE_REGEX.lastIndex = 0;
  let match = TEMPLATE_VARIABLE_REGEX.exec(value);
  while (match) {
    const token = asString(match[1]);
    if (token) {
      output.add(token);
    }
    match = TEMPLATE_VARIABLE_REGEX.exec(value);
  }
}

function parseResourceLinks(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as { label: string; url: string }[];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      const label = asString(record.label);
      const url = asString(record.url);
      if (!url) return null;
      return { label, url };
    })
    .filter((entry): entry is { label: string; url: string } => Boolean(entry));
}

function extractVariablesFromBlock(block: EmailLayoutBlock, output: Set<string>) {
  const values = [
    asString(block.content),
    asString(block.title),
    asString(block.subtitle),
    asString(block.imageUrl),
    asString(block.altText),
    asString(block.buttonLabel),
    asString(block.buttonUrl),
  ];

  for (const value of values) {
    if (value) extractVariablesFromString(value, output);
  }

  const meta = asRecord(block.meta);
  for (const link of parseResourceLinks(meta.links)) {
    if (link.label) extractVariablesFromString(link.label, output);
    extractVariablesFromString(link.url, output);
  }
  for (const doc of parseResourceLinks(meta.documents)) {
    if (doc.label) extractVariablesFromString(doc.label, output);
    extractVariablesFromString(doc.url, output);
  }
}

export function validateTemplateVariables(input: {
  subject_template?: string;
  body_html_template?: string | null;
  body_plain_template?: string | null;
  layout_json?: EmailTemplateLayout | null;
}): TemplateVariableValidation {
  const usedVariables = new Set<string>();
  extractVariablesFromString(asString(input.subject_template), usedVariables);
  extractVariablesFromString(asString(input.body_html_template), usedVariables);
  extractVariablesFromString(asString(input.body_plain_template), usedVariables);

  const layout = asLayout(input.layout_json ?? null);
  layout.blocks.forEach((block) => extractVariablesFromBlock(block, usedVariables));

  const used = Array.from(usedVariables).sort((a, b) => a.localeCompare(b));
  const unsupported = used.filter((token) => !TEMPLATE_ALLOWED_VARIABLE_SET.has(token));
  return { used, unsupported };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeEmailImageUrl(value: string) {
  const raw = asString(value);
  if (!raw) return '';
  if (/^(data:|blob:|file:)/i.test(raw)) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return /^https?:\/\//i.test(raw) ? raw : '';
}

function normalizePreviewTheme(overrides?: Record<string, unknown>) {
  const source = asRecord(overrides);
  return {
    bodyBg: asString(source.body_bg_color) || asString(source.bodyBgColor) || '#eef2ff',
    cardBg: asString(source.card_bg_color) || asString(source.cardBgColor) || '#ffffff',
    textColor: asString(source.text_color) || asString(source.textColor) || '#334155',
    headingColor: asString(source.secondary_color) || asString(source.secondaryColor) || '#0f172a',
    accentColor: asString(source.accent_color) || asString(source.accentColor) || '#4f46e5',
    headingFont: asString(source.heading_font) || asString(source.headingFont) || 'Georgia, serif',
    bodyFont: asString(source.body_font) || asString(source.bodyFont) || 'Arial, sans-serif',
  };
}

function renderResourceLinksHtml(
  links: { label: string; url: string }[],
  title: string,
  accentColor: string,
  bodyFont: string,
) {
  if (links.length === 0) return '';

  const rows = links
    .map((link) => {
      const label = escapeHtml(link.label || link.url);
      const url = escapeHtml(link.url);
      return `<li style="margin:0 0 6px 0;"><a href="${url}" style="color:${accentColor};text-decoration:underline;font-family:${bodyFont};">${label}</a></li>`;
    })
    .join('');

  return `<div style="margin-top:12px;"><div style="font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;opacity:.72;">${title}</div><ul style="margin:8px 0 0 16px;padding:0;">${rows}</ul></div>`;
}

function renderResourceLinksText(links: { label: string; url: string }[], title: string) {
  if (links.length === 0) return '';
  return `${title}:\n${links.map((link) => `- ${link.label || link.url}: ${link.url}`).join('\n')}`;
}

function renderLayoutBlockHtml(block: EmailLayoutBlock, theme: ReturnType<typeof normalizePreviewTheme>) {
  const align = block.align === 'center' || block.align === 'right' ? block.align : 'left';
  const content = asString(block.content);
  const title = asString(block.title);
  const subtitle = asString(block.subtitle);
  const meta = asRecord(block.meta);
  const paddingTop = Math.max(0, Math.min(64, asNumber(meta.paddingTop, block.type === 'header' ? 24 : 12)));
  const paddingBottom = Math.max(0, Math.min(64, asNumber(meta.paddingBottom, 12)));
  const radius = Math.max(0, Math.min(24, asNumber(meta.radius, 0)));
  const backgroundColor = asString(meta.backgroundColor);
  const textColor = asString(meta.textColor) || theme.textColor;
  const links = parseResourceLinks(meta.links);
  const documents = parseResourceLinks(meta.documents);

  const sectionStyle = [
    `padding:${paddingTop}px 24px ${paddingBottom}px 24px`,
    `text-align:${align}`,
    `font-family:${theme.bodyFont}`,
    `color:${textColor}`,
    backgroundColor ? `background:${backgroundColor}` : '',
    radius > 0 ? `border-radius:${radius}px` : '',
  ]
    .filter(Boolean)
    .join(';');

  if (block.type === 'header') {
    const logo = sanitizeEmailImageUrl(block.imageUrl || '');
    return `<tr><td class="section-pad" style="${sectionStyle}">${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(asString(block.altText) || 'Logo')}" style="max-height:48px;max-width:180px;display:inline-block;margin-bottom:10px;" />` : ''}<h2 style="margin:0;font-family:${theme.headingFont};font-size:22px;line-height:1.3;color:${theme.headingColor};">${escapeHtml(title || 'Your Brand')}</h2>${subtitle ? `<p style="margin:8px 0 0 0;opacity:.85;">${escapeHtml(subtitle)}</p>` : ''}</td></tr>`;
  }

  if (block.type === 'hero') {
    return `<tr><td class="section-pad" style="${sectionStyle}"><h1 style="margin:0;font-family:${theme.headingFont};font-size:34px;line-height:1.18;color:${theme.headingColor};">${escapeHtml(title || content)}</h1>${subtitle ? `<p style="margin:12px 0 0 0;font-size:16px;line-height:1.6;">${escapeHtml(subtitle)}</p>` : ''}${content && title ? `<div style="margin-top:12px;font-size:15px;line-height:1.7;">${content}</div>` : ''}${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont)}${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont)}</td></tr>`;
  }

  if (block.type === 'text') {
    return `<tr><td class="section-pad" style="${sectionStyle};font-size:15px;line-height:1.75;">${content || '&nbsp;'}${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont)}${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont)}</td></tr>`;
  }

  if (block.type === 'image') {
    const imageUrl = sanitizeEmailImageUrl(block.imageUrl || '');
    if (!imageUrl) return '';
    const widthPercent = Math.max(20, Math.min(100, asNumber(meta.widthPercent, 100)));
    return `<tr><td class="section-pad" style="${sectionStyle}"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(asString(block.altText))}" style="width:${widthPercent}%;max-width:100%;height:auto;border-radius:${Math.max(0, Math.min(20, asNumber(meta.imageRadius, 12)))}px;" /></td></tr>`;
  }

  if (block.type === 'cta') {
    const label = asString(block.buttonLabel) || title || 'Learn more';
    const url = asString(block.buttonUrl) || '#';
    const buttonBackground = asString(meta.buttonBackgroundColor) || theme.accentColor;
    const buttonTextColor = asString(meta.buttonTextColor) || '#ffffff';
    const buttonRadius = Math.max(0, Math.min(24, asNumber(meta.buttonRadius, 10)));
    return `<tr><td class="section-pad" style="${sectionStyle}"><a href="${escapeHtml(url)}" style="display:inline-block;background:${buttonBackground};color:${buttonTextColor};text-decoration:none;padding:12px 20px;border-radius:${buttonRadius}px;font-weight:700;letter-spacing:.01em;">${escapeHtml(label)}</a>${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont)}${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont)}</td></tr>`;
  }

  if (block.type === 'divider') {
    return '<tr><td class="section-pad" style="padding:14px 24px;"><div style="height:1px;background:rgba(15,23,42,0.14);"></div></td></tr>';
  }

  return `<tr><td class="section-pad" style="${sectionStyle};font-size:12px;line-height:1.65;opacity:.82;">${content || 'Need help? Reply to this email.'}${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont)}${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont)}</td></tr>`;
}

function renderLayoutBlockText(block: EmailLayoutBlock) {
  const meta = asRecord(block.meta);
  const links = parseResourceLinks(meta.links);
  const documents = parseResourceLinks(meta.documents);

  if (block.type === 'divider') {
    return '----------------';
  }

  if (block.type === 'image') {
    return asString(block.imageUrl);
  }

  if (block.type === 'cta') {
    const label = asString(block.buttonLabel) || asString(block.title) || 'Learn more';
    const url = asString(block.buttonUrl);
    const resources = [renderResourceLinksText(links, 'Related links'), renderResourceLinksText(documents, 'Documents')]
      .filter((entry) => entry.length > 0)
      .join('\n');
    const ctaLine = url ? `${label}: ${url}` : label;
    return resources ? `${ctaLine}\n${resources}` : ctaLine;
  }

  const contentLine = stripHtml(asString(block.content) || asString(block.title) || asString(block.subtitle));
  const resources = [renderResourceLinksText(links, 'Related links'), renderResourceLinksText(documents, 'Documents')]
    .filter((entry) => entry.length > 0)
    .join('\n');
  return resources ? `${contentLine}\n${resources}` : contentLine;
}

export function deriveTemplateOutputs(layoutJson: EmailTemplateLayout, themeOverrides?: Record<string, unknown>) {
  const layout = asLayout(layoutJson);
  const theme = normalizePreviewTheme(themeOverrides);

  const rows = layout.blocks
    .map((block) => renderLayoutBlockHtml(block, theme))
    .filter((segment) => segment.length > 0)
    .join('');

  const htmlBody = `
    <style>
      @media only screen and (max-width:620px){
        .email-wrap{width:100%!important;}
        .outer-pad{padding:6px 0!important;}
        .section-pad{padding-left:10px!important;padding-right:10px!important;}
      }
    </style>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${theme.bodyBg};margin:0;padding:0;">
      <tr>
        <td class="outer-pad" align="center" style="padding:14px 10px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="email-wrap" style="width:600px;max-width:100%;background:${theme.cardBg};border-radius:12px;overflow:hidden;">
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  `.trim();

  const plainBody = layout.blocks
    .map((block) => renderLayoutBlockText(block))
    .filter((segment) => segment.length > 0)
    .join('\n\n');

  return {
    body_html_template: htmlBody,
    body_plain_template: plainBody,
    preview_html: htmlBody,
    preview_plain: plainBody,
    preview_meta: {
      block_count: layout.blocks.length,
      block_types: Array.from(new Set(layout.blocks.map((block) => block.type))),
    } as Record<string, unknown>,
  };
}

/* ─── Template APIs ───────────────────────────────────────────────────── */

export async function fetchTemplateCategories(workspaceId: string): Promise<EmailTemplateCategory[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('email_template_categories')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .is('archived_at', null)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as EmailTemplateCategory[];
}

export async function createTemplateCategory(
  workspaceId: string,
  input: Pick<EmailTemplateCategory, 'name'> &
    Partial<Pick<EmailTemplateCategory, 'slug' | 'description' | 'icon' | 'color' | 'sort_order'>>,
) {
  const sb = getSupabaseClient();
  const fallbackSlug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const { data, error } = await sb
    .from('email_template_categories')
    .insert({
      workspace_id: workspaceId,
      name: input.name,
      slug: input.slug || fallbackSlug,
      description: input.description ?? null,
      icon: input.icon ?? '📧',
      color: input.color ?? '#6366F1',
      sort_order: input.sort_order ?? 99,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as EmailTemplateCategory;
}

export async function updateTemplateCategory(
  categoryId: string,
  patch: Partial<Pick<EmailTemplateCategory, 'name' | 'slug' | 'description' | 'icon' | 'color' | 'sort_order' | 'is_active'>>,
) {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('email_template_categories')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', categoryId);

  if (error) throw new Error(error.message);
}

export async function archiveTemplateCategory(categoryId: string) {
  const sb = getSupabaseClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from('email_template_categories')
    .update({ is_active: false, archived_at: now, updated_at: now })
    .eq('id', categoryId);

  if (error) throw new Error(error.message);
}

export async function fetchTemplates(
  workspaceId: string,
  filters?: { category_id?: string; template_type?: TemplateType; use_case?: TemplateUseCase },
): Promise<EmailTemplate[]> {
  const sb = getSupabaseClient();
  let query = sb
    .from('email_templates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .is('archived_at', null);

  if (filters?.category_id) query = query.eq('category_id', filters.category_id);
  if (filters?.template_type) query = query.eq('template_type', filters.template_type);
  if (filters?.use_case) query = query.eq('use_case', filters.use_case);

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as EmailTemplate[];
}

export async function fetchTemplate(templateId: string): Promise<EmailTemplate> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('email_templates').select('*').eq('id', templateId).single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Template not found');
  return data as EmailTemplate;
}

export async function fetchWorkspaceEmailBrandTheme(workspaceId: string): Promise<EmailBrandTheme | null> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('workspace_email_brand_themes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as EmailBrandTheme | null;
}

export async function upsertWorkspaceEmailBrandTheme(workspaceId: string, patch: EmailBrandTheme) {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('workspace_email_brand_themes')
    .upsert({ workspace_id: workspaceId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id' });

  if (error) throw new Error(error.message);
}

export async function createTemplate(
  workspaceId: string,
  template: Omit<EmailTemplate, 'id' | 'workspace_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at' | 'clone_count' | 'usage_count' | 'layout_json' | 'preview_meta'> & {
    layout_json?: EmailTemplateLayout;
    theme_overrides?: Record<string, unknown>;
  },
): Promise<EmailTemplate> {
  const sb = getSupabaseClient();
  const layout = asLayout(template.layout_json ?? null);
  const derived = deriveTemplateOutputs(layout, template.theme_overrides);

  const { data, error } = await sb
    .from('email_templates')
    .insert({
      workspace_id: workspaceId,
      ...template,
      layout_json: layout,
      theme_overrides: template.theme_overrides ?? {},
      ...derived,
      template_type: template.template_type ?? 'custom',
      is_html: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as EmailTemplate;
}

export async function updateTemplate(
  templateId: string,
  patch: Partial<Omit<EmailTemplate, 'id' | 'workspace_id' | 'created_by' | 'created_at' | 'template_type' | 'is_locked' | 'clone_count' | 'usage_count'>>,
): Promise<void> {
  const sb = getSupabaseClient();

  const outgoingPatch: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (patch.layout_json) {
    const layout = asLayout(patch.layout_json);
    Object.assign(outgoingPatch, {
      layout_json: layout,
      ...deriveTemplateOutputs(layout, (patch.theme_overrides as Record<string, unknown> | undefined) ?? undefined),
    });
  }

  const { error } = await sb
    .from('email_templates')
    .update(outgoingPatch)
    .eq('id', templateId);

  if (error) throw new Error(error.message);
}

export async function cloneTemplate(
  templateId: string,
  workspaceId: string,
  newName: string,
): Promise<EmailTemplate> {
  const sb = getSupabaseClient();
  const original = await fetchTemplate(templateId);

  const { id, workspace_id, created_by, updated_by, created_at, updated_at, clone_count, usage_count, ...templateData } = original;

  const cloned = await createTemplate(workspaceId, {
    ...templateData,
    name: newName,
    is_locked: false,
    template_type: 'custom',
  });

  await sb
    .from('email_templates')
    .update({ clone_count: original.clone_count + 1, updated_at: new Date().toISOString() })
    .eq('id', templateId);

  return cloned;
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('email_templates').delete().eq('id', templateId);

  if (error) throw new Error(error.message);
}

/* ─── Asset APIs ──────────────────────────────────────────────────────── */

export async function fetchAssets(workspaceId: string, fileType?: string): Promise<EmailTemplateAsset[]> {
  const sb = getSupabaseClient();
  let query = sb.from('email_template_assets').select('*').eq('workspace_id', workspaceId);

  if (fileType) query = query.eq('file_type', fileType);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as EmailTemplateAsset[];
}

export async function uploadAsset(
  workspaceId: string,
  file: File,
  fileType: 'image' | 'document' | 'attachment',
  isLogo = false,
): Promise<EmailTemplateAsset> {
  const sb = getSupabaseClient();
  const MAX_ASSET_BYTES = 50 * 1024 * 1024;

  if (file.size <= 0) {
    throw new Error('Upload failed: empty files are not allowed.');
  }
  if (file.size > MAX_ASSET_BYTES) {
    throw new Error('Upload failed: file size exceeds the 50MB limit.');
  }

  const safeBaseName = file.name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  const formData = new FormData();
  formData.append('workspace_id', workspaceId);
  formData.append('file_type', fileType);
  formData.append('is_logo', String(isLogo));
  formData.append('filename', safeBaseName || file.name || 'asset');
  formData.append('file', file);

  const { data, error } = await sb.functions.invoke('email-assets-upload', {
    body: formData,
  });

  if (error) {
    const message = error.message || 'Unable to upload this file right now.';
    throw new Error(`Upload failed: ${message}`);
  }

  if (!data || typeof data !== 'object' || !('asset' in data)) {
    throw new Error('Upload failed: Unexpected response from upload service.');
  }

  return (data as { asset: EmailTemplateAsset }).asset;
}

export async function deleteAsset(assetId: string): Promise<void> {
  const sb = getSupabaseClient();

  const { data: asset, error: fetchError } = await sb
    .from('email_template_assets')
    .select('storage_path')
    .eq('id', assetId)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (!asset) throw new Error('Asset not found');

  const { error: deleteStorageError } = await sb.storage.from('email-assets').remove([asset.storage_path]);

  if (deleteStorageError) throw new Error(`Failed to delete file: ${deleteStorageError.message}`);

  const { error: deleteRecordError } = await sb
    .from('email_template_assets')
    .delete()
    .eq('id', assetId);

  if (deleteRecordError) throw new Error(deleteRecordError.message);
}

/* ─── Campaign APIs ───────────────────────────────────────────────────── */

export async function fetchCampaigns(workspaceId: string): Promise<EmailCampaign[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('email_campaigns')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as EmailCampaign[];
}

export async function fetchCampaign(campaignId: string): Promise<EmailCampaign> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('email_campaigns').select('*').eq('id', campaignId).single();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Campaign not found');
  return data as EmailCampaign;
}

export async function createCampaign(
  workspaceId: string,
  campaign: Omit<EmailCampaign, 'id' | 'workspace_id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at' | 'recipient_count'>,
): Promise<EmailCampaign> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('email_campaigns')
    .insert({
      workspace_id: workspaceId,
      ...campaign,
      status: campaign.status ?? 'draft',
      segment_definition: campaign.segment_definition ?? campaign.recipient_filter ?? {},
      manual_include_record_ids: campaign.manual_include_record_ids ?? [],
      manual_exclude_record_ids: campaign.manual_exclude_record_ids ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as EmailCampaign;
}

export async function updateCampaign(
  campaignId: string,
  patch: Partial<Omit<EmailCampaign, 'id' | 'workspace_id' | 'template_id' | 'created_by' | 'created_at'>>,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('email_campaigns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  if (error) throw new Error(error.message);
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('email_campaigns').delete().eq('id', campaignId);

  if (error) throw new Error(error.message);
}

export async function enumerateCampaignRecipients(
  workspaceId: string,
  campaignId: string,
  options?: {
    segment_definition?: Record<string, unknown>;
    include_record_ids?: string[];
    exclude_record_ids?: string[];
    freeze_snapshot?: boolean;
  },
): Promise<CampaignEnumerationResult> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<CampaignEnumerationResult>('email-campaign-enumerate-recipients', {
    body: {
      workspace_id: workspaceId,
      campaign_id: campaignId,
      ...options,
    },
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from campaign enumeration.');
  return data;
}

export async function sendCampaignBatch(
  workspaceId: string,
  campaignId: string,
  options?: { batch_size?: number; dry_run?: boolean },
): Promise<{ processed: number; sent: number; failed: number; suppressed: number; dry_run: boolean; stats: Record<string, number> }> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{ processed: number; sent: number; failed: number; suppressed: number; dry_run: boolean; stats: Record<string, number> }>(
    'email-campaign-send-batch',
    {
      body: {
        workspace_id: workspaceId,
        campaign_id: campaignId,
        ...options,
      },
    },
  );

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from campaign sender.');
  return data;
}

export async function fetchCampaignRecipients(
  campaignId: string,
  status?: string,
): Promise<EmailCampaignRecipient[]> {
  const sb = getSupabaseClient();
  let query = sb.from('email_campaign_recipients').select('*').eq('campaign_id', campaignId);

  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as EmailCampaignRecipient[];
}

export async function fetchCampaignStats(campaignId: string): Promise<EmailCampaignStats> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('email_campaign_stats')
    .select('*')
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    return {
      id: crypto.randomUUID(),
      workspace_id: '',
      campaign_id: campaignId,
      total_recipients: 0,
      sent_count: 0,
      failed_count: 0,
      bounced_count: 0,
      unsubscribed_count: 0,
      open_count: 0,
      click_count: 0,
      reply_count: 0,
      last_updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return data as EmailCampaignStats;
}

/* ─── Manual Send APIs ───────────────────────────────────────────────── */

export async function sendManualEmail(
  workspaceId: string,
  payload: {
    record_ids: string[];
    external_recipients?: Array<{ email: string; name?: string }>;
    fallback_recipient_name?: string;
    sender_id?: string;
    template_id?: string;
    subject_template?: string;
    body_html_template?: string;
    body_plain_template?: string;
    layout_json?: EmailTemplateLayout;
    theme_overrides?: Record<string, unknown>;
  },
) {
  const sb = getSupabaseClient();

  const { data, error } = await sb.functions.invoke<{
    manual_send_id: string;
    recipient_count: number;
    sent_count: number;
    failed_count: number;
    suppressed_count: number;
    failure_samples?: Array<{ recipient_email: string; error: string }>;
  }>('email-manual-send', {
    body: {
      workspace_id: workspaceId,
      ...payload,
    },
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from manual send function.');
  return data;
}

/* ─── Suppression APIs ───────────────────────────────────────────────── */

export async function fetchWorkspaceUnsubscribes(workspaceId: string): Promise<WorkspaceEmailUnsubscribe[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('workspace_email_unsubscribes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('unsubscribed_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as WorkspaceEmailUnsubscribe[];
}

export async function unsubscribeWorkspaceEmail(
  workspaceId: string,
  email: string,
  options?: { source?: string; reason?: string; details?: Record<string, unknown> },
) {
  const sb = getSupabaseClient();
  const normalized = normalizeEmail(email);

  if (!normalized) {
    throw new Error('A valid email is required.');
  }

  const now = new Date().toISOString();
  const { error } = await sb
    .from('workspace_email_unsubscribes')
    .upsert(
      {
        workspace_id: workspaceId,
        email: normalized,
        source: options?.source ?? 'manual',
        reason: options?.reason ?? null,
        details: options?.details ?? {},
        unsubscribed_at: now,
        resubscribed_at: null,
        updated_at: now,
      },
      { onConflict: 'workspace_id,email' },
    );

  if (error) throw new Error(error.message);
}

export async function resubscribeWorkspaceEmail(workspaceId: string, email: string) {
  const sb = getSupabaseClient();
  const normalized = normalizeEmail(email);

  if (!normalized) {
    throw new Error('A valid email is required.');
  }

  const { error } = await sb
    .from('workspace_email_unsubscribes')
    .update({
      resubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('email', normalized);

  if (error) throw new Error(error.message);
}
