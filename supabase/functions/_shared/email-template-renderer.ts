export type EmailLayoutBlockType = 'header' | 'hero' | 'text' | 'image' | 'cta' | 'divider' | 'footer';

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
  version?: number;
  blocks?: EmailLayoutBlock[];
}

export interface EmailBrandTheme {
  brandName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  bodyBgColor?: string;
  cardBgColor?: string;
  textColor?: string;
  headingFont?: string;
  bodyFont?: string;
  logoUrl?: string;
  footerCompanyName?: string;
  footerAddress?: string;
  footerContactEmail?: string;
  footerSignature?: string;
}

export interface TemplateRenderInput {
  subjectTemplate: string;
  layoutJson?: unknown;
  bodyHtmlTemplate?: string | null;
  bodyPlainTemplate?: string | null;
  baseTheme?: EmailBrandTheme | null;
  themeOverrides?: unknown;
  tokens: Record<string, string>;
}

export interface TemplateRenderResult {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export const SUPPORTED_TEMPLATE_TOKENS = [
  'lead_full_name',
  'lead_first_name',
  'lead_email',
  'workspace_name',
  'sender_name',
  'sender_email',
] as const;

const DEFAULT_THEME: Required<EmailBrandTheme> = {
  brandName: 'CoreFlow',
  primaryColor: '#1f4a8a',
  secondaryColor: '#0f172a',
  accentColor: '#2563eb',
  bodyBgColor: '#f4f6fb',
  cardBgColor: '#ffffff',
  textColor: '#1e293b',
  headingFont: 'Georgia, serif',
  bodyFont: 'Arial, sans-serif',
  logoUrl: '',
  footerCompanyName: 'CoreFlow',
  footerAddress: '',
  footerContactEmail: '',
  footerSignature: 'Powered by CoreFlow',
};

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

const TEMPLATE_TOKEN_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
const SUPPORTED_TEMPLATE_TOKEN_SET = new Set<string>(SUPPORTED_TEMPLATE_TOKENS);

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

function alignStyle(align: string) {
  if (align === 'center') return 'center';
  if (align === 'right') return 'right';
  return 'left';
}

function renderTokens(template: string, tokens: Record<string, string>) {
  let output = template;

  for (const [key, value] of Object.entries(tokens)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), value);
  }

  return output;
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function nameFromEmailLocalPart(email: string) {
  const localPart = email.includes('@') ? email.split('@')[0] : '';
  if (!localPart) return '';
  const normalized = localPart.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return titleCaseWords(normalized);
}

function normalizeDisplayName(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.includes('@')) return '';
  if (cleaned.length > 80) return '';
  if (/https?:\/\//i.test(cleaned)) return '';
  return cleaned;
}

function normalizeTheme(baseTheme?: EmailBrandTheme | null, overrides?: unknown): Required<EmailBrandTheme> {
  const merged = {
    ...DEFAULT_THEME,
    ...(baseTheme ?? {}),
    ...asRecord(overrides),
  } as Required<EmailBrandTheme>;

  return {
    ...merged,
    brandName: asString(merged.brandName) || DEFAULT_THEME.brandName,
    primaryColor: asString(merged.primaryColor) || DEFAULT_THEME.primaryColor,
    secondaryColor: asString(merged.secondaryColor) || DEFAULT_THEME.secondaryColor,
    accentColor: asString(merged.accentColor) || DEFAULT_THEME.accentColor,
    bodyBgColor: asString(merged.bodyBgColor) || DEFAULT_THEME.bodyBgColor,
    cardBgColor: asString(merged.cardBgColor) || DEFAULT_THEME.cardBgColor,
    textColor: asString(merged.textColor) || DEFAULT_THEME.textColor,
    headingFont: asString(merged.headingFont) || DEFAULT_THEME.headingFont,
    bodyFont: asString(merged.bodyFont) || DEFAULT_THEME.bodyFont,
    logoUrl: asString(merged.logoUrl),
    footerCompanyName: asString(merged.footerCompanyName) || asString(merged.brandName) || DEFAULT_THEME.footerCompanyName,
    footerAddress: asString(merged.footerAddress),
    footerContactEmail: asString(merged.footerContactEmail),
    footerSignature: asString(merged.footerSignature) || DEFAULT_THEME.footerSignature,
  };
}

function parseLayout(layoutJson: unknown): EmailLayoutBlock[] {
  const layout = asRecord(layoutJson) as EmailTemplateLayout;
  if (!Array.isArray(layout.blocks)) {
    return [];
  }

  return layout.blocks
    .map((rawBlock) => {
      const block = asRecord(rawBlock);
      const type = asString(block.type) as EmailLayoutBlockType;

      if (!['header', 'hero', 'text', 'image', 'cta', 'divider', 'footer'].includes(type)) {
        return null;
      }

      return {
        id: asString(block.id),
        type,
        content: asString(block.content),
        title: asString(block.title),
        subtitle: asString(block.subtitle),
        imageUrl: asString(block.imageUrl),
        altText: asString(block.altText),
        buttonLabel: asString(block.buttonLabel),
        buttonUrl: asString(block.buttonUrl),
        align: (asString(block.align) as 'left' | 'center' | 'right') || 'left',
        meta: asRecord(block.meta),
      } satisfies EmailLayoutBlock;
    })
    .filter((block): block is EmailLayoutBlock => Boolean(block));
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

function renderResourceLinksHtml(
  links: { label: string; url: string }[],
  title: string,
  accentColor: string,
  bodyFont: string,
  tokens: Record<string, string>,
) {
  if (links.length === 0) return '';

  const items = links
    .map((link) => {
      const label = escapeHtml(renderTokens(link.label || link.url, tokens));
      const url = escapeHtml(renderTokens(link.url, tokens));
      return `<li style="margin:0 0 6px 0;"><a href="${url}" style="color:${accentColor};text-decoration:underline;font-family:${bodyFont};">${label}</a></li>`;
    })
    .join('');

  return `<div style="margin-top:12px;"><div style="font-size:12px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;opacity:.72;">${title}</div><ul style="margin:8px 0 0 16px;padding:0;">${items}</ul></div>`;
}

function renderResourceLinksText(
  links: { label: string; url: string }[],
  title: string,
  tokens: Record<string, string>,
) {
  if (links.length === 0) return '';

  const lines = links.map((link) => {
    const label = renderTokens(link.label || link.url, tokens);
    const url = renderTokens(link.url, tokens);
    return `- ${label}: ${url}`;
  });
  return `${title}:\n${lines.join('\n')}`;
}

function extractTokensFromText(value: string, output: Set<string>) {
  TEMPLATE_TOKEN_REGEX.lastIndex = 0;
  let match = TEMPLATE_TOKEN_REGEX.exec(value);
  while (match) {
    const token = asString(match[1]);
    if (token) output.add(token);
    match = TEMPLATE_TOKEN_REGEX.exec(value);
  }
}

export function findUnsupportedTemplateTokens(input: {
  subjectTemplate?: string | null;
  bodyHtmlTemplate?: string | null;
  bodyPlainTemplate?: string | null;
  layoutJson?: unknown;
}) {
  const used = new Set<string>();

  for (const value of [input.subjectTemplate, input.bodyHtmlTemplate, input.bodyPlainTemplate]) {
    const next = asString(value);
    if (next) extractTokensFromText(next, used);
  }

  for (const block of parseLayout(input.layoutJson)) {
    for (const value of [
      block.content,
      block.title,
      block.subtitle,
      block.imageUrl,
      block.altText,
      block.buttonLabel,
      block.buttonUrl,
    ]) {
      const next = asString(value);
      if (next) extractTokensFromText(next, used);
    }

    const meta = asRecord(block.meta);
    for (const link of parseResourceLinks(meta.links)) {
      if (link.label) extractTokensFromText(link.label, used);
      extractTokensFromText(link.url, used);
    }
    for (const document of parseResourceLinks(meta.documents)) {
      if (document.label) extractTokensFromText(document.label, used);
      extractTokensFromText(document.url, used);
    }
  }

  const usedList = Array.from(used).sort((a, b) => a.localeCompare(b));
  const unsupported = usedList.filter((token) => !SUPPORTED_TEMPLATE_TOKEN_SET.has(token));

  return {
    used: usedList,
    unsupported,
  };
}

function renderBlockHtml(block: EmailLayoutBlock, tokens: Record<string, string>, theme: Required<EmailBrandTheme>) {
  const align = alignStyle(block.align || 'left');
  const title = escapeHtml(renderTokens(block.title || '', tokens));
  const subtitle = escapeHtml(renderTokens(block.subtitle || '', tokens));
  const content = renderTokens(block.content || '', tokens);
  const meta = asRecord(block.meta);
  const paddingTop = Math.max(0, Math.min(64, asNumber(meta.paddingTop, block.type === 'header' ? 24 : 12)));
  const paddingBottom = Math.max(0, Math.min(64, asNumber(meta.paddingBottom, 12)));
  const radius = Math.max(0, Math.min(24, asNumber(meta.radius, 0)));
  const backgroundColor = asString(meta.backgroundColor);
  const textColor = asString(meta.textColor) || theme.textColor;
  const links = parseResourceLinks(meta.links);
  const documents = parseResourceLinks(meta.documents);
  const sectionStyle = [
    `padding:${paddingTop}px 32px ${paddingBottom}px 32px`,
    `text-align:${align}`,
    `font-family:${theme.bodyFont}`,
    `color:${textColor}`,
    backgroundColor ? `background:${backgroundColor}` : '',
    radius > 0 ? `border-radius:${radius}px` : '',
  ]
    .filter(Boolean)
    .join(';');

  if (block.type === 'header') {
    const logo = block.imageUrl || theme.logoUrl;
    const brandName = title || escapeHtml(theme.brandName);
    return `
      <tr>
        <td style="${sectionStyle}">
          ${logo ? `<img src="${escapeHtml(logo)}" alt="Logo" style="max-height:48px;max-width:180px;display:inline-block;"/>` : ''}
          <div style="font-family:${theme.headingFont};font-size:20px;font-weight:700;color:${theme.secondaryColor};margin-top:${logo ? '12px' : '0'};">${brandName}</div>
          ${subtitle ? `<div style="font-family:${theme.bodyFont};font-size:13px;color:${theme.textColor};opacity:.8;margin-top:6px;">${subtitle}</div>` : ''}
        </td>
      </tr>
    `;
  }

  if (block.type === 'hero') {
    return `
      <tr>
        <td style="${sectionStyle}">
          <div style="font-family:${theme.headingFont};font-size:34px;line-height:1.15;font-weight:700;color:${theme.secondaryColor};">${title || escapeHtml(renderTokens(content, tokens))}</div>
          ${subtitle ? `<div style="font-family:${theme.bodyFont};font-size:15px;line-height:1.6;color:${theme.textColor};margin-top:10px;">${subtitle}</div>` : ''}
          ${content && title ? `<div style="font-family:${theme.bodyFont};font-size:15px;line-height:1.7;margin-top:10px;">${content}</div>` : ''}
          ${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont, tokens)}
          ${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont, tokens)}
        </td>
      </tr>
    `;
  }

  if (block.type === 'text') {
    return `
      <tr>
        <td style="${sectionStyle};font-size:15px;line-height:1.7;">
          ${content || '&nbsp;'}
          ${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont, tokens)}
          ${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont, tokens)}
        </td>
      </tr>
    `;
  }

  if (block.type === 'image') {
    const url = block.imageUrl || '';
    if (!url) return '';

    return `
      <tr>
        <td style="${sectionStyle}">
          <img src="${escapeHtml(renderTokens(url, tokens))}" alt="${escapeHtml(block.altText || '')}" style="width:${Math.max(20, Math.min(100, asNumber(meta.widthPercent, 100)))}%;max-width:100%;height:auto;border-radius:${Math.max(0, Math.min(24, asNumber(meta.imageRadius, 12)))}px;display:inline-block;" />
        </td>
      </tr>
    `;
  }

  if (block.type === 'cta') {
    const label = title || escapeHtml(renderTokens(block.buttonLabel || 'Learn more', tokens));
    const url = escapeHtml(renderTokens(block.buttonUrl || '#', tokens));
    const buttonBackground = asString(meta.buttonBackgroundColor) || theme.accentColor;
    const buttonTextColor = asString(meta.buttonTextColor) || '#fff';
    const buttonRadius = Math.max(0, Math.min(24, asNumber(meta.buttonRadius, 10)));

    return `
      <tr>
        <td style="${sectionStyle}">
          <a href="${url}" style="display:inline-block;background:${buttonBackground};color:${buttonTextColor};text-decoration:none;font-family:${theme.bodyFont};font-size:14px;font-weight:700;padding:12px 20px;border-radius:${buttonRadius}px;">${label}</a>
          ${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont, tokens)}
          ${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont, tokens)}
        </td>
      </tr>
    `;
  }

  if (block.type === 'divider') {
    return `
      <tr>
        <td style="padding:16px 32px;">
          <div style="height:1px;background:rgba(15,23,42,0.12);"></div>
        </td>
      </tr>
    `;
  }

  const footerLine = [theme.footerCompanyName, theme.footerAddress, theme.footerContactEmail]
    .filter((value) => value.length > 0)
    .join(' • ');

  return `
    <tr>
      <td style="${sectionStyle};font-size:12px;line-height:1.6;opacity:.72;">
        ${content ? `<div>${renderTokens(content, tokens)}</div>` : ''}
        ${footerLine ? `<div>${escapeHtml(footerLine)}</div>` : ''}
        <div>${escapeHtml(theme.footerSignature)}</div>
        ${renderResourceLinksHtml(links, 'Related links', theme.accentColor, theme.bodyFont, tokens)}
        ${renderResourceLinksHtml(documents, 'Documents', theme.accentColor, theme.bodyFont, tokens)}
      </td>
    </tr>
  `;
}

function renderBlockText(block: EmailLayoutBlock, tokens: Record<string, string>, theme: Required<EmailBrandTheme>) {
  const title = renderTokens(block.title || '', tokens);
  const subtitle = renderTokens(block.subtitle || '', tokens);
  const content = renderTokens(block.content || '', tokens);
  const meta = asRecord(block.meta);
  const links = parseResourceLinks(meta.links);
  const documents = parseResourceLinks(meta.documents);

  if (block.type === 'header') {
    return [
      title || theme.brandName,
      subtitle,
      renderResourceLinksText(links, 'Related links', tokens),
      renderResourceLinksText(documents, 'Documents', tokens),
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (block.type === 'hero') {
    return [
      title || content,
      subtitle,
      renderResourceLinksText(links, 'Related links', tokens),
      renderResourceLinksText(documents, 'Documents', tokens),
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (block.type === 'text') {
    return [stripHtml(content), renderResourceLinksText(links, 'Related links', tokens), renderResourceLinksText(documents, 'Documents', tokens)]
      .filter(Boolean)
      .join('\n');
  }

  if (block.type === 'image') {
    return renderTokens(block.imageUrl || '', tokens);
  }

  if (block.type === 'cta') {
    const label = title || renderTokens(block.buttonLabel || 'Learn more', tokens);
    const url = renderTokens(block.buttonUrl || '', tokens);
    return [
      [label, url].filter(Boolean).join(': '),
      renderResourceLinksText(links, 'Related links', tokens),
      renderResourceLinksText(documents, 'Documents', tokens),
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (block.type === 'divider') {
    return '----------------';
  }

  const footerLine = [theme.footerCompanyName, theme.footerAddress, theme.footerContactEmail]
    .filter((value) => value.length > 0)
    .join(' | ');

  return [
    stripHtml(content),
    footerLine,
    theme.footerSignature,
    renderResourceLinksText(links, 'Related links', tokens),
    renderResourceLinksText(documents, 'Documents', tokens),
  ]
    .filter(Boolean)
    .join('\n');
}

function renderLayoutHtml(layout: EmailLayoutBlock[], tokens: Record<string, string>, theme: Required<EmailBrandTheme>) {
  const renderedBlocks = layout
    .map((block) => renderBlockHtml(block, tokens, theme))
    .filter((value) => value.trim().length > 0)
    .join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${theme.bodyBgColor};padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="width:640px;max-width:100%;background:${theme.cardBgColor};border-radius:16px;overflow:hidden;">
            ${renderedBlocks}
          </table>
        </td>
      </tr>
    </table>
  `.trim();
}

function renderLayoutText(layout: EmailLayoutBlock[], tokens: Record<string, string>, theme: Required<EmailBrandTheme>) {
  return layout
    .map((block) => renderBlockText(block, tokens, theme))
    .filter((value) => value.trim().length > 0)
    .join('\n\n');
}

export function renderTemplateContent(input: TemplateRenderInput): TemplateRenderResult {
  const theme = normalizeTheme(input.baseTheme, input.themeOverrides);
  const subject = renderTokens(input.subjectTemplate || '', input.tokens).trim();
  const layoutBlocks = parseLayout(input.layoutJson);

  if (layoutBlocks.length > 0) {
    const bodyHtml = renderLayoutHtml(layoutBlocks, input.tokens, theme);
    const bodyText = renderLayoutText(layoutBlocks, input.tokens, theme);
    return { subject, bodyHtml, bodyText };
  }

  const htmlTemplate = asString(input.bodyHtmlTemplate);
  const textTemplate = asString(input.bodyPlainTemplate);

  const bodyHtml = htmlTemplate
    ? renderTokens(htmlTemplate, input.tokens)
    : `<p>${escapeHtml(renderTokens(textTemplate, input.tokens))}</p>`;

  const bodyText = textTemplate
    ? renderTokens(textTemplate, input.tokens)
    : stripHtml(bodyHtml);

  return {
    subject,
    bodyHtml,
    bodyText,
  };
}

export function buildRecipientTokens(params: {
  leadFullName?: string | null;
  leadEmail?: string | null;
  workspaceName?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  fallbackLeadName?: string | null;
}) {
  const leadEmail = asString(params.leadEmail);
  const explicitLeadName = normalizeDisplayName(asString(params.leadFullName));
  const fallbackLeadName = normalizeDisplayName(asString(params.fallbackLeadName));
  const emailDerivedName = nameFromEmailLocalPart(leadEmail);
  const resolvedLeadFullName = explicitLeadName || fallbackLeadName || emailDerivedName || 'there';
  const leadFirstName = resolvedLeadFullName.split(/\s+/).filter(Boolean)[0] || 'there';

  return {
    lead_full_name: resolvedLeadFullName,
    lead_first_name: leadFirstName,
    lead_email: leadEmail,
    workspace_name: asString(params.workspaceName) || 'Your Workspace',
    sender_name: asString(params.senderName) || 'CoreFlow Team',
    sender_email: asString(params.senderEmail),
  };
}
